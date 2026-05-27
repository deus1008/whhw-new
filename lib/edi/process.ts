/* ── 타입 ──────────────────────────────────────────────────── */
export interface DetectedCols {
  amount?:      string;  // 처방액   (Z열 fallback)
  finalAmount?: string;  // 최종실적 (AA열 fallback)
  salesperson?: string;  // 담당자
  cso?:         string;  // 담당CSO
  hospital?:    string;  // 거래처
  item?:        string;  // 품목
  unitPrice?:   string;  // 약가 (원)
  date?:        string;
}

export interface HospitalItemStat {
  name:        string;
  amount:      number;
  finalAmount: number;
}

export interface HospitalStat {
  name:        string;
  amount:      number;
  finalAmount: number;
  items:       HospitalItemStat[];  // 처방처별 품목 드릴다운
}

export interface SalesPersonCsoStat {
  name:        string;
  amount:      number;
  finalAmount: number;
}

export interface SalesPersonStat {
  name:        string;
  amount:      number;
  finalAmount: number;
  csos:        SalesPersonCsoStat[];
}

export interface CsoStat {
  name:        string;
  amount:      number;
  finalAmount: number;
  hospitals:   HospitalStat[];
}

export interface ItemCsoStat {
  name:        string;
  amount:      number;
  finalAmount: number;
}

export interface ItemStat {
  name:        string;
  amount:      number;
  finalAmount: number;
  csos:        ItemCsoStat[];
}

export interface DrugPrice {
  name:      string;
  unitPrice: number;
}

export interface EdiData {
  filename:         string;
  period:           string;
  totalAmount:      number;
  totalFinalAmount: number;
  salesPersonStats: SalesPersonStat[];
  csoStats:         CsoStat[];          // amount 내림차순
  hospitalRanking:  HospitalStat[];     // 전체 거래처 순위 + 품목 드릴다운
  itemStats:        ItemStat[];         // 품목별 순위 + CSO 드릴다운
  drugPrices:       DrugPrice[];        // 약가 (원, 가나다 정렬)
  detectedCols:     DetectedCols;
  headers:          string[];
}

/* ── 컬럼 키워드 사전 ──────────────────────────────────────── */
// 앞에 있는 키워드가 우선 감지됨
// trim()이 소문자 변환하므로 CSO_KW는 소문자 표기
const AMOUNT_KW      = ['처방금액','처방액','청구금액','약품금액','총금액','청구액','금액','amount'];
const FINAL_KW       = ['최종실적','지급금액','실적금액','최종금액'];
const SALESPERSON_KW = ['담당자명','담당자이름','담당자성명','영업담당자명','영업담당자','담당영업','사원명','담당자'];
const CSO_KW         = ['담당cso','cso명','cso'];
const HOSPITAL_KW    = ['처방처명','요양기관명','거래처명','기관명','병원명','처방처','의원명','약국명','거래처','기관명칭'];
const ITEM_KW        = ['품목명','약품명','제품명','의약품명','품목'];
const UNIT_PRICE_KW  = ['약가','단가','단위가격','단위금액'];
const DATE_KW        = ['청구년월','처방년월','진료년월','청구월','처방월','청구일자','처방일','년월','기간'];

/* ── 유틸 ──────────────────────────────────────────────────── */
const trim = (s: string) => s.replace(/[\s_\-\.]/g, '').toLowerCase();

/**
 * 코드·번호성 헤더 감지 (사람 이름 컬럼 탐색 시 제외)
 * 예) '담당자코드', '담당자번호', '사원ID', '사번' 등
 */
function isCodeHeader(h: string): boolean {
  const t = trim(h);
  return (
    t.endsWith('코드') || t.endsWith('번호') ||
    t.endsWith('code') || t.endsWith('no')   ||
    t.endsWith('id')   || t.endsWith('num')  || t.endsWith('cd') ||
    t === '사번'
  );
}

