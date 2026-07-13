/* ── 타입 ──────────────────────────────────────────────────── */
export interface DetectedCols {
  amount?:        string;  // 처방액
  salesperson?:   string;  // 담당자
  cso?:           string;  // 담당CSO
  hospital?:      string;  // 거래처
  item?:          string;  // 품목
  unitPrice?:     string;  // 약가 (원)
  date?:          string;
  insuranceCode?: string;  // 보험코드 (9자리 직접)
  repCode?:       string;  // 대표코드 (13자리 → 9자리 변환)
}

export interface HospitalItemCsoStat {
  name:   string;
  amount: number;
}

export interface HospitalItemStat {
  name:   string;
  amount: number;
  csos:   HospitalItemCsoStat[];
}

export interface HospitalStat {
  name:   string;
  amount: number;
  items:  HospitalItemStat[];
}

export interface SalesPersonCsoHospitalStat {
  name:   string;
  amount: number;
}

export interface SalesPersonCsoStat {
  name:      string;
  amount:    number;
  hospitals: SalesPersonCsoHospitalStat[];
}

export interface SalesPersonStat {
  name:   string;
  amount: number;
  csos:   SalesPersonCsoStat[];
}

export interface CsoStat {
  name:      string;
  amount:    number;
  hospitals: HospitalStat[];
}

export interface ItemCsoHospitalStat {
  name:   string;
  amount: number;
}

export interface ItemCsoStat {
  name:      string;
  amount:    number;
  hospitals: ItemCsoHospitalStat[];
}

export interface ItemStat {
  name:   string;
  amount: number;
  csos:   ItemCsoStat[];
}

// 품목 → 요양기관 → 담당자 → CSO 구조 (뷰2)
export interface IHCsoStat  { name: string; amount: number; }
export interface IHSpStat   { name: string; amount: number; csos: IHCsoStat[]; }
export interface IHHosStat  { name: string; amount: number; salesPersons: IHSpStat[]; }
export interface IHItemStat { name: string; amount: number; hospitals: IHHosStat[]; }

export interface DrugPrice {
  name:      string;
  unitPrice: number;
}

export interface EdiData {
  filename:         string;
  period:           string;
  totalAmount:      number;
  salesPersonStats: SalesPersonStat[];
  csoStats:         CsoStat[];
  hospitalRanking:  HospitalStat[];
  itemStats:        ItemStat[];
  itemHospStats:    IHItemStat[];
  drugPrices:       DrugPrice[];
  totalHospitalCount: number;
  totalItemCount:     number;
  totalSpCount:       number;
  totalCsoCount:      number;
  detectedCols:     DetectedCols;
  headers:          string[];
}

/* ── 컬럼 키워드 사전 ──────────────────────────────────────── */
const AMOUNT_KW      = ['처방금액','처방액','청구금액','약품금액','총금액','청구액','금액','amount'];
const SALESPERSON_KW = ['내부담당','내부담당자','담당자','담당자명','영업담당자','사원명'];
const CSO_KW         = ['담당cso','cso명','cso'];
const HOSPITAL_KW    = ['처방처명','처방처','요양기관명','거래처명','기관명','병원명','의원명'];
const ITEM_KW        = ['품목명','약품명','제품명','의약품명','품목'];
const UNIT_PRICE_KW  = ['약가','단가','단위가격','단위금액'];
const DATE_KW        = ['실적월','처방월','청구월','처방년월','진료년월','청구년월','청구일자','처방일','년월','기간'];
const INSCODE_KW     = ['보험코드','청구코드','급여코드','보험EDI코드'];
const REPCODE_KW     = ['대표코드','표준코드','KD코드'];

/* ── 유틸 ──────────────────────────────────────────────────── */
const trim = (s: string) => s.replace(/[\s_\-\.]/g, '').toLowerCase();

function isCodeHeader(h: string): boolean {
  const t = trim(h);
  return (
    t.endsWith('코드') || t.endsWith('번호') ||
    t.endsWith('code') || t.endsWith('no')   ||
    t.endsWith('id')   || t.endsWith('num')  || t.endsWith('cd') ||
    t === '사번'
  );
}

function findCol(headers: string[], kws: string[], skipCode = false): string | undefined {
  const pool = skipCode ? headers.filter(h => !isCodeHeader(h)) : headers;
  for (const k of kws) {
    const found = pool.find(h => trim(h) === trim(k));
    if (found) return found;
  }
  for (const k of kws) {
    const found = pool.find(h => trim(h).includes(trim(k)) || trim(k).includes(trim(h)));
    if (found) return found;
  }
  return undefined;
}

