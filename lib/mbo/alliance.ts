// 얼라이언스 MBO 자동 산출 — 지표별 월별 실적(DB) + 목표.
//   commission_settlements(처방액·정산액·처방처·CSO) + new_contracts(신규거래처).
//   회계연도 fyMonth 1~12 = 4월~3월. 선택 위탁사(companyId)로 필터.
//   지표 모드:
//     value  : 실적=DB 실측값,  목표=전년 동월 실측 × (1+성장율).
//     growth : 실적=달성 성장율%(당기 vs 전년 동월), 목표=입력한 목표 성장율%.
//              거래처별/처방처별은 '동일 대상'(전·당기 모두 존재) 기준으로 신규·이탈 왜곡 제거.
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

/* 조직 — 이름 기준(= commission_settlements.manager). */
export const ALLIANCE_REPS  = ['박동수', '임경봉', '김윤성', '김양희', '이정원', '이훈섭'];
export const TOTAL_MEMBERS   = ['이욱환'];          // 사업총괄 → 전체 6인 합계
export const DUAL_MEMBERS     = ['박동수'];          // 본인 지역 + 전체 합계 둘 다

export type IndKey    = 'prescription' | 'settlement' | 'new_contract' | 'hospital_cnt' | 'cso_cnt';
export type GrowthKey = 'presc_growth' | 'hosp_growth' | 'presc_growth_cso' | 'presc_growth_hosp';
export type IndMode   = 'value' | 'growth';

type IndSpec = { indKey: string; mode: IndMode; label: string; unit: string };

const VALUE_DEFS: IndSpec[] = [
  { indKey: 'prescription', mode: 'value', label: '처방액',        unit: '백만원' },
  { indKey: 'settlement',   mode: 'value', label: '수수료 정산액', unit: '백만원' },
  { indKey: 'new_contract', mode: 'value', label: '신규거래처',    unit: '건' },
  { indKey: 'hospital_cnt', mode: 'value', label: '처방처 수',      unit: '개' },
  { indKey: 'cso_cnt',      mode: 'value', label: '관리 CSO 수',    unit: '개' },
];
const GROWTH_DEFS: IndSpec[] = [
  { indKey: 'presc_growth',      mode: 'growth', label: '처방액 성장율',                unit: '%' },
  { indKey: 'hosp_growth',       mode: 'growth', label: '처방처수 증가율',              unit: '%' },
  { indKey: 'presc_growth_cso',  mode: 'growth', label: '거래처별 처방액 성장율(동일거래처)', unit: '%' },
  { indKey: 'presc_growth_hosp', mode: 'growth', label: '처방처별 처방액 성장율(동일처방처)', unit: '%' },
];
const ALL_DEFS: IndSpec[] = [...VALUE_DEFS, ...GROWTH_DEFS];

// 하위호환용(기존 참조) — value 지표 정의.
export const IND_DEFS = VALUE_DEFS.map(d => ({ key: d.indKey as IndKey, label: d.label, unit: d.unit }));

export type Scope = 'own' | 'all';
export type MonthCell = {
  fyMonth: number;
  target: number | null;
  actual: number | null;
  curRaw?: number;   // growth: 당기 원자료(처방액 백만원 / 처방처 수)
  prevRaw?: number;  // growth: 전년 동월 원자료(동일대상은 공통 대상만)
};
export type AllianceIndicator = {
  storeKey: string;   // 성장율 저장 키(전체 스코프는 '<key>__all')
  indKey:   string;
  mode:     IndMode;
  label:    string;
  unit:     string;
  scope:    Scope;
  growthPct: number;
  months:   MonthCell[]; // 12개(4~3월)
};

