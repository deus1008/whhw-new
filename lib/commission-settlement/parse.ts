/**
 * 수수료정산 Excel 파일 파싱 유틸리티
 * 컬럼: 정산월 | 내부담당자 | 담당CSO | 처방처명 | 품목명 |
 *       승인수량 | T당 단가 | 처방금액 | 종별구분 | 합산수수료 | 정산액
 *
 * 컬럼 인덱스는 DB의 parse_settings 테이블 (key='settlement_columns') 에서 관리.
 * route.ts 에서 설정을 읽어 SettlementColConfig 로 전달하면 그 값을 우선 사용하고,
 * 미전달 시 아래 DEFAULT_COL_CONFIG 를 사용(초기화·테스트 등 폴백용).
 */
import * as XLSX from 'xlsx';
import { toInsuranceCode } from '@/lib/products/insurance-code';

export type SettlementRow = {
  source_file:         string;
  settlement_month:    string | null;   // 파일명에서 추출한 정산월 (YYYY-MM)
  prescription_month:  string | null;   // 파일명에서 추출한 처방월 (YYYY-MM)
  manager:             string | null;
  cso_name:            string | null;
  hospital_name:       string | null;
  product_name:        string | null;
  insurance_code:      string | null;   // 대표코드→9자리 보험코드
  approved_qty:        number | null;
  unit_price:          number | null;
  prescription_amount: number | null;
  hospital_category:   string | null;  // X열: 기조실병의원구분 (의원/병원 등 대분류)
  hospital_type:       string | null;  // W열: 종별구분 (세분류)
  commission_rate:     number | null;  // % 단위 (예: 18.0)
  settlement_amount:   number | null;
};

export type ParseSettlementResult = {
  rows:  SettlementRow[];
  total: number;
  error?: string;
  detectedCols?: Record<string, string | number>;
};

/**
 * DB parse_settings.settlement_columns 와 1:1 대응하는 컬럼 설정 타입.
 * 모든 필드는 optional — 미지정 시 DEFAULT_COL_CONFIG 값이 사용됨.
 */
export type SettlementColConfig = {
  hosp_col?:  number;  // 처방처명  (기본: L=11)
  mgr_col?:   number;  // 내부담당자 (기본: G=6)
  cso_col?:   number;  // 담당CSO   (기본: I=8)
  prod_col?:  number;  // 품목명    (기본: Q=16)
  presc_col?: number;  // 처방금액   (기본: U=20)
  type_col?:  number;  // 종별구분   (기본: W=22)
  cat_col?:   number;  // 병원구분   (기본: X=23)
  sett_col?:  number;  // 정산액    (기본: AD=29)
};

/** DB 설정이 없을 때 사용하는 기본값 (2026-04 처방 파일 검증 완료) */
const DEFAULT_COL_CONFIG: Required<SettlementColConfig> = {
  hosp_col:  11,
  mgr_col:   6,
  cso_col:   8,
  prod_col:  16,
  presc_col: 20,
  type_col:  22,
  cat_col:   23,
  sett_col:  29,
};

/* ── 컬럼 키워드 ── */
const MONTH_KW  = ['정산월','처방월','월','month'];
const MGR_KW    = ['내부담당자','담당자','사원','내부사원','내부담당','내부직원'];
const CSO_KW    = ['담당cso','cso명','cso담당자','cso','담당cso명'];
const HOSP_KW   = ['처방처명','처방처','병원명','요양기관명'];
const PROD_KW   = ['품목명','제품명','품명','item'];
const QTY_KW    = ['승인수량','수량','승인량','처방수량','qty'];
const UNIT_KW   = ['t당단가','t당 단가','단가','약가','unitprice'];
const PRESC_KW  = ['처방금액','처방액','처방총액'];
const TYPE_KW   = ['종별구분','종별','병원구분','종류구분'];
const RATE_KW   = ['합산수수료','수수료율','수수료','합산요율','요율','commission','rate'];
const SETT_KW   = ['정산액','정산금액','지급액','지급금액','정산'];
const CODE_KW   = ['보험코드','청구코드','대표코드','표준코드'];

function norm(s: string): string {
  return String(s ?? '').replace(/[\s\r\n_\-\.:% ]/g, '').toLowerCase();
}

