/**
 * Ubist 처방 데이터 Excel 파싱 유틸리티
 *
 * 지원 포맷:
 *   1. Long format: 기간 컬럼 별도 존재, 처방금액 컬럼 별도
 *   2. Wide format (Ubist D1): 헤더 행에 기간이 컬럼명으로 옴
 *      예) ATC | 제품 | 제조사 | 성분 | 종별 | 2025년 3월
 *          → "2025년 3월" 컬럼이 처방금액 컬럼이고 기간 정보도 포함
 */
import * as XLSX from 'xlsx';

export type UbistRow = {
  source_file:         string;
  document_id?:        string | null;
  period:              string | null;       // YYYY-MM
  ingredient_name:     string | null;
  product_name:        string | null;
  manufacturer:        string | null;
  hospital_type:       string | null;
  region:              string | null;
  prescription_amount: number | null;       // 원 단위 정수
  prescription_count:  number | null;
};

export type ParseUbistResult = {
  rows:  UbistRow[];
  total: number;
  error?: string;
};

/* ── 컬럼 키워드 ── */
const PERIOD_KW     = ['기간','연월','년월','월','period','yyyymm','연도','date'];
const INGR_KW       = ['성분명','성분','ingredient','inn','주성분','성분코드명'];
const PROD_KW       = ['제품명','품목명','상품명','brand','제품','품목','상품'];
const MFR_KW        = ['제조사','제약사','회사명','회사','manufacturer','메이커','공급사'];
const HOSP_KW       = ['병원구분','의료기관종별','종별구분','병원종류','구분','종별'];
const REGION_KW     = ['지역','시도','지역명','region','광역'];
const AMOUNT_KW     = ['처방금액','처방조제액','금액','처방액','amount','처방매출','매출액','처방총액','측정치'];
const COUNT_KW      = ['처방건수','건수','처방수','count','rx건수','건'];

function norm(s: unknown): string {
  return String(s ?? '').replace(/[\s\r\n_\-\.\:%()\[\] ]/g, '').toLowerCase();
}

function matchKw(cell: string, kws: string[]): boolean {
  const n = norm(cell);
  return kws.some(k => n.includes(norm(k)));
}

