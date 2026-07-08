'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { BRAND_GROUPS, NEW_PRODUCTS } from './constants';
import { getEdiData } from '@/app/edi/actions';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/* ── 공통 타입 ──────────────────────────────────────────────────── */

export type ManagerRow = {
  manager: string;
  total_amount: number;
  hospital_cnt: number;
  prev_amount: number;
  change_pct: number | null;
};

export type CsoRow = {
  manager: string;
  cso_name: string;
  total_amount: number;
  hospital_cnt: number;
};

export type TrendRow = {
  manager: string;
  prescription_month: string;
  total_amount: number;
};

export type HospTypeRow = {
  manager: string;
  hospital_type: string;
  hospital_cnt: number;
  total_amount: number;
};

export type MonthDataResult = {
  available_months: string[];
  by_manager: ManagerRow[];
  by_cso: CsoRow[];
  by_hosp_type: HospTypeRow[];
  trend: TrendRow[];
  grand_total: number;
  prev_grand_total: number;
};

export type MboTarget = {
  manager: string;
  monthly_target: number; // 백만원 단위
};

/* ── 월 형식 변환 헬퍼 ─────────────────────────────────────────── */

function toYYYYMM(m: string): string {
  return m.replace('-', '');
}

function fromYYYYMM(m: string): string {
  return m.length === 6 ? `${m.slice(0, 4)}-${m.slice(4)}` : m;
}