function matchKw(cell: string, kws: string[]): boolean {
  const nc = norm(cell);
  if (!nc || nc.length < 1) return false;
  return kws.some(k => {
    const nk = norm(k);
    return nc === nk || nc.includes(nk) || nk.includes(nc);
  });
}

function findColIdx(headerRow: unknown[], kws: string[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (matchKw(String(headerRow[i] ?? ''), kws)) return i;
  }
  return -1;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace(/[,%\s원]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function toRate(v: unknown): number | null {
  const n = toNum(v);
  if (n === null) return null;
  // 0~1 범위이면 % 단위로 변환
  if (n > 0 && n <= 1) return Math.round(n * 10000) / 100;
  return Math.round(n * 100) / 100;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

/** 정산월 정규화: "2026-05", "202605", "2026.05", "2026년 5월" → "2026-05" */
function normMonth(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  // "2026-05" 형식
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  // "202605" 형식
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4)}`;
  // "2026.05" 형식
  const dotM = s.match(/^(\d{4})\.(\d{1,2})$/);
  if (dotM) return `${dotM[1]}-${dotM[2].padStart(2, '0')}`;
  // 숫자 날짜 (Excel serial)
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  if (!isNaN(n) && n > 40000 && n < 60000) {
    // Excel date serial → JS date
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return s || null;
}

/**
 * 파일명에서 정산월·처방월 추출
 *
 * 지원 형식
 *   신형: 판매대행수수료정산_26.06정산_26.04처방.xlsx  → { settlement:'2026-06', prescription:'2026-04' }
 *   구형: 판매대행수수료정산_26.04처방_06지급.xlsx     → { settlement:'2026-06', prescription:'2026-04' }
 *         (지급월의 연도는 처방월 연도와 동일하게 처리)
 */
function parseMonthsFromFilename(fileName: string): { settlement: string | null; prescription: string | null } {
  const base = fileName.replace(/\.xlsx?$/i, '');

  // YY.MM 정산 패턴
  const settMatch = base.match(/(\d{2})\.(\d{2})\s*정산/);
  // YY.MM 처방 패턴
  const prescMatch = base.match(/(\d{2})\.(\d{2})\s*처방/);

  const toMonth = (yy: string, mm: string) => `20${yy}-${mm.padStart(2, '0')}`;

  if (settMatch && prescMatch) {
    // 신형: 둘 다 YY.MM 포함
    return {
      settlement:   toMonth(settMatch[1],  settMatch[2]),
      prescription: toMonth(prescMatch[1], prescMatch[2]),
    };
  }

  if (prescMatch) {
    // 구형: 처방은 YY.MM, 지급(정산)은 MM만 존재할 수 있음
    const jigupMatch = base.match(/[_\-](\d{2})지급/);
    const settlement = jigupMatch
      ? toMonth(prescMatch[1], jigupMatch[1])   // 연도는 처방월과 동일
      : null;
    return { settlement, prescription: toMonth(prescMatch[1], prescMatch[2]) };
  }

  return { settlement: null, prescription: null };
}

export function parseSettlementBuffer(
  buffer: Buffer,
  fileName: string,
  colConfig?: SettlementColConfig,
): ParseSettlementResult {
  // DB 설정 + 기본값 병합 (DB 값 우선)
  const cfg: Required<SettlementColConfig> = { ...DEFAULT_COL_CONFIG, ...colConfig };
  let wb: ReturnType<typeof XLSX.read>;
  try {
    wb = XLSX.read(buffer, {
      type: 'buffer', cellFormula: false, cellHTML: false,
      cellNF: false, cellText: false, cellDates: false,
    });
  } catch {
    return { rows: [], total: 0, error: 'Excel 파싱 실패' };
  }

  const ALL_KWS = [MONTH_KW, MGR_KW, CSO_KW, HOSP_KW, PROD_KW, QTY_KW, UNIT_KW, PRESC_KW, TYPE_KW, RATE_KW, SETT_KW];

  /* ── 전체 시트 중 키워드 매칭 점수가 가장 높은 시트 선택 ── */
  let allRows: unknown[][] = [];
  let bestSheetScore = -1;
  let bestSheetName  = wb.SheetNames[0];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    // 상위 20행에서 헤더 후보 찾기
    for (let ri = 0; ri < Math.min(rows.length, 20); ri++) {
      const row = rows[ri];
      const nonEmpty = row.filter(c => String(c ?? '').trim().length >= 1).length;
      if (nonEmpty < 3) continue;
      let score = 0;
      for (const kws of ALL_KWS) {
        if (findColIdx(row, kws) >= 0) score++;
      }
      // 동점이면 더 많은 데이터행(rows.length)을 가진 시트 우선
      if (score > bestSheetScore || (score === bestSheetScore && rows.length > allRows.length)) {
        bestSheetScore = score;
        bestSheetName  = sheetName;
        allRows        = rows;
      }
    }
  }

  console.log(`[settlement-parse] 선택 시트: "${bestSheetName}" (스코어:${bestSheetScore}, 행수:${allRows.length})`);

  if (allRows.length === 0) return { rows: [], total: 0, error: '데이터 없음' };

  /* ── 헤더 행 탐색 (상위 20행) ── */
  let headerRowIdx = 0;
  let bestScore    = 0;

  for (let ri = 0; ri < Math.min(allRows.length, 20); ri++) {
    const row = allRows[ri];
    const nonEmpty = row.filter(c => String(c ?? '').trim().length >= 1).length;
    if (nonEmpty < 3) continue;
    let score = 0;
    for (const kws of ALL_KWS) {
      if (findColIdx(row, kws) >= 0) score++;
    }
    if (score > bestScore) { bestScore = score; headerRowIdx = ri; }
  }

  const headerRow  = allRows[headerRowIdx];
  const dataRows   = allRows.slice(headerRowIdx + 1);

  /* ── 헤더 전체 출력 (진단용) ── */
  console.log(
    `[settlement-parse] 파일:${fileName}, 헤더행:${headerRowIdx}, 스코어:${bestScore}`,
    `\n  헤더전체(${headerRow.length}열):`,
    headerRow.map((c, i) => `[${i}]${c}`).join(' | '),
  );

  const monthIdx = findColIdx(headerRow, MONTH_KW);
  const qtyIdx   = findColIdx(headerRow, QTY_KW);
  const unitIdx  = findColIdx(headerRow, UNIT_KW);
  const codeIdx  = findColIdx(headerRow, CODE_KW);   // 대표코드/보험코드

  // ── DB 설정값(cfg) 우선 사용, 헤더가 짧으면 키워드 탐색으로 폴백 ───────────
  // 내부담당자: G열(cfg.mgr_col=6)
  const mgrIdx   = headerRow.length > cfg.mgr_col  ? cfg.mgr_col  : findColIdx(headerRow, MGR_KW);
  // 담당CSO: I열(cfg.cso_col=8)
  const csoIdx   = headerRow.length > cfg.cso_col  ? cfg.cso_col  : findColIdx(headerRow, CSO_KW);
  // 처방처명: L열(cfg.hosp_col=11) — DB에서 관리되는 핵심 설정
  const hospIdx  = headerRow.length > cfg.hosp_col ? cfg.hosp_col : findColIdx(headerRow, HOSP_KW);
  // 품목명: Q열(cfg.prod_col=16)
  const prodIdx  = headerRow.length > cfg.prod_col ? cfg.prod_col : findColIdx(headerRow, PROD_KW);
  // 처방금액: U열(cfg.presc_col=20)
  const prescIdx = headerRow.length > cfg.presc_col ? cfg.presc_col : findColIdx(headerRow, PRESC_KW);
  // 종별구분(세분류): W열(cfg.type_col=22)
  const typeIdx  = headerRow.length > cfg.type_col ? cfg.type_col : findColIdx(headerRow, TYPE_KW);
  // 기조실병의원구분(대분류): X열(cfg.cat_col=23)
  const catIdx   = headerRow.length > cfg.cat_col  ? cfg.cat_col  : -1;
  // 정산액: AD열(cfg.sett_col=29)
  const settIdx  = headerRow.length > cfg.sett_col ? cfg.sett_col : findColIdx(headerRow, SETT_KW);

  /* ── 진단 로그: hosp_col 주변 실제 데이터 값 ── */
  const firstDataRow = dataRows[0] ?? [];
  const dumpStart = Math.max(0, cfg.hosp_col - 3);
  const colDump = Array.from({ length: 9 }, (_, k) => {
    const i = dumpStart + k;
    const h = String(headerRow[i] ?? '');
    const v = String(firstDataRow[i] ?? '');
    return `[${i}]헤더="${h}" 값="${v}"`;
  }).join('\n    ');
  console.log(
    `[settlement-parse] 파일:${fileName} — hosp열(${cfg.hosp_col}) 주변 데이터:`,
    `\n    ${colDump}`,
    `\n  → 사용 컬럼(DB cfg): hosp=${cfg.hosp_col} mgr=${cfg.mgr_col} cso=${cfg.cso_col}`,
    `\n    presc=${cfg.presc_col} type=${cfg.type_col} cat=${cfg.cat_col} sett=${cfg.sett_col}`,
    `\n  → 실제 인덱스: hosp=${hospIdx} mgr=${mgrIdx} cso=${csoIdx} presc=${prescIdx} type=${typeIdx} cat=${catIdx} sett=${settIdx}`,
  );

  if (settIdx < 0 && prescIdx < 0) {
    const cols = headerRow.slice(0, 30).map(c => String(c ?? '').trim()).filter(Boolean);
    return { rows: [], total: 0, error: `정산액·처방금액 컬럼 미감지. 컬럼: [${cols.join(', ')}]` };
  }

  // ── 파일명에서 정산월·처방월 추출 (엑셀 컬럼보다 우선) ──
  const { settlement: fileSettMonth, prescription: filePrescMonth } = parseMonthsFromFilename(fileName);
  console.log(`[settlement-parse] 파일명 파싱: 정산월=${fileSettMonth ?? '미감지'}, 처방월=${filePrescMonth ?? '미감지'}`);

  // dataRows는 위에서 이미 선언됨 (처방처명 샘플 로그에서 사용)
  const rows: SettlementRow[] = [];

  for (const row of dataRows) {
    // 정산액 또는 처방금액이 없으면 스킵
    const sett  = toNum(settIdx  >= 0 ? row[settIdx]  : null);
    const presc = toNum(prescIdx >= 0 ? row[prescIdx] : null);
    if (sett === null && presc === null) continue;

    // 수수료율: 정산액 / 처방금액 × 100 (계산값)
    const rate = (presc != null && presc !== 0 && sett != null)
      ? Math.round((sett / presc) * 10000) / 100
      : null;

    rows.push({
      source_file:         fileName,
      // 정산월·처방월: 파일명 우선, 없으면 엑셀 컬럼 폴백
      settlement_month:    fileSettMonth  ?? normMonth(monthIdx >= 0 ? row[monthIdx] : null),
      prescription_month:  filePrescMonth ?? null,
      manager:             str(mgrIdx   >= 0 ? row[mgrIdx]   : null),
      cso_name:            str(csoIdx   >= 0 ? row[csoIdx]   : null),
      hospital_name:       str(hospIdx  >= 0 ? row[hospIdx]  : null),
      product_name:        str(prodIdx  >= 0 ? row[prodIdx]  : null),
      insurance_code:      codeIdx >= 0 ? (toInsuranceCode(str(row[codeIdx]) ?? '') || null) : null,
      approved_qty:        toInt(qtyIdx  >= 0 ? row[qtyIdx]  : null),
      unit_price:          toNum(unitIdx >= 0 ? row[unitIdx] : null),
      prescription_amount: presc,
      hospital_category:   str(catIdx   >= 0 ? row[catIdx]   : null),
      hospital_type:       str(typeIdx  >= 0 ? row[typeIdx]  : null),
      commission_rate:     rate,
      settlement_amount:   sett,
    });
  }

  console.log(`[settlement-parse] 유효행: ${rows.length}/${dataRows.length}`);
  return {
    rows, total: dataRows.length,
    detectedCols: { monthIdx, mgrIdx, csoIdx, hospIdx, prodIdx, qtyIdx, unitIdx, prescIdx, typeIdx, catIdx, settIdx },
  };
}
