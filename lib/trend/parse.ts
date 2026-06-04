/**
 * 처방실적 트렌드 XLSB/XLSX 파일 파싱
 * 컬럼 매핑: 처방월 | 내부담당자 | 담당CSO | 처방처명 | 품목명 | 종별구분 | 합산수수료 | 처방금액
 */
import * as XLSX from 'xlsx';

export type TrendRow = {
  source_file:          string;
  prescription_month:   string | null;   // YYYYMM
  sales_rep:            string | null;
  cso_name:             string | null;
  hospital_name:        string | null;
  product_name:         string | null;
  hospital_type:        string | null;
  commission_rate:      number | null;
  commission_tier:      string | null;
  prescription_amount:  number | null;
};

/* ── 처방월 정규화 → YYYYMM
   처리 형식:
   - Excel 시리얼 숫자: 46078 → 202603
   - YYYYMM 문자열: "202601"
   - YYYYMMDD: "20260101"
   - 구분자 포함: "2026-01", "2026/01", "2026.01"
   - Date 객체
── */
function normalizeMonth(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  // Date 객체
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    return `${y}${m}`;
  }

  // Excel 시리얼 날짜 숫자 (약 40000~50000 범위: 2009~2036년)
  if (typeof raw === 'number') {
    if (raw > 40000 && raw < 55000) {
      const date = new Date((raw - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        return `${y}${m}`;
      }
    }
    // 숫자형 YYYYMM (e.g., 202601)
    const ns = String(Math.round(raw));
    if (ns.length === 6) return ns;
    if (ns.length === 8) return ns.slice(0, 6);
    return null;
  }

  // 문자열 처리
  const str = String(raw).trim();
  const digits = str.replace(/[^\d]/g, '');
  if (digits.length === 6) return digits;           // "202601" or "2026-01" → 202601
  if (digits.length === 8) return digits.slice(0, 6); // "2026-01-01"
  return str || null;
}

/* ── 수수료 구간 ── */
function getCommissionTier(rate: number | null): string | null {
  if (rate === null || isNaN(rate)) return null;
  if (rate <  10) return '10% 미만';
  if (rate <  20) return '10%~20%';
  if (rate <  30) return '20%~30%';
  if (rate <  40) return '30%~40%';
  if (rate <  50) return '40%~50%';
  return '50% 이상';
}

/* ── 숫자 파싱 (콤마·%·원화 제거, 괄호 → 음수) ── */
function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v ?? '').replace(/[,%₩\s원]/g, '').trim();
  if (!s) return null;
  // 괄호 표현 음수: (1234) → -1234
  const neg = s.startsWith('(') && s.endsWith(')');
  const clean = neg ? s.slice(1, -1) : s;
  const n = parseFloat(clean);
  return isNaN(n) ? null : (neg ? -n : n);
}

