/**
 * 수수료율 Excel 파일 파싱 유틸리티
 * 컬럼 구조: 제약사명(2), 급여여부(3), 제품명(4), 성분(5), 효능(6), 효능명(7),
 *            보험코드(8), 약가(9), 기본요율(10)
 */
import * as XLSX from 'xlsx';

export type CommissionRateRow = {
  source_file:  string;
  company_name: string;
  product_name: string | null;
  rate:         number;   // 저장 단위: % (예: 48.0)
};

export type ParseCommissionResult = {
  rows:  CommissionRateRow[];
  total: number;
  error?: string;
};

function norm(s: string): string {
  return String(s ?? '').replace(/[\s\r\n_\-\.: ]/g, '').toLowerCase();
}

function matchKw(cell: string, kws: string[]): boolean {
  const nc = norm(cell);
  if (!nc || nc.length < 2) return false;
  return kws.some(k => { const nk = norm(k); return nc === nk || nc.includes(nk) || nk.includes(nc); });
}

function toRate(v: unknown): number | null {
  const s = String(v ?? '').replace(/[,%\s]/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n < 0) return null;
  // 0~1 범위이면 100 곱해서 % 단위로 저장
  const pct = (n > 0 && n <= 1) ? Math.round(n * 10000) / 100
                                 : Math.round(n * 100) / 100;
  return pct;   // 0%도 허용 (누락이 아닌 명시적 0%일 수 있음)
}

const COMPANY_KW = ['제약사명','제약사','업체명','회사명','company','제조사','거래처명','행레이블','행 레이블'];
const RATE_KW    = ['기본요율','기본오율','수수료율','수수료','요율','오율','rate','commission','비율'];
const PRODUCT_KW = ['품목명','제품명','품명','제품','product','item'];

function findColIdx(headerRow: unknown[], kws: string[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (matchKw(String(headerRow[i] ?? ''), kws)) return i;
  }
  return -1;
}

export function parseCommissionBuffer(buffer: Buffer, fileName: string): ParseCommissionResult {
  // PDF 감지
  if (buffer.slice(0, 4).toString('ascii') === '%PDF' || fileName.toLowerCase().endsWith('.pdf')) {
    return { rows: [], total: 0, error: 'PDF는 지원하지 않습니다. xlsx 파일을 업로드해주세요.' };
  }

  // Excel 파싱 (cellText:false — 숫자 그대로 읽기, % 셀도 소수로)
  let allRows: unknown[][];
  try {
    const wb = XLSX.read(buffer, {
      type: 'buffer', cellFormula: false, cellHTML: false,
      cellNF: false, cellText: false, cellDates: false,
    });
    const ws = wb.Sheets[wb.SheetNames[0]];
    allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  } catch {
    return { rows: [], total: 0, error: 'Excel 파싱 실패' };
  }

  if (allRows.length === 0) return { rows: [], total: 0, error: '데이터 없음' };

  // 헤더 행 탐색 (0~15행, 실제 셀 값 기준)
  let headerRowIdx = -1;
  let bestScore    = 0;

  for (let ri = 0; ri < Math.min(allRows.length, 16); ri++) {
    const row = allRows[ri];
    const nonEmpty = row.filter(c => String(c ?? '').trim().length >= 1).length;
    if (nonEmpty < 2) continue;

    let score = 0;
    if (findColIdx(row, COMPANY_KW) >= 0) score += 3;
    if (findColIdx(row, RATE_KW)    >= 0) score += 3;
    if (findColIdx(row, PRODUCT_KW) >= 0) score += 1;
    if (score > bestScore) { bestScore = score; headerRowIdx = ri; }
  }

  if (headerRowIdx < 0) headerRowIdx = 0;

  const headerRow  = allRows[headerRowIdx];
  const companyIdx = findColIdx(headerRow, COMPANY_KW);
  const rateIdx    = findColIdx(headerRow, RATE_KW);
  const productIdx = findColIdx(headerRow, PRODUCT_KW);

  console.log(
    `[commission-parse] 파일:${fileName}, 헤더행:${headerRowIdx}`,
    `\n  헤더:`, headerRow.slice(0, 12).map(String).join(' | '),
    `\n  company:${companyIdx} rate:${rateIdx} product:${productIdx}`,
  );

  if (companyIdx < 0) {
    const cols = headerRow.slice(0, 10).map(c => String(c ?? '').trim()).filter(Boolean);
    return { rows: [], total: 0, error: `제약사명 컬럼 미감지. 컬럼: [${cols.join(', ')}]` };
  }
  if (rateIdx < 0) {
    const cols = headerRow.slice(0, 12).map(c => String(c ?? '').trim()).filter(Boolean);
    return { rows: [], total: 0, error: `수수료율 컬럼 미감지. 컬럼: [${cols.join(', ')}]` };
  }

  // 데이터 행 파싱
  const dataRows = allRows.slice(headerRowIdx + 1);
  const rows: CommissionRateRow[] = [];
  const seen = new Set<string>();  // (company, product) 중복 방지

  for (const row of dataRows) {
    const company = String(row[companyIdx] ?? '').trim();
    if (!company || company === '합계' || company === '총합계' || company === '(비어 있음)') continue;

    const rateVal = toRate(row[rateIdx]);
    if (rateVal === null) continue;

    const product = productIdx >= 0
      ? String(row[productIdx] ?? '').trim() || null
      : null;

    // 동일 (company, product) 중복 제거
    const key = `${company}|${product ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({ source_file: fileName, company_name: company, product_name: product, rate: rateVal });
  }

  console.log(`[commission-parse] 유효행: ${rows.length}/${dataRows.length}`);
  return { rows, total: dataRows.length };
}