function periodFromFilename(fn: string): string {
  let m = fn.match(/(\d{4})\.(\d{2})/);
  if (m) return `${m[1]}.${m[2]}`;
  m = fn.match(/(\d{4})-(\d{2})/);         // "2026-06" 대시 형식 지원
  if (m && +m[1] > 2000) return `${m[1]}.${m[2]}`;
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

  const normalized = rows.map(r => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k.trim()] = v;
    return o;
  });

  const headers = Object.keys(normalized[0]);

  // 위치 기반 fallback (Z열=처방금액, I열=담당자명, O열=처방처명)
  const colZ = headers.length > 25 ? headers[25] : undefined;
  const colI = headers.length > 8  ? headers[8]  : undefined;
  const colO = headers.length > 14 ? headers[14] : undefined;

  const cols: DetectedCols = {
    amount:      findCol(headers, AMOUNT_KW)               ?? colZ,
    salesperson: findCol(headers, SALESPERSON_KW, true)    ?? colI,
    cso:         findCol(headers, CSO_KW,         true),
    hospital:    findCol(headers, HOSPITAL_KW,    true)    ?? colO,
    item:        findCol(headers, ITEM_KW,         true),
    unitPrice:   findCol(headers, UNIT_PRICE_KW),
    date:        findCol(headers, DATE_KW),
    insuranceCode: findCol(headers, INSCODE_KW),
    repCode:       findCol(headers, REPCODE_KW),
  };

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

  /* ── 합계 ── */
  let totalAmount = 0;

  /* ── 집계 맵 ── */
  type Amt = { amount: number };
  const spMap  = new Map<string, Amt & { csos: Map<string, Amt & { hospitals: Map<string, Amt> }> }>();
  const csoMap = new Map<string, Amt & { hospitals: Map<string, Amt & { items: Map<string, Amt> }> }>();
  const hosMap = new Map<string, Amt & { items: Map<string, Amt & { csos: Map<string, Amt> }> }>();
  const itemMap = new Map<string, Amt & { csos: Map<string, Amt & { hospitals: Map<string, Amt> }> }>();
  const itemHosMap = new Map<string, Amt & { hospitals: Map<string, Amt & { salesPersons: Map<string, Amt & { csos: Map<string, Amt> }> }> }>();
  const priceMap = new Map<string, number>();

  for (const r of normalized) {
    const amt   = cols.amount    ? (Number(r[cols.amount])    || 0) : 0;
    const price = cols.unitPrice ? (Number(r[cols.unitPrice]) || 0) : 0;

    totalAmount += amt;

    const sp   = cols.salesperson ? (String(r[cols.salesperson] ?? '').trim() || '(미상)') : null;
    const cso  = cols.cso         ? (String(r[cols.cso]         ?? '').trim() || '(미상)') : null;
    const hos  = cols.hospital    ? (String(r[cols.hospital]    ?? '').trim() || '(미상)') : null;
    const item = cols.item        ? (String(r[cols.item]        ?? '').trim() || '(미상)') : null;

    /* 담당자 집계 */
    if (sp !== null) {
      if (!spMap.has(sp)) spMap.set(sp, { amount: 0, csos: new Map() });
      const se = spMap.get(sp)!;
      se.amount += amt;
      if (cso !== null) {
        if (!se.csos.has(cso)) se.csos.set(cso, { amount: 0, hospitals: new Map() });
        const ce = se.csos.get(cso)!;
        ce.amount += amt;
        if (hos !== null) {
          if (!ce.hospitals.has(hos)) ce.hospitals.set(hos, { amount: 0 });
          ce.hospitals.get(hos)!.amount += amt;
        }
      }
    }

    /* CSO 집계 */
    if (cso !== null) {
      if (!csoMap.has(cso)) csoMap.set(cso, { amount: 0, hospitals: new Map() });
      const ce = csoMap.get(cso)!;
      ce.amount += amt;
      if (hos !== null) {
        if (!ce.hospitals.has(hos)) ce.hospitals.set(hos, { amount: 0, items: new Map() });
        const he = ce.hospitals.get(hos)!;
        he.amount += amt;
        if (item !== null) {
          if (!he.items.has(item)) he.items.set(item, { amount: 0 });
          he.items.get(item)!.amount += amt;
        }
      }
    }

    /* 처방처 집계 */
    if (hos !== null) {
      if (!hosMap.has(hos)) hosMap.set(hos, { amount: 0, items: new Map() });
      const he = hosMap.get(hos)!;
      he.amount += amt;
      if (item !== null) {
        if (!he.items.has(item)) he.items.set(item, { amount: 0, csos: new Map() });
        const ie = he.items.get(item)!;
        ie.amount += amt;
        if (cso !== null) {
          if (!ie.csos.has(cso)) ie.csos.set(cso, { amount: 0 });
          ie.csos.get(cso)!.amount += amt;
        }
      }
    }

    /* 품목 집계 */
    if (item !== null) {
      if (!itemMap.has(item)) itemMap.set(item, { amount: 0, csos: new Map() });
      const ie = itemMap.get(item)!;
      ie.amount += amt;
      if (cso !== null) {
        if (!ie.csos.has(cso)) ie.csos.set(cso, { amount: 0, hospitals: new Map() });
        const ce = ie.csos.get(cso)!;
        ce.amount += amt;
        if (hos !== null) {
          if (!ce.hospitals.has(hos)) ce.hospitals.set(hos, { amount: 0 });
          ce.hospitals.get(hos)!.amount += amt;
        }
      }
      if (!priceMap.has(item) && price > 0) priceMap.set(item, price);

      // 품목 → 요양기관 → 담당자 → CSO
      if (!itemHosMap.has(item)) itemHosMap.set(item, { amount: 0, hospitals: new Map() });
      const ihItem = itemHosMap.get(item)!;
      ihItem.amount += amt;
      if (hos !== null) {
        if (!ihItem.hospitals.has(hos)) ihItem.hospitals.set(hos, { amount: 0, salesPersons: new Map() });
        const ihHos = ihItem.hospitals.get(hos)!;
        ihHos.amount += amt;
        const spKey = sp ?? '(미상)';
        if (!ihHos.salesPersons.has(spKey)) ihHos.salesPersons.set(spKey, { amount: 0, csos: new Map() });
        const ihSp = ihHos.salesPersons.get(spKey)!;
        ihSp.amount += amt;
        if (cso !== null) {
          if (!ihSp.csos.has(cso)) ihSp.csos.set(cso, { amount: 0 });
          ihSp.csos.get(cso)!.amount += amt;
        }
      }
    }
  }

  /* ── 결과 변환 ── */
  const salesPersonStats: SalesPersonStat[] = [...spMap.entries()]
    .map(([name, v]) => ({
      name, amount: v.amount,
      csos: [...v.csos.entries()]
        .map(([n, c]) => ({
          name: n, amount: c.amount,
          hospitals: [...c.hospitals.entries()]
            .map(([hn, h]) => ({ name: hn, amount: h.amount }))
            .sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const csoStats: CsoStat[] = [...csoMap.entries()]
    .map(([name, v]) => ({
      name, amount: v.amount,
      hospitals: [...v.hospitals.entries()]
        .map(([n, h]) => ({
          name: n, amount: h.amount,
          items: [...h.items.entries()]
            .map(([in_, it]) => ({ name: in_, amount: it.amount, csos: [] }))
            .sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const hospitalRanking: HospitalStat[] = [...hosMap.entries()]
    .map(([name, v]) => ({
      name, amount: v.amount,
      items: [...v.items.entries()]
        .map(([n, it]) => ({
          name: n, amount: it.amount,
          csos: [...it.csos.entries()]
            .map(([cn, c]) => ({ name: cn, amount: c.amount }))
            .sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 1000);

  const itemStats: ItemStat[] = [...itemMap.entries()]
    .map(([name, v]) => ({
      name, amount: v.amount,
      csos: [...v.csos.entries()]
        .map(([n, c]) => ({
          name: n, amount: c.amount,
          hospitals: [...c.hospitals.entries()]
            .map(([hn, h]) => ({ name: hn, amount: h.amount }))
            .sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 500);

  const drugPrices: DrugPrice[] = [...priceMap.entries()]
    .map(([name, unitPrice]) => ({ name, unitPrice }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const itemHospStats: IHItemStat[] = [...itemHosMap.entries()]
    .map(([name, v]) => ({
      name, amount: v.amount,
      hospitals: [...v.hospitals.entries()]
        .map(([hn, h]) => ({
          name: hn, amount: h.amount,
          salesPersons: [...h.salesPersons.entries()]
            .map(([sn, s]) => ({
              name: sn, amount: s.amount,
              csos: [...s.csos.entries()]
                .map(([cn, c]) => ({ name: cn, amount: c.amount }))
                .sort((a, b) => b.amount - a.amount),
            }))
            .sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 500);

  return {
    filename, period,
    totalAmount,
    salesPersonStats, csoStats, hospitalRanking,
    itemStats, itemHospStats, drugPrices,
    totalHospitalCount: hosMap.size,
    totalItemCount:     itemMap.size,
    totalSpCount:       spMap.size,
    totalCsoCount:      csoMap.size,
    detectedCols: cols, headers,
  };
}