/* 멤버가 표시할 지표(스코프 포함) */
export function indicatorsForMember(name: string): { indKey: string; mode: IndMode; scope: Scope; storeKey: string; label: string; unit: string }[] {
  const base = (scope: Scope) => ALL_DEFS.map(d => ({
    indKey: d.indKey, mode: d.mode, scope,
    storeKey: scope === 'all' ? `${d.indKey}__all` : d.indKey,
    label:  scope === 'all' ? `${d.label} (전체 총괄)` : d.label, unit: d.unit,
  }));
  if (TOTAL_MEMBERS.includes(name)) return base('all');
  if (DUAL_MEMBERS.includes(name))  return [...base('own'), ...base('all')];
  return base('own');
}

/* fyYear 의 12개월 → {fm, ym('YYYY-MM')} */
function fyMonths(fyYear: number): { fm: number; ym: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const fm = i + 1;
    const calM = fm <= 9 ? fm + 3 : fm - 9;
    const calY = fm <= 9 ? fyYear : fyYear + 1;
    return { fm, ym: `${calY}-${String(calM).padStart(2, '0')}` };
  });
}

async function fetchSettle(svc: Svc, managers: string[], companyId: string | null, yms: string[]) {
  const rows: { prescription_month: string; prescription_amount: number; settlement_amount: number; hospital_name: string | null; cso_name: string | null }[] = [];
  let from = 0; const P = 1000;
  while (true) {
    let q = svc.from('commission_settlements')
      .select('prescription_month, prescription_amount, settlement_amount, hospital_name, cso_name')
      .in('manager', managers).in('prescription_month', yms).range(from, from + P - 1);
    if (companyId) q = q.eq('company_id', companyId);
    const { data } = await q;
    if (!data?.length) break;
    rows.push(...(data as typeof rows));
    if (data.length < P) break; from += P;
  }
  return rows;
}

async function fetchContractCounts(svc: Svc, managers: string[], companyId: string | null, yms: string[]): Promise<Map<string, number>> {
  const cnt = new Map<string, number>();
  let from = 0; const P = 1000;
  while (true) {
    let q = svc.from('new_contracts').select('manager, contract_start, company_id').in('manager', managers).range(from, from + P - 1);
    if (companyId) q = q.eq('company_id', companyId);
    const { data } = await q;
    if (!data?.length) break;
    for (const r of data as { contract_start: string | null }[]) {
      const ym = (r.contract_start ?? '').slice(0, 7);
      if (ym && yms.includes(ym)) cnt.set(ym, (cnt.get(ym) ?? 0) + 1);
    }
    if (data.length < P) break; from += P;
  }
  return cnt;
}

/* ym별 지표값 집계 */
type YmAgg = {
  presc: number; settle: number;
  hosp: Set<string>; cso: Set<string>;
  csoPresc: Map<string, number>; hospPresc: Map<string, number>; // 원(won) 단위 처방액
};
function aggregate(rows: Awaited<ReturnType<typeof fetchSettle>>): Map<string, YmAgg> {
  const m = new Map<string, YmAgg>();
  for (const r of rows) {
    const ym = r.prescription_month; if (!ym) continue;
    let a = m.get(ym);
    if (!a) { a = { presc: 0, settle: 0, hosp: new Set(), cso: new Set(), csoPresc: new Map(), hospPresc: new Map() }; m.set(ym, a); }
    const amt = Number(r.prescription_amount ?? 0);
    a.presc  += amt;
    a.settle += Number(r.settlement_amount ?? 0);
    if (r.hospital_name) { a.hosp.add(r.hospital_name); a.hospPresc.set(r.hospital_name, (a.hospPresc.get(r.hospital_name) ?? 0) + amt); }
    if (r.cso_name)      { a.cso.add(r.cso_name);      a.csoPresc.set(r.cso_name,      (a.csoPresc.get(r.cso_name) ?? 0) + amt); }
  }
  return m;
}

const MILLION = 1_000_000;
function indValue(indKey: IndKey, agg: YmAgg | undefined, nc: number): number {
  switch (indKey) {
    case 'prescription': return Math.round((agg?.presc ?? 0) / MILLION);
    case 'settlement':   return Math.round((agg?.settle ?? 0) / MILLION);
    case 'hospital_cnt': return agg?.hosp.size ?? 0;
    case 'cso_cnt':      return agg?.cso.size ?? 0;
    case 'new_contract': return nc;
  }
}