/**
 * 키워드 우선순위로 컬럼 탐색:
 *   1) kws 순서대로 완전 일치
 *   2) kws 순서대로 포함 관계
 * skipCode=true 이면 코드·번호성 헤더를 후보에서 제외
 */
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

  // 컬럼명 앞뒤 공백 제거
  const normalized = rows.map(r => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k.trim()] = v;
    return o;
  });

  const headers = Object.keys(normalized[0]);

  // 위치 기반 fallback (키워드 감지 실패 대비)
  // Z열(25) = 처방금액, AA열(26) = 최종실적, I열(8) = 담당자명, O열(14) = 처방처명
  const colZ  = headers.length > 25 ? headers[25] : undefined;
  const colAA = headers.length > 26 ? headers[26] : undefined;
  const colI  = headers.length > 8  ? headers[8]  : undefined;
  const colO  = headers.length > 14 ? headers[14] : undefined;

  const cols: DetectedCols = {
    amount:      findCol(headers, AMOUNT_KW)               ?? colZ,
    finalAmount: findCol(headers, FINAL_KW)                ?? colAA,
    salesperson: findCol(headers, SALESPERSON_KW, true)    ?? colI,
    cso:         findCol(headers, CSO_KW,         true),
    hospital:    findCol(headers, HOSPITAL_KW,    true)    ?? colO,
    item:        findCol(headers, ITEM_KW,         true),
    unitPrice:   findCol(headers, UNIT_PRICE_KW),
    date:        findCol(headers, DATE_KW),
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
  let totalFinalAmount = 0;

  /* ── 집계 맵 ── */
  type Pair = { amount: number; finalAmount: number };
  const spMap    = new Map<string, Pair & { csos: Map<string, Pair> }>();
  const csoMap   = new Map<string, Pair & { hospitals: Map<string, Pair> }>();
  const hosMap   = new Map<string, Pair & { items: Map<string, Pair> }>();
  const itemMap  = new Map<string, Pair & { csos: Map<string, Pair> }>();
  const priceMap = new Map<string, number>(); // 품목 → 약가 (첫 번째 값)

  for (const r of normalized) {
    const amt   = cols.amount      ? (Number(r[cols.amount])      || 0) : 0;
    const fin   = cols.finalAmount ? (Number(r[cols.finalAmount]) || 0) : 0;
    const price = cols.unitPrice   ? (Number(r[cols.unitPrice])   || 0) : 0;

    totalAmount      += amt;
    totalFinalAmount += fin;

    const sp   = cols.salesperson ? (String(r[cols.salesperson] ?? '').trim() || '(미상)') : null;
    const cso  = cols.cso         ? (String(r[cols.cso]         ?? '').trim() || '(미상)') : null;
    const hos  = cols.hospital    ? (String(r[cols.hospital]    ?? '').trim() || '(미상)') : null;
    const item = cols.item        ? (String(r[cols.item]        ?? '').trim() || '(미상)') : null;

    /* 담당자 집계 */
    if (sp !== null) {
      if (!spMap.has(sp)) spMap.set(sp, { amount: 0, finalAmount: 0, csos: new Map() });
      const se = spMap.get(sp)!;
      se.amount += amt; se.finalAmount += fin;
      if (cso !== null) {
        if (!se.csos.has(cso)) se.csos.set(cso, { amount: 0, finalAmount: 0 });
        const ce = se.csos.get(cso)!;
        ce.amount += amt; ce.finalAmount += fin;
      }
    }

    /* CSO 집계 */
    if (cso !== null) {
      if (!csoMap.has(cso)) csoMap.set(cso, { amount: 0, finalAmount: 0, hospitals: new Map() });
      const ce = csoMap.get(cso)!;
      ce.amount += amt; ce.finalAmount += fin;
      if (hos !== null) {
        if (!ce.hospitals.has(hos)) ce.hospitals.set(hos, { amount: 0, finalAmount: 0 });
        const he = ce.hospitals.get(hos)!;
        he.amount += amt; he.finalAmount += fin;
      }
    }

    /* 전체 처방처 집계 (품목 드릴다운 포함) */
    if (hos !== null) {
      if (!hosMap.has(hos)) hosMap.set(hos, { amount: 0, finalAmount: 0, items: new Map() });
      const he = hosMap.get(hos)!;
      he.amount += amt; he.finalAmount += fin;
      if (item !== null) {
        if (!he.items.has(item)) he.items.set(item, { amount: 0, finalAmount: 0 });
        const ie = he.items.get(item)!;
        ie.amount += amt; ie.finalAmount += fin;
      }
    }

    /* 품목 집계 */
    if (item !== null) {
      if (!itemMap.has(item)) itemMap.set(item, { amount: 0, finalAmount: 0, csos: new Map() });
      const ie = itemMap.get(item)!;
      ie.amount += amt; ie.finalAmount += fin;
      if (cso !== null) {
        if (!ie.csos.has(cso)) ie.csos.set(cso, { amount: 0, finalAmount: 0 });
        const ce = ie.csos.get(cso)!;
        ce.amount += amt; ce.finalAmount += fin;
      }
      // 약가: 첫 번째 유효값만 기록
      if (!priceMap.has(item) && price > 0) priceMap.set(item, price);
    }
  }

  /* ── 결과 변환 ── */
  const salesPersonStats: SalesPersonStat[] = [...spMap.entries()]
    .map(([name, v]) => ({
      name,
      amount:      v.amount,
      finalAmount: v.finalAmount,
      csos: [...v.csos.entries()]
        .map(([n, c]) => ({ name: n, amount: c.amount, finalAmount: c.finalAmount }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const csoStats: CsoStat[] = [...csoMap.entries()]
    .map(([name, v]) => ({
      name,
      amount:      v.amount,
      finalAmount: v.finalAmount,
      hospitals: [...v.hospitals.entries()]
        .map(([n, h]) => ({ name: n, amount: h.amount, finalAmount: h.finalAmount, items: [] }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const hospitalRanking: HospitalStat[] = [...hosMap.entries()]
    .map(([name, v]) => ({
      name,
      amount:      v.amount,
      finalAmount: v.finalAmount,
      items: [...v.items.entries()]
        .map(([n, it]) => ({ name: n, amount: it.amount, finalAmount: it.finalAmount }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 1000);

  const itemStats: ItemStat[] = [...itemMap.entries()]
    .map(([name, v]) => ({
      name,
      amount:      v.amount,
      finalAmount: v.finalAmount,
      csos: [...v.csos.entries()]
        .map(([n, c]) => ({ name: n, amount: c.amount, finalAmount: c.finalAmount }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 500);

  const drugPrices: DrugPrice[] = [...priceMap.entries()]
    .map(([name, unitPrice]) => ({ name, unitPrice }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return {
    filename, period,
    totalAmount, totalFinalAmount,
    salesPersonStats, csoStats, hospitalRanking,
    itemStats, drugPrices,
    detectedCols: cols, headers,
  };
}