/** EDI period("YYYY.MM" 또는 파일명 폴백) → "YYYY-MM" */
function periodToDisplay(period: string): string {
  const m = period.match(/(\d{4})[.\-](\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
}

/** EDI period → "YYYYMM" */
function periodToKey(period: string): string {
  const m = period.match(/(\d{4})[.\-]?(\d{2})/);
  return m ? `${m[1]}${m[2]}` : '';
}

/* ── 사용 가능한 월 목록 (EDI 캐시 기반) ───────────────────────── */

export async function getAvailableMonths(_companyId?: string | null): Promise<string[]> {
  const { reports } = await getEdiData();
  const months = new Set<string>();
  for (const r of reports) {
    const ym = periodToDisplay(r.period);
    if (ym) months.add(ym);
  }
  return [...months].sort().reverse();
}

/* ── 특정 월의 전체 데이터 로드 (EDI 캐시 기반) ────────────────── */

export async function getMonthData(months: string | string[], _companyId?: string | null): Promise<MonthDataResult> {
  const monthsArr = Array.isArray(months) ? months : [months];
  const sortedMonths = [...monthsArr].sort();
  const latestMonth   = sortedMonths[sortedMonths.length - 1];
  const earliestMonth = sortedMonths[0];

  const prevDate = new Date(earliestMonth + '-01');
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);

  const trendStartDate = new Date(latestMonth + '-01');
  trendStartDate.setMonth(trendStartDate.getMonth() - 11);

  const targetKeys   = monthsArr.map(toYYYYMM);
  const prevKey      = toYYYYMM(prevMonth);
  const trendMinKey  = toYYYYMM(trendStartDate.toISOString().slice(0, 7));
  const trendMaxKey  = toYYYYMM(latestMonth);

  const { reports } = await getEdiData();

  const available_months = [...new Set(
    reports.map(r => periodToDisplay(r.period)).filter(Boolean)
  )].sort().reverse();

  const currReports  = reports.filter(r => targetKeys.includes(periodToKey(r.period)));
  const prevReports  = reports.filter(r => periodToKey(r.period) === prevKey);
  const trendReports = reports.filter(r => {
    const k = periodToKey(r.period);
    return k >= trendMinKey && k <= trendMaxKey;
  });

  // 현재 월 집계
  type MgrData = {
    total: number;
    hospitals: Set<string>;
    csos: Map<string, { total: number; hospitals: Set<string> }>;
  };
  const mgrMap = new Map<string, MgrData>();

  for (const report of currReports) {
    for (const sp of report.data.salesPersonStats) {
      if (!sp.name) continue;
      if (!mgrMap.has(sp.name)) mgrMap.set(sp.name, { total: 0, hospitals: new Set(), csos: new Map() });
      const me = mgrMap.get(sp.name)!;
      me.total += sp.amount;
      for (const cso of sp.csos) {
        const ck = cso.name || '미지정';
        for (const hos of cso.hospitals) me.hospitals.add(hos.name);
        if (!me.csos.has(ck)) me.csos.set(ck, { total: 0, hospitals: new Set() });
        const ce = me.csos.get(ck)!;
        ce.total += cso.amount;
        for (const hos of cso.hospitals) ce.hospitals.add(hos.name);
      }
    }
  }

  // 전월 집계
  const prevMap = new Map<string, number>();
  for (const report of prevReports) {
    for (const sp of report.data.salesPersonStats) {
      if (!sp.name) continue;
      prevMap.set(sp.name, (prevMap.get(sp.name) ?? 0) + sp.amount);
    }
  }

  const by_manager: ManagerRow[] = Array.from(mgrMap.entries()).map(([manager, d]) => {
    const prev = prevMap.get(manager) ?? 0;
    return {
      manager,
      total_amount: d.total,
      hospital_cnt: d.hospitals.size,
      prev_amount: prev,
      change_pct: prev > 0 ? ((d.total - prev) / prev) * 100 : null,
    };
  }).sort((a, b) => b.total_amount - a.total_amount);

  const by_cso: CsoRow[] = [];
  for (const [manager, md] of mgrMap.entries()) {
    for (const [cso_name, cd] of md.csos.entries()) {
      by_cso.push({ manager, cso_name, total_amount: cd.total, hospital_cnt: cd.hospitals.size });
    }
  }
  by_cso.sort((a, b) => {
    const mc = a.manager.localeCompare(b.manager, 'ko');
    return mc !== 0 ? mc : b.total_amount - a.total_amount;
  });

  // 트렌드 집계 (12개월)
  const trendAgg = new Map<string, number>();
  for (const report of trendReports) {
    const pm = periodToDisplay(report.period);
    if (!pm) continue;
    for (const sp of report.data.salesPersonStats) {
      if (!sp.name) continue;
      const key = `${sp.name}||${pm}`;
      trendAgg.set(key, (trendAgg.get(key) ?? 0) + sp.amount);
    }
  }

  const trend: TrendRow[] = Array.from(trendAgg.entries())
    .map(([key, total_amount]) => {
      const [manager, prescription_month] = key.split('||');
      return { manager, prescription_month, total_amount };
    })
    .sort((a, b) => {
      const mc = a.manager.localeCompare(b.manager, 'ko');
      return mc !== 0 ? mc : a.prescription_month.localeCompare(b.prescription_month);
    });

  const grand_total = by_manager.reduce((s, r) => s + r.total_amount, 0);
  const prev_grand_total = Array.from(prevMap.values()).reduce((s, v) => s + v, 0);

  return {
    available_months,
    by_manager,
    by_cso,
    by_hosp_type: [], // EDI 파일에 종별 데이터 없음
    trend,
    grand_total,
    prev_grand_total,
  };
}

/* ── Ubist 브랜드 처방액 (아주약품) ────────────────────────────── */

export async function getUbistData(reportMonth: string): Promise<{
  periods: string[];
  brandData: Record<string, Record<string, number>>;
  newProductData: Record<string, Record<string, number>>;
}> {
  // 12개월 기간 계산
  const startDate = new Date(reportMonth + '-01');
  startDate.setMonth(startDate.getMonth() - 11);
  const periodStart = startDate.toISOString().slice(0, 7);

  const [brandRes, newProdRes] = await Promise.all([
    svc()
      .from('ubist_data')
      .select('product_name, period, prescription_amount')
      .eq('manufacturer', '아주약품')
      .gte('period', periodStart)
      .lte('period', reportMonth)
      .not('period', 'is', null)
      .limit(200000),

    svc()
      .from('ubist_data')
      .select('product_name, period, prescription_amount')
      .in('manufacturer', ['아주약품'])
      .or(NEW_PRODUCTS.map(g => g.products.map(p => `product_name.ilike.%${p}%`).join(',')).join(','))
      .not('period', 'is', null)
      .limit(50000),
  ]);

  const allBrandRows = brandRes.data ?? [];
  const allNewProdRows = newProdRes.data ?? [];

  // Collect all periods
  const periodSet = new Set<string>();
  for (const r of allBrandRows) if (r.period) periodSet.add(r.period as string);
  const periods = Array.from(periodSet).sort();

  // Brand data aggregation (by brand group)
  const brandData: Record<string, Record<string, number>> = {};
  for (const group of BRAND_GROUPS) {
    brandData[group.name] = {};
    for (const period of periods) brandData[group.name][period] = 0;
  }

  for (const r of allBrandRows) {
    const prodName = (r.product_name as string)?.trim() ?? '';
    const period   = (r.period as string)?.trim() ?? '';
    const amount   = Number(r.prescription_amount ?? 0);
    if (!period) continue;

    for (const group of BRAND_GROUPS) {
      if (group.products.some(p => prodName.includes(p))) {
        brandData[group.name][period] = (brandData[group.name][period] ?? 0) + amount;
        break;
      }
    }
  }

  // New product data
  const newProductData: Record<string, Record<string, number>> = {};
  for (const group of NEW_PRODUCTS) newProductData[group.name] = {};

  for (const r of allNewProdRows) {
    const prodName = (r.product_name as string)?.trim() ?? '';
    const period   = (r.period as string)?.trim() ?? '';
    const amount   = Number(r.prescription_amount ?? 0);
    if (!period) continue;

    for (const group of NEW_PRODUCTS) {
      if (group.products.some(p => prodName.includes(p))) {
        newProductData[group.name][period] = (newProductData[group.name][period] ?? 0) + amount;
        break;
      }
    }
  }

  return { periods, brandData, newProductData };
}

/* ── MBO 월별 목표 조회 ─────────────────────────────────────── */

const MGR_USER_IDS: Record<string, string> = {
  '박동수': '3fb7c091-a436-4ec6-a50b-6de7cdb803b4',
  '김윤성': '7c77f77f-d73b-4ceb-9829-9c403c2f316a',
  '임경봉': 'bda0593d-4a45-4e1a-9fbe-be3235dc3d9b',
  '김양희': '5bcdb9ca-d7e5-4f34-b4f1-85bc13ff1e54',
  '이정원': '8a67fbd1-4d02-4e7c-ad6b-b746126013d1',
  '이훈섭': '74cc19ef-5e8c-4f4e-acc8-96a83ffcdc13',
  '이욱환': 'dccefb28-c090-45aa-8fd2-77f8fc5b5b76',
};

export async function getMboTargetsForReport(reportMonth: string): Promise<MboTarget[]> {
  const [yearStr, monthStr] = reportMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || !month) return [];

  const allUserIds = Object.values(MGR_USER_IDS);

  const { data: targets } = await svc()
    .from('mbo_targets')
    .select('id, user_id')
    .eq('year', year)
    .ilike('item_name', '%처방액%')
    .is('month', null)
    .in('user_id', allUserIds);

  if (!targets || targets.length === 0) return [];

  const targetIds = targets.map(t => t.id as string);

  const { data: actuals } = await svc()
    .from('mbo_monthly_actuals')
    .select('target_id, target_value')
    .in('target_id', targetIds)
    .eq('month', month);

  const idToManager = Object.fromEntries(
    Object.entries(MGR_USER_IDS).map(([name, id]) => [id, name])
  );

  const result: MboTarget[] = [];
  for (const actual of actuals ?? []) {
    const parent = targets.find(t => t.id === actual.target_id);
    if (!parent) continue;
    const manager = idToManager[parent.user_id as string];
    if (!manager) continue;
    result.push({ manager, monthly_target: Number(actual.target_value ?? 0) });
  }

  return result;
}
