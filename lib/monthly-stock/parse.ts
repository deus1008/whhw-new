import * as XLSX from 'xlsx';

// 대상 저장위치 내역 (이미지 기준)
const ALLOWED_LOCATIONS = new Set([
  '평택 고형제1동 제품',
  '평택 고형제2동 제품',
  '평택 주사제 제품',
  '평택 제상품(상온/실온)',
  '평택 제상품(냉장)',
  '피코 제상품(일반)',
  '피코 제상품(냉장)',
]);

export type MonthlyStockRow = {
  source_file:    string;
  year:           string;
  period:         string;
  material_code:  string;
  material_name:  string;
  unit:           string | null;
  available_qty:  number;
  transit_qty:    number;
  total_qty:      number;
};

export type ParseMonthlyStockResult = {
  rows:   MonthlyStockRow[];
  total:  number;          // 원본 전체 행수
  error?: string;
};

export function parseMonthlyStockBuffer(buffer: Buffer, fileName: string): ParseMonthlyStockResult {
  let rawRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false, cellNF: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  } catch (e) {
    return { rows: [], total: 0, error: `파싱 실패: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (rawRows.length === 0) return { rows: [], total: 0, error: '데이터 없음' };

  // 품목별 집계: (year|period|material_code)
  const agg = new Map<string, MonthlyStockRow>();

  for (const r of rawRows) {
    const loc = String(r['저장위치 내역'] ?? '').trim();
    if (!ALLOWED_LOCATIONS.has(loc)) continue;

    const year   = String(r['현재 기간 연도'] ?? '').trim();
    const period = String(r['현재 기간']      ?? '').trim();
    const code   = String(r['자재']           ?? '').trim();
    const name   = String(r['자재내역']       ?? '').trim();
    const unit   = String(r['기본 단위']      ?? '').trim() || null;
    const avail  = Number(r['가용']           ?? 0);
    const transit = Number(r['운송중재고']    ?? 0);

    if (!code || !name) continue;

    const key = `${year}|${period}|${code}`;
    if (!agg.has(key)) {
      agg.set(key, { source_file: fileName, year, period, material_code: code, material_name: name, unit, available_qty: 0, transit_qty: 0, total_qty: 0 });
    }
    const e = agg.get(key)!;
    e.available_qty += avail;
    e.transit_qty   += transit;
    e.total_qty     += avail + transit;
  }

  const rows = [...agg.values()].sort((a, b) =>
    a.material_name.localeCompare(b.material_name, 'ko'),
  );

  return { rows, total: rawRows.length };
}