/* 동일 대상(전·당기 모두 존재)의 처방액 합(백만원) */
function sameStore(cur?: Map<string, number>, prev?: Map<string, number>): { cur: number; prev: number } {
  if (!cur || !prev) return { cur: 0, prev: 0 };
  let c = 0, p = 0;
  for (const [k, pv] of prev) {
    const cv = cur.get(k);
    if (cv !== undefined) { c += cv; p += pv; }
  }
  return { cur: Math.round(c / MILLION), prev: Math.round(p / MILLION) };
}

/* growth 지표의 당기·전년 원자료 */
function growthRaw(key: GrowthKey, cur: YmAgg | undefined, prev: YmAgg | undefined): { cur: number; prev: number } {
  switch (key) {
    case 'presc_growth':      return { cur: Math.round((cur?.presc ?? 0) / MILLION), prev: Math.round((prev?.presc ?? 0) / MILLION) };
    case 'hosp_growth':       return { cur: cur?.hosp.size ?? 0, prev: prev?.hosp.size ?? 0 };
    case 'presc_growth_cso':  return sameStore(cur?.csoPresc,  prev?.csoPresc);
    case 'presc_growth_hosp': return sameStore(cur?.hospPresc, prev?.hospPresc);
  }
}

/* 멤버의 얼라이언스 MBO 산출. targetGrowth: 목표성장율(%) — 전 지표 일괄 적용. */
export async function deriveAllianceMbo(
  svc: Svc, memberName: string, fyYear: number, companyId: string | null,
  targetGrowth: number,
): Promise<AllianceIndicator[]> {
  const inds = indicatorsForMember(memberName);
  const curM = fyMonths(fyYear), prevM = fyMonths(fyYear - 1);
  const allYm = [...curM, ...prevM].map(x => x.ym);

  // 스코프별 데이터 1회 로드(캐시)
  const cache = new Map<Scope, { agg: Map<string, YmAgg>; nc: Map<string, number> }>();
  const loadScope = async (scope: Scope) => {
    if (cache.has(scope)) return cache.get(scope)!;
    const managers = scope === 'all' ? ALLIANCE_REPS : [memberName];
    const [rows, nc] = await Promise.all([
      fetchSettle(svc, managers, companyId, allYm),
      fetchContractCounts(svc, managers, companyId, allYm),
    ]);
    const v = { agg: aggregate(rows), nc }; cache.set(scope, v); return v;
  };

  const out: AllianceIndicator[] = [];
  for (const ind of inds) {
    const { agg, nc } = await loadScope(ind.scope);

    let months: MonthCell[];
    if (ind.mode === 'value') {
      months = curM.map(({ fm, ym }, i) => {
        const actual = indValue(ind.indKey as IndKey, agg.get(ym), nc.get(ym) ?? 0);
        const prevYm = prevM[i].ym;
        const prevActual = indValue(ind.indKey as IndKey, agg.get(prevYm), nc.get(prevYm) ?? 0);
        const target = Math.round(prevActual * (1 + targetGrowth / 100));
        return { fyMonth: fm, target, actual };
      });
    } else {
      months = curM.map(({ fm, ym }, i) => {
        const { cur, prev } = growthRaw(ind.indKey as GrowthKey, agg.get(ym), agg.get(prevM[i].ym));
        // 실적 입력월(당기>0 & 전년>0)만 성장율 산출 — 미도래·무기저월은 제외.
        const actual = cur > 0 && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
        return { fyMonth: fm, target: targetGrowth, actual, curRaw: cur, prevRaw: prev };
      });
    }
    out.push({ storeKey: ind.storeKey, indKey: ind.indKey, mode: ind.mode, label: ind.label, unit: ind.unit, scope: ind.scope, growthPct: targetGrowth, months });
  }
  return out;
}