function parseStr(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

/* ── 파일명에서 연월 추출 ──
   "EDI현황조회_2026-04.xlsx" → "202604"
   "처방실적_2025.08.xlsx"   → "202508"
   "data_202506.xlsx"         → "202506"
── */
function monthFromFileName(fileName: string): string | null {
  // YYYY-MM 또는 YYYY.MM 패턴
  const m1 = fileName.match(/(\d{4})[-.](\d{2})/);
  if (m1) return `${m1[1]}${m1[2]}`;
  // YYYYMM 6자리 패턴
  const m2 = fileName.match(/(\d{6})/);
  if (m2) return m2[1];
  return null;
}

export type ParseTrendResult = {
  rows:  TrendRow[];
  total: number;
  skipped: number;
  error?: string;
};

/* ── 컬럼명 유연 검색 ── */
function findCol(keys: string[], candidates: string[]): string | undefined {
  for (const c of candidates) { if (keys.includes(c)) return c; }
  const lower = candidates.map(c => c.toLowerCase().replace(/\s/g, ''));
  for (const k of keys) {
    const kl = k.toLowerCase().replace(/\s/g, '');
    const idx = lower.findIndex(c => kl.includes(c) || c.includes(kl));
    if (idx >= 0) return k;
  }
  return undefined;
}

export function parseTrendBuffer(buffer: Buffer, fileName: string): ParseTrendResult {
  let rawRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, {
      type:        'buffer',
      cellFormula: false,
      cellHTML:    false,
      cellNF:      false,
      cellText:    false,
      cellDates:   false,   // 날짜를 시리얼 숫자로 → normalizeMonth에서 처리
      cellStyles:  false,
      sheetStubs:  false,
    });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // raw:true → 숫자·시리얼 날짜를 그대로 반환 (포맷 없이)
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  } catch (e) {
    return { rows: [], total: 0, skipped: 0, error: `파싱 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (rawRows.length === 0) return { rows: [], total: 0, skipped: 0, error: '데이터 없음' };

  const keys = Object.keys(rawRows[0]);
  const COL = {
    month:    findCol(keys, ['처방월','처방년월','처방연월','청구년월','년월','처방일']),
    rep:      findCol(keys, ['내부담당자','담당자','MR','담당MR','영업담당자','담당']),
    cso:      findCol(keys, ['담당CSO','CSO명','CSO','법인명','수탁법인','거래처코드']),
    hospital: findCol(keys, ['처방처명','병원명','거래처명','처방처','거래처']),
    product:  findCol(keys, ['품목명','제품명','약품명','품명','상품명']),
    type:     findCol(keys, ['종별구분','종별','요양기관종별','기관종별','요양종별']),
    comm:     findCol(keys, ['합산수수료','수수료율','수수료','수수료(%)','합산수수료율','수수료%']),
    amount:   findCol(keys, ['처방금액','처방액','원외처방금액','처방금액(원)','금액','원외금액']),
  };

  console.log(`[trend-parse] 파일: ${fileName}, 전체행: ${rawRows.length}`);
  console.log(`[trend-parse] 컬럼(${keys.length}):`, keys.slice(0, 20).join(' | '));
  console.log(`[trend-parse] 매핑:`, JSON.stringify(COL));

  if (!COL.amount) {
    return {
      rows: [], total: rawRows.length, skipped: rawRows.length,
      error: `처방금액 컬럼을 찾을 수 없습니다. 감지된 컬럼: [${keys.slice(0, 12).join(', ')}]`,
    };
  }

  // 파일명에서 연월 추출 (처방월 컬럼 파싱 실패 시 fallback)
  const fileMonth = monthFromFileName(fileName);
  if (fileMonth) {
    console.log(`[trend-parse] 파일명 연월: ${fileMonth} (from "${fileName}")`);
  }

  const rows: TrendRow[] = [];
  let skipped = 0;

  for (const raw of rawRows) {
    const amount = parseNum(COL.amount ? raw[COL.amount] : null);

    // 금액이 null이거나 양수가 아닌 경우 스킵 (반환·조정 제외)
    if (amount === null || amount <= 0) { skipped++; continue; }

    const commRate = parseNum(COL.comm ? raw[COL.comm] : null);
    // 처방월 컬럼 파싱 → null이면 파일명에서 추출한 연월 사용
    const month    = normalizeMonth(COL.month ? raw[COL.month] : null) ?? fileMonth;

    rows.push({
      source_file:         fileName,
      prescription_month:  month,
      sales_rep:           parseStr(COL.rep      ? raw[COL.rep]      : null),
      cso_name:            parseStr(COL.cso      ? raw[COL.cso]      : null),
      hospital_name:       parseStr(COL.hospital ? raw[COL.hospital] : null),
      product_name:        parseStr(COL.product  ? raw[COL.product]  : null),
      hospital_type:       parseStr(COL.type     ? raw[COL.type]     : null),
      commission_rate:     commRate,
      commission_tier:     getCommissionTier(commRate),
      prescription_amount: amount,
    });
  }

  const nullMonths = rows.filter(r => !r.prescription_month).length;
  console.log(`[trend-parse] 저장행: ${rows.length}, 스킵: ${skipped}, 월null: ${nullMonths}`);
  return { rows, total: rawRows.length, skipped };
}
