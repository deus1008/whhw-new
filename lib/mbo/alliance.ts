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
export type IndMode   = 'value' | 'growth' | 'rate';

type IndSpec = { indKey: string; mode: IndMode; label: string; unit: string };

const VALUE_DEFS: IndSpec[] = [
  { indKey: 'prescription', mode: 'value', label: '처방액',        unit: '백만원' },
  { indKey: 'settlement',   mode: 'value', label: '수수료 정산액', unit: '백만원' },
  { indKey: 'new_contract', mode: 'value', label: '신규거래처',    unit: '건' },
  { indKey: 'hospital_cnt', mode: 'value', label: '처방처 수',      unit: '개' },
  { indKey: 'cso_cnt',      mode: 'value', label: '관리 CSO 수',    unit: '개' },
];
// 수수료율 = 수수료정산액 / 처방액 (낮을수록 우수 — 목표수수료율 대비 관리).
const RATE_DEFS: IndSpec[] = [
  { indKey: 'comm_rate', mode: 'rate', label: '수수료율(처방액 대비 정산액)', unit: '%' },
];
const GROWTH_DEFS: IndSpec[] = [
  { indKey: 'presc_growth',      mode: 'growth', label: '처방액 성장율',                unit: '%' },
  { indKey: 'hosp_growth',       mode: 'growth', label: '처방처수 증가율',              unit: '%' },
  { indKey: 'presc_growth_cso',  mode: 'growth', label: '거래처별 처방액 성장율(동일거래처)', unit: '%' },
  { indKey: 'presc_growth_hosp', mode: 'growth', label: '처방처별 처방액 성장율(동일처방처)', unit: '%' },
];
const ALL_DEFS: IndSpec[] = [...VALUE_DEFS, ...RATE_DEFS, ...GROWTH_DEFS];

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

/* 정산 원장 월별 집계 — DB(RPC)에서 수행. 12개월 원자료(당기·전년 + same-store) 반환. */
export type AggRow = {
  i: number; cur_ym: string; prev_ym: string;
  presc: number; settle: number; hosp_cnt: number; cso_cnt: number;
  prev_presc: number; prev_settle: number; prev_hosp_cnt: number; prev_cso_cnt: number;
  ss_cso_cur: number; ss_cso_prev: number; ss_hosp_cur: number; ss_hosp_prev: number;
};
async function loadAgg(svc: Svc, managers: string[], companyId: string | null, curYms: string[], prevYms: string[]): Promise<AggRow[]> {
  const { data, error } = await svc.rpc('get_alliance_mbo_agg', {
    p_managers: managers, p_company: companyId, p_cur_yms: curYms, p_prev_yms: prevYms,
  });
  if (error) throw error;
  return (data ?? []) as AggRow[];
}

