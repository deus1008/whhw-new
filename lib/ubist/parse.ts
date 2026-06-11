/**
 * Ubist 처방 데이터 Excel 파싱 유틸리티
 *
 * Ubist 파일 구조 (일반적):
 *   행1: 헤더 (기간, 성분명, 제품명, 제조사, 병원구분, 지역, 처방금액, 처방건수 등)
 *   행2+: 데이터
 *
 * 시트가 여러 개인 경우 시트명에서 기간(YYYY-MM)을 추출하거나,
 * 헤더에 기간 컬럼이 있으면 해당 값을 사용.
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
const AMOUNT_KW     = ['처방금액','금액','처방액','amount','처방매출','매출액','처방총액'];
const COUNT_KW      = ['처방건수','건수','처방수','count','rx건수','건'];

function norm(s: unknown): string {
  return String(s ?? '').replace(/[\s\r\n_\-\.\:% ]/g, '').toLowerCase();
}

function matchKw(cell: string, kws: string[]): boolean {
  const n = norm(cell);
  return kws.some(k => n.includes(norm(k)));
}

/** 시트명에서 YYYY-MM 형태 추출 */
function periodFromSheetName(name: string): string | null {
  // e.g. "2026-01", "202601", "2026년1월", "2026.01"
  const m1 = name.match(/(\d{4})[-\.\s년_]?(\d{1,2})월?/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}`;
  return null;
}

/** 셀 값을 숫자로 변환 (콤마·공백 제거) */
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return isNaN(n) ? null : Math.round(n);
}

/** 기간 셀을 YYYY-MM 형태로 정규화 */
function normalizePeriod(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[^\d년월\-\.]/g, '').trim();
  // 202601 형태
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  // 2026-01 또는 2026.01 형태
  const m = s.match(/^(\d{4})[-\.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  // 2026년01월 형태
  const m2 = s.match(/^(\d{4})년(\d{1,2})월?$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}`;
  // 숫자로만 된 경우 Excel 날짜 시리얼 처리
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

  const allRows: UbistRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (raw.length < 2) continue;

    // 시트명에서 기간 추출 (헤더에 기간 컬럼 없을 때 폴백)
    const sheetPeriod = periodFromSheetName(sheetName);

    // 헤더 행 탐색 (처음 10행에서 '제품명' 또는 '성분명' 포함 행 찾기)
    let headerRow = -1;
    for (let r = 0; r < Math.min(10, raw.length); r++) {
      const rowCells = (raw[r] as unknown[]).map(c => String(c ?? ''));
      if (rowCells.some(c => matchKw(c, PROD_KW) || matchKw(c, INGR_KW) || matchKw(c, AMOUNT_KW))) {
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
      if (periodCol  === -1 && matchKw(h, PERIOD_KW))  periodCol  = i;
      if (ingrCol    === -1 && matchKw(h, INGR_KW))    ingrCol    = i;
      if (prodCol    === -1 && matchKw(h, PROD_KW))    prodCol    = i;
      if (mfrCol     === -1 && matchKw(h, MFR_KW))     mfrCol     = i;
      if (hospCol    === -1 && matchKw(h, HOSP_KW))    hospCol    = i;
      if (regionCol  === -1 && matchKw(h, REGION_KW))  regionCol  = i;
      if (amountCol  === -1 && matchKw(h, AMOUNT_KW))  amountCol  = i;
      if (countCol   === -1 && matchKw(h, COUNT_KW))   countCol   = i;
    });

    // 처방금액 컬럼이 없으면 이 시트는 건너뜀
    if (amountCol === -1 && prodCol === -1) continue;

    for (let r = headerRow + 1; r < raw.length; r++) {
      const row = raw[r] as unknown[];
      if (row.every(c => c == null || String(c).trim() === '')) continue;

      const productName = prodCol >= 0 ? (String(row[prodCol] ?? '')).trim() || null : null;
      const ingrName    = ingrCol >= 0 ? (String(row[ingrCol] ?? '')).trim() || null : null;

      // 제품명도 성분명도 없는 행은 건너뜀
      if (!productName && !ingrName) continue;

      const rawPeriod = periodCol >= 0 ? normalizePeriod(row[periodCol]) : null;
      const period    = rawPeriod ?? sheetPeriod;

      const amount = amountCol >= 0 ? toNum(row[amountCol]) : null;
      const count  = countCol  >= 0 ? toNum(row[countCol])  : null;

      allRows.push({
        source_file:         filename,
        document_id:         documentId ?? null,
        period,
        ingredient_name:     ingrName,
        product_name:        productName,
        manufacturer:        mfrCol    >= 0 ? (String(row[mfrCol]    ?? '')).trim() || null : null,
        hospital_type:       hospCol   >= 0 ? (String(row[hospCol]   ?? '')).trim() || null : null,
        region:              regionCol >= 0 ? (String(row[regionCol] ?? '')).trim() || null : null,
        prescription_amount: amount,
        prescription_count:  count,
      });
    }
  }

  return { rows: allRows, total: allRows.length };
}
