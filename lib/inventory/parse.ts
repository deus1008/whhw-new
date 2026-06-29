/**
 * 품절예측현황 엑셀 파서 — 구형 / 신형 형식 자동 감지
 *
 * [구형] 시트명 '품절예측'
 *  Row 0: 타이틀
 *  Row 1: 헤더 [구분, 제품코드, 제품명, 품목구분, 종합병원, 직3매출, 당월매출, 재고, 재고일, 품절시작일, 공급예정일, 품절일수, 제조처, 발생유형]
 *  Row 2~: 데이터
 *
 * [신형] 시트명 '품절(의약품)' 등 — 26.06.19 업로드분부터 적용
 *  Row 0: 타이틀 "품절현황"
 *  Row 2: 헤더 [집계월, 구분, 시작월, 자재, 자재 내역, 월평균 매출액, 신규/이월,
 *               품절시작일, 품절종료일, 품절일수, 발생유형, 원인, 대책, 구분, 자사/위탁]
 *  Row 3~: 데이터 (집계월별 다수 행 — 최신 집계월만 표시)
 */

import XLSX from 'xlsx';

export type StockAlertItem = {
  alert_type:     string;        // 품절 | 품절예측
  product_code:   string;
  product_name:   string;
  sales_3m:       number | null; // 월평균 매출액(백만) [신형] 또는 직3매출(백만/월) [구형]
  sales_month:    number | null; // 당월매출(백만) [구형만]
  stock_amount:   number | null; // 재고(백만) [구형만]
  stock_days:     number | null; // 재고일(SF대비) [구형만]
  stockout_start: string | null; // 품절시작일 ISO date
  supply_date:    string | null; // 공급예정일 [구형] 또는 품절종료일 [신형]
  stockout_days:  string | null; // "14일", "-", null
  manufacturer:   string;
  cause:          string;
  memo:           string | null;
  collect_month?: string | null; // [신형] 집계월 ex) "26년5월"
};

/** Excel 시리얼 숫자 → "YYYY-MM-DD" / 텍스트는 그대로 / 빈값은 null */
function excelDateToLabel(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;

  if (typeof v === 'string') {
    const t = v.replace(/\r\n/g, ' ').trim();
    if (!t || t === '-') return null;
    const n = Number(t);
    if (isNaN(n)) return t;
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

/** "26년5월" → 202605 (정렬용) */
function korMonthOrder(s: string): number {
  const m = s.match(/(\d+)년(\d+)월/);
  if (!m) return 0;
  return (2000 + parseInt(m[1])) * 100 + parseInt(m[2]);
}

// ── 신형 파서 ────────────────────────────────────────────────────────────────
function parseNewFormat(raw: unknown[][]): { items: StockAlertItem[]; error?: string } {
  // 유효한 집계월 수집
  const monthSet = new Set<string>();
  for (let i = 3; i < raw.length; i++) {
    const m = toStr((raw[i] as unknown[])[0]);
    if (m && /\d+년\d+월/.test(m)) monthSet.add(m);
  }
  if (monthSet.size === 0) return { items: [], error: '집계월 데이터를 찾을 수 없습니다.' };

  const latestMonth = [...monthSet].reduce((a, b) =>
    korMonthOrder(a) > korMonthOrder(b) ? a : b,
  );

  // 표시할 구분 → alert_type 매핑
  const TYPE_MAP: Record<string, string> = {
    '품절':     '품절',
    '7일미만':  '품절예측',
    '7일 미만': '품절예측',
    '':         '품절',   // 구형 누락 행: 빈 구분 = 품절중
  };

  const items: StockAlertItem[] = [];
  for (let i = 3; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (toStr(row[0]) !== latestMonth) continue;

    const 구분 = toStr(row[1]);
    if (!(구분 in TYPE_MAP)) continue; // 품절해소·전략적품절제외 등 스킵

    const 자재명 = toStr(row[4]);
    if (!자재명) continue;

    const 월평균매출 = toNum(row[5]);

    const rawDays = row[9];
    let stockoutDays: string | null = null;
    if (typeof rawDays === 'number' && rawDays > 0) {
      stockoutDays = `${rawDays}일`;
    } else {
      const s = toStr(rawDays);
      stockoutDays = s && s !== '-' && s !== '0' ? s : null;
    }

    const 발생유형 = toStr(row[10]);
    const 원인     = toStr(row[11]);
    const 대책     = toStr(row[12]);
    const causeStr = [발생유형, 원인].filter(Boolean).join(' - ');

    items.push({
      alert_type:     TYPE_MAP[구분],
      product_code:   toStr(row[3]),
      product_name:   자재명,
      sales_3m:       월평균매출 !== null ? 월평균매출 / 1_000_000 : null,
      sales_month:    null,
      stock_amount:   null,
      stock_days:     null,
      stockout_start: excelDateToLabel(row[7]),
      supply_date:    excelDateToLabel(row[8]) ?? null,
      stockout_days:  stockoutDays,
      manufacturer:   toStr(row[14]),
      cause:          causeStr,
      memo:           대책 || null,
      collect_month:  latestMonth,
    });
  }

  return { items };
}

// ── 구형 파서 ────────────────────────────────────────────────────────────────
function parseOldFormat(raw: unknown[][]): { items: StockAlertItem[]; error?: string } {
  const items: StockAlertItem[] = [];

  for (let i = 2; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const alertType = toStr(row[0]);
    const name      = toStr(row[2]);
    if (!alertType || !name) continue;

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
      collect_month:  null,
    });
  }

  return { items };
}

// ── 메인 진입점 ──────────────────────────────────────────────────────────────
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

  const sheetName = wb.SheetNames.find(n => n.includes('품절')) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { items: [], error: '품절 시트를 찾을 수 없습니다.' };

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });

  // 형식 감지: 신형은 row[2][0] === '집계월'
  const isNewFormat = toStr((raw[2] as unknown[])?.[0]) === '집계월';

  return isNewFormat ? parseNewFormat(raw) : parseOldFormat(raw);
}