// 전체 스코프(6인 합산) — 사전집계 뷰 전용 RPC(담당자 차원 없음).
async function loadAggAll(svc: Svc, companyId: string | null, curYms: string[], prevYms: string[]): Promise<AggRow[]> {
  const { data, error } = await svc.rpc('get_alliance_mbo_agg_all', {
    p_company: companyId, p_cur_yms: curYms, p_prev_yms: prevYms,
  });
  if (error) throw error;
  return (data ?? []) as AggRow[];
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

const MILLION = 1_000_000;
const rMil = (won: number) => Math.round(Number(won ?? 0) / MILLION);

/* value 지표의 당기·전년 값 */
function valueOf(indKey: IndKey, row: AggRow, curNc: number, prevNc: number): { cur: number; prev: number } {
  switch (indKey) {
    case 'prescription': return { cur: rMil(row.presc),   prev: rMil(row.prev_presc) };
    case 'settlement':   return { cur: rMil(row.settle),  prev: rMil(row.prev_settle) };
    case 'hospital_cnt': return { cur: Number(row.hosp_cnt), prev: Number(row.prev_hosp_cnt) };
    case 'cso_cnt':      return { cur: Number(row.cso_cnt),  prev: Number(row.prev_cso_cnt) };
    case 'new_contract': return { cur: curNc, prev: prevNc };
  }
}

/* growth 지표의 당기·전년 원자료 */
function growthOf(key: GrowthKey, row: AggRow): { cur: number; prev: number } {
  switch (key) {
    case 'presc_growth':      return { cur: rMil(row.presc),        prev: rMil(row.prev_presc) };
    case 'hosp_growth':       return { cur: Number(row.hosp_cnt),   prev: Number(row.prev_hosp_cnt) };
    case 'presc_growth_cso':  return { cur: rMil(row.ss_cso_cur),   prev: rMil(row.ss_cso_prev) };
    case 'presc_growth_hosp': return { cur: rMil(row.ss_hosp_cur),  prev: rMil(row.ss_hosp_prev) };
  }
}

/* 멤버의 얼라이언스 MBO 산출.
   targetGrowth: 목표성장율(%) — value·growth 지표 일괄. commTarget: 목표수수료율(%). */
export async function deriveAllianceMbo(
  svc: Svc, memberName: string, fyYear: number, companyId: string | null,
  targetGrowth: number, commTarget: number,
): Promise<AllianceIndicator[]> {
  const inds = indicatorsForMember(memberName);
  const curM = fyMonths(fyYear), prevM = fyMonths(fyYear - 1);
  const curYms = curM.map(x => x.ym), prevYms = prevM.map(x => x.ym);
  const allYm = [...curYms, ...prevYms];

  // 스코프별 데이터 1회 로드(캐시) — RPC 집계 + 신규계약 건수.
  const cache = new Map<Scope, { rows: AggRow[]; nc: Map<string, number> }>();
  const loadScope = async (scope: Scope) => {
    if (cache.has(scope)) return cache.get(scope)!;
    const managers = scope === 'all' ? ALLIANCE_REPS : [memberName];
    const [rows, nc] = await Promise.all([
      scope === 'all'
        ? loadAggAll(svc, companyId, curYms, prevYms)
        : loadAgg(svc, managers, companyId, curYms, prevYms),
      fetchContractCounts(svc, managers, companyId, allYm),
    ]);
    const byI = new Map(rows.map(r => [Number(r.i), r]));
    const zero: AggRow = { i: 0, cur_ym: '', prev_ym: '', presc: 0, settle: 0, hosp_cnt: 0, cso_cnt: 0, prev_presc: 0, prev_settle: 0, prev_hosp_cnt: 0, prev_cso_cnt: 0, ss_cso_cur: 0, ss_cso_prev: 0, ss_hosp_cur: 0, ss_hosp_prev: 0 };
    const ordered = curM.map((_, idx) => byI.get(idx + 1) ?? zero);
    const v = { rows: ordered, nc }; cache.set(scope, v); return v;
  };

  const out: AllianceIndicator[] = [];
  for (const ind of inds) {
    const { rows, nc } = await loadScope(ind.scope);

    const months: MonthCell[] = curM.map(({ fm, ym }, i) => {
      const row = rows[i];
      const prevYm = prevM[i].ym;
      if (ind.mode === 'value') {
        const { cur, prev } = valueOf(ind.indKey as IndKey, row, nc.get(ym) ?? 0, nc.get(prevYm) ?? 0);
        let target: number;
        if (ind.indKey === 'settlement') {
          // 정산액 목표 = 처방액 목표 × 목표수수료율. (정산 원장 전년값 공백과 무관)
          const prescTarget = Math.round(rMil(row.prev_presc) * (1 + targetGrowth / 100));
          target = Math.round((prescTarget * commTarget) / 100);
        } else {
          target = Math.round(prev * (1 + targetGrowth / 100));
        }
        return { fyMonth: fm, target, actual: cur };
      }
      if (ind.mode === 'rate') {
        // 수수료율 = 정산액 / 처방액 (%). 정산 완료월(둘 다 >0)만 산출. 낮을수록 우수.
        const presc = rMil(row.presc), settle = rMil(row.settle);
        const actual = presc > 0 && settle > 0 ? Math.round((settle / presc) * 1000) / 10 : null;
        return { fyMonth: fm, target: commTarget, actual, curRaw: settle, prevRaw: presc };
      }
      const { cur, prev } = growthOf(ind.indKey as GrowthKey, row);
      // 실적 입력월(당기>0 & 전년>0)만 성장율 산출 — 미도래·무기저월은 제외.
      const actual = cur > 0 && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
      return { fyMonth: fm, target: targetGrowth, actual, curRaw: cur, prevRaw: prev };
    });

    const gp = ind.mode === 'rate' ? commTarget : targetGrowth;
    out.push({ storeKey: ind.storeKey, indKey: ind.indKey, mode: ind.mode, label: ind.label, unit: ind.unit, scope: ind.scope, growthPct: gp, months });
  }
  return out;
}
