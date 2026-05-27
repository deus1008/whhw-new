/* ── 타입 ──────────────────────────────────────────────────── */
export interface HospitalStat {
  name:   string;
  amount: number;
  count:  number;
}
export interface ItemStat {
  name:   string;
  amount: number;
  count:  number;
}
export interface DetectedCols {
  amount?:   string;
  count?:    string;
  hospital?: string;
  item?:     string;
  date?:     string;
}
export interface EdiData {
  filename:        string;
  period:          string;
  totalAmount:     number;
  totalCount:      number;
  uniqueHospitals: number;
  uniqueItems:     number;
  hospitalStats:   HospitalStat[];
  itemStats:       ItemStat[];
  detectedCols:    DetectedCols;
  headers:         string[];
}

/* ── 컬럼 키워드 사전 ──────────────────────────────────────── */
const AMOUNT_KW   = ['청구금액','처방금액','약품금액','총금액','청구액','비용','금액','단가','amount'];
const COUNT_KW    = ['처방건수','청구건수','처방수','건수','수량','투약일수','조제일수','count'];
const HOSPITAL_KW = ['요양기관명','거래처명','기관명','병원명','의원명','약국명','거래처','기관명칭'];
const ITEM_KW     = ['품목명','약품명','제품명','의약품명','품목'];
const DATE_KW     = ['청구년월','처방년월','진료년월','청구월','처방월','청구일자','처방일','년월','기간'];

/* ── 유틸 ──────────────────────────────────────────────────── */
const trim = (s: string) => s.replace(/[\s_\-\.]/g, '').toLowerCase();

function findCol(headers: string[], kws: string[]): string | undefined {
  // 1) 완전 일치
  for (const h of headers)
    if (kws.some(k => trim(h) === trim(k))) return h;
  // 2) 포함 관계
  for (const h of headers)
    if (kws.some(k => trim(h).includes(trim(k)) || trim(k).includes(trim(h)))) return h;
  return undefined;
}

function periodFromFilename(fn: string): string {
  // 2026.04 / 26.04 / 202604 / 26년4월
  let m = fn.match(/(\d{4})\.(\d{2})/);
  if (m) return `${m[1]}.${m[2]}`;
  m = fn.match(/(\d{2})\.(\d{2})/);
  if (m) return `${Number(m[1]) < 50 ? '20' : '19'}${m[1]}.${m[2]}`;
  m = fn.match(/(\d{4})(\d{2})(?!\d)/);
  if (m && +m[1] > 2000) return `${m[1]}.${m[2]}`;
  m = fn.match(/(\d{2})년\s*(\d{1,2})월/);
  if (m) return `${Number(m[1]) < 50 ? '20' : '19'}${m[1]}.${String(+m[2]).padStart(2,'0')}`;
  return '';
}

function excelDateToYM(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ── 메인 처리 함수 ─────────────────────────────────────────── */
export function processEdi(
  rows: Record<string, unknown>[],
  filename: string,
): EdiData {
  if (!rows.length) throw new Error('데이터 행이 없습니다.');

  // 컬럼명 공백 제거
  const normalized = rows.map(r => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k.trim()] = v;
    return o;
  });

  const headers = Object.keys(normalized[0]);
  const cols: DetectedCols = {
    amount:   findCol(headers, AMOUNT_KW),
    count:    findCol(headers, COUNT_KW),
    hospital: findCol(headers, HOSPITAL_KW),
    item:     findCol(headers, ITEM_KW),
    date:     findCol(headers, DATE_KW),
  };

  /* ── 합계 ── */
  const totalAmount = cols.amount
    ? normalized.reduce((s, r) => s + (Number(r[cols.amount!]) || 0), 0) : 0;
  const totalCount  = cols.count
    ? normalized.reduce((s, r) => s + (Number(r[cols.count!]) || 0), 0)  : normalized.length;

  /* ── 기간 ── */
  let period = periodFromFilename(filename);
  if (!period && cols.date) {
    const v = normalized[0][cols.date];
    if (typeof v === 'number' && v > 40000) {
      period = excelDateToYM(v);
    } else {
      const m = String(v).match(/(\d{4})[\.\-\/]?(\d{2})/);
      if (m) period = `${m[1]}.${m[2]}`;
    }
  }

  /* ── 거래처별 집계 ── */
  const hospMap = new Map<string, { amount: number; count: number }>();
  if (cols.hospital) {
    for (const r of normalized) {
      const name = String(r[cols.hospital] ?? '').trim() || '(미상)';
      const cur  = hospMap.get(name) ?? { amount: 0, count: 0 };
      cur.amount += cols.amount ? (Number(r[cols.amount]) || 0) : 0;
      cur.count  += cols.count  ? (Number(r[cols.count])  || 0) : 1;
      hospMap.set(name, cur);
    }
  }
  const hospitalStats: HospitalStat[] = [...hospMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (b.amount || b.count) - (a.amount || a.count))
    .slice(0, 500);   // 상위 500개 제한

  /* ── 품목별 집계 ── */
  const itemMap = new Map<string, { amount: number; count: number }>();
  if (cols.item) {
    for (const r of normalized) {
      const name = String(r[cols.item] ?? '').trim() || '(미상)';
      const cur  = itemMap.get(name) ?? { amount: 0, count: 0 };
      cur.amount += cols.amount ? (Number(r[cols.amount]) || 0) : 0;
      cur.count  += cols.count  ? (Number(r[cols.count])  || 0) : 1;
      itemMap.set(name, cur);
    }
  }
  const itemStats: ItemStat[] = [...itemMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => (b.amount || b.count) - (a.amount || a.count))
    .slice(0, 500);   // 상위 500개 제한

  return {
    filename, period, totalAmount, totalCount,
    uniqueHospitals: hospMap.size,
    uniqueItems:     itemMap.size,
    hospitalStats, itemStats, detectedCols: cols, headers,
  };
}
