// 얼라이언스 MBO 자동 산출 — 지표별 월별 실적(DB) + 목표(전년 실적 × (1+성장율)).
//   commission_settlements(처방액·정산액·처방처·CSO) + new_contracts(신규거래처).
//   회계연도 fyMonth 1~12 = 4월~3월. 선택 위탁사(companyId)로 필터.
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = SupabaseClient<any, any, any>;

/* 조직 — 이름 기준(= commission_settlements.manager). */
export const ALLIANCE_REPS  = ['박동수', '임경봉', '김윤성', '김양희', '이정원', '이훈섭'];
export const TOTAL_MEMBERS   = ['이욱환'];          // 사업총괄 → 전체 6인 합계
export const DUAL_MEMBERS     = ['박동수'];          // 본인 지역 + 전체 합계 둘 다

export type IndKey = 'prescription' | 'settlement' | 'new_contract' | 'hospital_cnt' | 'cso_cnt';
export const IND_DEFS: { key: IndKey; label: string; unit: string }[] = [
  { key: 'prescription', label: '처방액',        unit: '백만원' },
  { key: 'settlement',   label: '수수료 정산액', unit: '백만원' },
  { key: 'new_contract', label: '신규거래처',    unit: '건' },
  { key: 'hospital_cnt', label: '처방처 수',      unit: '개' },
  { key: 'cso_cnt',      label: '관리 CSO 수',    unit: '개' },
];

export type Scope = 'own' | 'all';
export type AllianceIndicator = {
  storeKey: string;   // 성장율 저장 키(전체 스코프는 '<key>__all')
  indKey:   IndKey;
  label:    string;
  unit:     string;
  scope:    Scope;
  growthPct: number;
  months:   { fyMonth: number; target: number | null; actual: number | null }[]; // 12개(4~3월)
};

/* 멤버가 표시할 지표(스코프 포함) */
export function indicatorsForMember(name: string): { indKey: IndKey; scope: Scope; storeKey: string; label: string; unit: string }[] {
  const base = (scope: Scope) => IND_DEFS.map(d => ({
    indKey: d.key, scope, storeKey: scope === 'all' ? `${d.key}__all` : d.key,
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
type YmAgg = { presc: number; settle: number; hosp: Set<string>; cso: Set<string> };
function aggregate(rows: Awaited<ReturnType<typeof fetchSettle>>): Map<string, YmAgg> {
  const m = new Map<string, YmAgg>();
  for (const r of rows) {
    const ym = r.prescription_month; if (!ym) continue;
    let a = m.get(ym); if (!a) { a = { presc: 0, settle: 0, hosp: new Set(), cso: new Set() }; m.set(ym, a); }
    a.presc  += Number(r.prescription_amount ?? 0);
    a.settle += Number(r.settlement_amount ?? 0);
    if (r.hospital_name) a.hosp.add(r.hospital_name);
    if (r.cso_name)      a.cso.add(r.cso_name);
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

/* 멤버의 얼라이언스 MBO 산출. growthMap: storeKey → 성장율(%). */
export async function deriveAllianceMbo(
  svc: Svc, memberName: string, fyYear: number, companyId: string | null,
  growthMap: Record<string, number>,
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
    const growthPct = growthMap[ind.storeKey] ?? 0;
    const months = curM.map(({ fm, ym }, i) => {
      const actual = indValue(ind.indKey, agg.get(ym), nc.get(ym) ?? 0);
      const prevYm = prevM[i].ym;
      const prevActual = indValue(ind.indKey, agg.get(prevYm), nc.get(prevYm) ?? 0);
      const target = Math.round(prevActual * (1 + growthPct / 100));
      return { fyMonth: fm, target, actual };
    });
    out.push({ storeKey: ind.storeKey, indKey: ind.indKey, label: ind.label, unit: ind.unit, scope: ind.scope, growthPct, months });
  }
  return out;
}
