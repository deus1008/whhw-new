/* ── 타입 ──────────────────────────────────────────────────── */
export interface StaffStat {
  name: string;
  prev: number;
  current: number;
  diff: number;
  diffPct: number;
}
export interface ItemStat {
  name: string;
  prev: number;
  current: number;
  diff: number;
  diffPct: number;
}
export interface CatStat { type: string; amount: number; }

export interface PerfData {
  filename: string;
  period: string;
  prevPeriod: string;
  totalCurrent: number;
  totalPrev: number;
  totalDiff: number;
  totalDiffPct: number;
  sogeupAmount: number;
  prescriptionCount: number;
  clinicPrescriptionCount?: number;
  hospitalPrescriptionCount?: number;
  staffStats: StaffStat[];
  topIncreased: ItemStat[];
  topDecreased: ItemStat[];
  hospitalStats: CatStat[];
  rxTypes: CatStat[];
  dealerStats: CatStat[];
}

/* ── 유틸 ──────────────────────────────────────────────────── */
function isClinicHospType(type: string): boolean {
  const v = type.trim();
  return v === '의원' || v.endsWith('의원');
}

function excelDateToYM(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0');
}

/* ── raw 시트 처리 ─────────────────────────────────────────── */
export function processRaw(
  rows: Record<string, unknown>[],
  filename: string,
): PerfData {
  // 컬럼명 공백 제거
  const norm: Record<string, unknown>[] = rows.map(r => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k.trim()] = v;
    return o;
  });

  const months = [...new Set(norm.map(r => r['실적월'] as number))]
    .filter(m => typeof m === 'number' && m > 40000)
    .sort((a, b) => a - b);

  if (months.length === 0)
    throw new Error('"raw" 시트에서 실적월 데이터를 찾을 수 없습니다.');

  const curM  = months[months.length - 1];
  const prevM = months.length >= 2 ? months[months.length - 2] : null;

  const curRows:    Record<string, unknown>[] = [];
  const prevRows:   Record<string, unknown>[] = [];
  const sogeupRows: Record<string, unknown>[] = [];

  for (const r of norm) {
    const m = r['실적월'];
    const t = r['실적구분'];
    if      (m === curM  && t === '당월분') curRows.push(r);
    else if (m === prevM && t === '당월분') prevRows.push(r);
    else if (m === curM  && t === '소급분') sogeupRows.push(r);
  }

  const sumAmt = (arr: Record<string, unknown>[]) =>
    arr.reduce((s, r) => s + (Number(r['처방금액']) || 0), 0);

  function aggBy(arr: Record<string, unknown>[], key: string): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of arr) {
      const k = String(r[key] ?? '');
      m.set(k, (m.get(k) ?? 0) + (Number(r['처방금액']) || 0));
    }
    return m;
  }

  // 담당자별
  const cs = aggBy(curRows, '현담당자');
  const ps = aggBy(prevRows, '현담당자');
  const staffStats: StaffStat[] = [...new Set([...cs.keys(), ...ps.keys()])].map(name => {
    const cur  = cs.get(name) ?? 0;
    const prev = ps.get(name) ?? 0;
    return { name, prev, current: cur, diff: cur - prev, diffPct: prev ? (cur - prev) / prev : 0 };
  }).sort((a, b) => b.current - a.current);

  // 품목별
  const ci = aggBy(curRows, '품목명');
  const pi = aggBy(prevRows, '품목명');
  const allItems = [...new Set([...ci.keys(), ...pi.keys()])].map(name => {
    const cur  = ci.get(name) ?? 0;
    const prev = pi.get(name) ?? 0;
    return { name, prev, current: cur, diff: cur - prev, diffPct: prev ? (cur - prev) / prev : 0 };
  });
  const topIncreased = allItems.filter(x => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 10);
  const topDecreased = allItems.filter(x => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 10);

  const toCat = (m: Map<string, number>): CatStat[] =>
    [...m.entries()].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount);

  const totalCurrent = sumAmt(curRows);
  const totalPrev    = sumAmt(prevRows);

  return {
    filename,
    period:      excelDateToYM(curM),
    prevPeriod:  prevM ? excelDateToYM(prevM) : '',
    totalCurrent,
    totalPrev,
    totalDiff:    totalCurrent - totalPrev,
    totalDiffPct: totalPrev ? (totalCurrent - totalPrev) / totalPrev : 0,
    sogeupAmount: sumAmt(sogeupRows),
    prescriptionCount: new Set(curRows.map(r => r['처방처코드'])).size,
    clinicPrescriptionCount: new Set(
      curRows.filter(r => isClinicHospType(String(r['병원구분'] ?? ''))).map(r => r['처방처코드']),
    ).size,
    hospitalPrescriptionCount: new Set(
      curRows.filter(r => !isClinicHospType(String(r['병원구분'] ?? ''))).map(r => r['처방처코드']),
    ).size,
    staffStats,
    topIncreased,
    topDecreased,
    hospitalStats: toCat(aggBy(curRows, '병원구분')),
    rxTypes:       toCat(aggBy(curRows, '품목구분')),
    dealerStats:   toCat(aggBy(curRows, '판매대행처명')).slice(0, 15),
  };
}