/** 시트명에서 YYYY-MM 형태 추출 */
function periodFromSheetName(name: string): string | null {
  // 4자리 연도 형태: "2026-01", "202601", "2026년1월", "2026.01"
  const m1 = name.match(/(\d{4})[-\.\s년_]?(\d{1,2})월?/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}`;
  return null;
}

/** 파일명에서 YY.MM 또는 YYYY.MM 형태 추출 (예: _25.03 → 2025-03) */
function periodFromFilename(filename: string): string | null {
  // "_YYYY.MM" 형태
  const m4 = filename.match(/_(\d{4})\.(\d{2})\b/);
  if (m4) return `${m4[1]}-${m4[2]}`;
  // "_YY.MM" 형태 (26.05 → 2026-05)
  const m2 = filename.match(/_(\d{2})\.(\d{2})\b/);
  if (m2) {
    const year = parseInt(m2[1]) >= 90 ? `19${m2[1]}` : `20${m2[1]}`;
    return `${year}-${m2[2]}`;
  }
  return null;
}

/** 셀 값을 숫자로 변환 (콤마·공백 제거) */
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : Math.round(n);
}

/** 기간 셀/헤더를 YYYY-MM 형태로 정규화 */
function normalizePeriod(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[^\d년월\-\.]/g, '').trim();
  // 202601 형태
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  // 2026-01 또는 2026.01 형태 (연도-월 또는 연도.월, 일 포함 가능 → 앞 2부분만)
  const m = s.match(/^(\d{4})[-\.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  // 2026년01월 형태
  const m2 = s.match(/^(\d{4})년(\d{1,2})월?$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}`;
  // Excel 날짜 시리얼 처리
  if (/^\d+$/.test(s)) {
    const serial = parseInt(s);
    if (serial > 40000 && serial < 60000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
  }
  return null;
}

export function parseUbistBuffer(
  buffer: Buffer,
  filename: string,
  documentId?: string,
): ParseUbistResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch (e) {
    return { rows: [], total: 0, error: `Excel 파일 읽기 실패: ${String(e)}` };
  }

  // 파일명에서 기간 추출 (폴백용)
  const filenamePeriod = periodFromFilename(filename);

  const allRows: UbistRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (raw.length < 2) continue;

    // 시트명에서 기간 추출
    const sheetPeriod = periodFromSheetName(sheetName);

    // 헤더 행 탐색 (처음 10행에서 '제품명' 또는 '성분명' 포함 행 찾기)
    // AMOUNT_KW만 있는 행(예: 레이블 행)은 제외
    let headerRow = -1;
    for (let r = 0; r < Math.min(10, raw.length); r++) {
      const rowCells = (raw[r] as unknown[]).map(c => String(c ?? ''));
      if (rowCells.some(c => matchKw(c, PROD_KW) || matchKw(c, INGR_KW))) {
        headerRow = r;
        break;
      }
    }
    if (headerRow === -1) continue;

    const headers = (raw[headerRow] as unknown[]).map(c => String(c ?? ''));

    // 컬럼 인덱스 매핑
    let periodCol = -1, ingrCol = -1, prodCol = -1, mfrCol = -1;
    let hospCol = -1, regionCol = -1, amountCol = -1, countCol = -1;

    headers.forEach((h, i) => {
      // 헤더 자체가 기간 값(예: "2025년 3월")이면 wide-format 금액 컬럼 — period 컬럼으로 잡지 않음
      if (periodCol  === -1 && matchKw(h, PERIOD_KW) && !normalizePeriod(h))  periodCol  = i;
      if (ingrCol    === -1 && matchKw(h, INGR_KW))    ingrCol    = i;
      if (prodCol    === -1 && matchKw(h, PROD_KW))    prodCol    = i;
      if (mfrCol     === -1 && matchKw(h, MFR_KW))     mfrCol     = i;
      if (hospCol    === -1 && matchKw(h, HOSP_KW))    hospCol    = i;
      if (regionCol  === -1 && matchKw(h, REGION_KW))  regionCol  = i;
      if (amountCol  === -1 && matchKw(h, AMOUNT_KW))  amountCol  = i;
      if (countCol   === -1 && matchKw(h, COUNT_KW))   countCol   = i;
    });

    // ── Wide-format 감지: 금액 컬럼명이 기간인 경우 ──────────────────────
    // Ubist D1 파일처럼 "2025년 3월" 같은 기간이 컬럼명인 경우
    type PeriodAmountCol = { col: number; period: string };
    const wideAmountCols: PeriodAmountCol[] = [];

    if (amountCol === -1) {
      const fixedCols = new Set([periodCol, ingrCol, prodCol, mfrCol, hospCol, regionCol, countCol].filter(c => c >= 0));
      headers.forEach((h, i) => {
        if (fixedCols.has(i)) return;
        const candidate = normalizePeriod(h);
        if (candidate) wideAmountCols.push({ col: i, period: candidate });
      });
    }

    // 처방금액 컬럼도 제품명도 없으면 건너뜀
    if (amountCol === -1 && wideAmountCols.length === 0 && prodCol === -1) continue;

    for (let r = headerRow + 1; r < raw.length; r++) {
      const row = raw[r] as unknown[];
      if (row.every(c => c == null || String(c).trim() === '')) continue;

      const productName = prodCol >= 0 ? (String(row[prodCol] ?? '')).trim() || null : null;
      const ingrName    = ingrCol >= 0 ? (String(row[ingrCol] ?? '')).trim() || null : null;

      if (!productName && !ingrName) continue;

      const mfr      = mfrCol    >= 0 ? (String(row[mfrCol]    ?? '')).trim() || null : null;
      const hospType = hospCol   >= 0 ? (String(row[hospCol]   ?? '')).trim() || null : null;
      const region   = regionCol >= 0 ? (String(row[regionCol] ?? '')).trim() || null : null;

      if (wideAmountCols.length > 0) {
        // Wide format: 기간 컬럼별로 행 생성
        for (const { col, period } of wideAmountCols) {
          const amount = toNum(row[col]);
          // 금액이 0이거나 null인 행도 포함 (필터는 분석 단계에서)
          allRows.push({
            source_file:         filename,
            document_id:         documentId ?? null,
            period,
            ingredient_name:     ingrName,
            product_name:        productName,
            manufacturer:        mfr,
            hospital_type:       hospType,
            region,
            prescription_amount: amount,
            prescription_count:  countCol >= 0 ? toNum(row[countCol]) : null,
          });
        }
      } else {
        // Long format: 기간 컬럼 별도 존재
        const rawPeriod = periodCol >= 0 ? normalizePeriod(row[periodCol]) : null;
        const period    = rawPeriod ?? sheetPeriod ?? filenamePeriod;
        const amount    = amountCol >= 0 ? toNum(row[amountCol]) : null;
        const count     = countCol  >= 0 ? toNum(row[countCol])  : null;

        allRows.push({
          source_file:         filename,
          document_id:         documentId ?? null,
          period,
          ingredient_name:     ingrName,
          product_name:        productName,
          manufacturer:        mfr,
          hospital_type:       hospType,
          region,
          prescription_amount: amount,
          prescription_count:  count,
        });
      }
    }
  }

  return { rows: allRows, total: allRows.length };
}
