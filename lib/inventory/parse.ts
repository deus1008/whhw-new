/**
 * 품절예측현황 엑셀 파서
 *
 * 실제 파일 구조 (품절예측 시트만 존재):
 *  Row 0: 타이틀 "품절 및 예측 품목"
 *  Row 1: 헤더 [구분, 제품코드, 제품명, 품목구분, 종합병원, 직3매출(백만/월),
 *               당월매출(백만), 재고(백만), 재고일(SF대비),
 *               품절(예측)시작일, 공급예정일, 품절일수, 제조처, 발생유형]
 *  Row 2~: 데이터 (실제 8행)
 */

import XLSX from 'xlsx';

export type StockAlertItem = {
  alert_type:     string;        // 품절 | 예측
  product_code:   string;
  product_name:   string;
  sales_3m:       number | null; // 직3매출(백만/월) — 3개월 평균
  sales_month:    number | null; // 당월매출(백만)
  stock_amount:   number | null; // 재고(백만)
  stock_days:     number | null; // 재고일(SF대비)
  stockout_start: string | null; // ISO date 또는 텍스트 (예: "전략적 재고소진")
  supply_date:    string | null; // ISO date 또는 텍스트 (예: "6월")
  stockout_days:  string | null; // "14일", "-", null
  manufacturer:   string;
  cause:          string;
  memo:           string | null;
};

/**
 * Excel 시리얼 숫자 → "YYYY-MM-DD"
 * 숫자가 아닌 텍스트("전략적 재고소진", "6월" 등)는 그대로 반환
 */
function excelDateToLabel(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;

  if (typeof v === 'string') {
    const t = v.replace(/\r\n/g, ' ').trim();
    if (!t || t === '-') return null;
    const n = Number(t);
    if (isNaN(n)) return t;        // 텍스트 그대로
    // 숫자형 문자열 → serial 처리
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? t : d.toISOString().slice(0, 10);
  }

  const n = Number(v);
  if (isNaN(n) || n < 1) return null;
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v).replace(/\r\n/g, ' ').replace(/\r/g, ' ').trim();
}

export function parseInventoryBuffer(buffer: Buffer): {
  items: StockAlertItem[];
  error?: string;
} {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch (e) {
    return { items: [], error: `파일 읽기 실패: ${e}` };
  }

  // '품절예측' 시트 탐색 (이름이 다를 경우에도 포함 검색)
  const sheetName = wb.SheetNames.find(n => n.includes('품절예측')) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { items: [], error: '품절예측 시트를 찾을 수 없습니다.' };

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
  // Row 0: 제목, Row 1: 헤더, Row 2~: 데이터
  const items: StockAlertItem[] = [];

  for (let i = 2; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const alertType = toStr(row[0]);
    const name      = toStr(row[2]);
    if (!alertType || !name) continue;   // 빈 행 스킵

    // 품절일수: 숫자이면 "N일", 텍스트이면 그대로, "-"이면 null
    const rawDays = row[11];
    let stockoutDays: string | null = null;
    if (typeof rawDays === 'number') {
      stockoutDays = `${rawDays}일`;
    } else {
      const s = toStr(rawDays);
      stockoutDays = s && s !== '-' ? s : null;
    }

    items.push({
      alert_type:     alertType,
      product_code:   toStr(row[1]),
      product_name:   name,
      sales_3m:       toNum(row[5]),
      sales_month:    toNum(row[6]),
      stock_amount:   toNum(row[7]),
      stock_days:     toNum(row[8]),
      stockout_start: excelDateToLabel(row[9]),
      supply_date:    excelDateToLabel(row[10]),
      stockout_days:  stockoutDays,
      manufacturer:   toStr(row[12]),
      cause:          toStr(row[13]),
      memo:           null,
    });
  }

  return { items };
}
