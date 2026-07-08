'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { BRAND_GROUPS, NEW_PRODUCTS } from './constants';

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

/* ── 월 형식 변환 헬퍼 (YYYY-MM ↔ YYYYMM) ───────────────────── */

function toYYYYMM(m: string): string {
  return m.replace('-', '');
}

function fromYYYYMM(m: string): string {
  return m.length === 6 ? `${m.slice(0, 4)}-${m.slice(4)}` : m;
}

/* ── 사용 가능한 월 목록 ────────────────────────────────────────── */

export async function getAvailableMonths(companyId?: string | null): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = svc()
    .from('trend_prescriptions')
    .select('prescription_month')
    .not('prescription_month', 'is', null)
    .not('sales_rep', 'is', null)
    .order('prescription_month', { ascending: false })
    .limit(5000);
  if (companyId) q = q.eq('company_id', companyId);
  const { data } = await q;

  const months = [...new Set(((data ?? []) as { prescription_month: string }[]).map(r => fromYYYYMM(r.prescription_month)))]
    .sort()
    .reverse();
  return months;
}

/* ── 특정 월의 전체 데이터 로드 (trend_prescriptions) ──────────── */

export async function getMonthData(month: string, companyId?: string | null): Promise<MonthDataResult> {
  const prevDate = new Date(month + '-01');
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);

  const trendStartDate = new Date(month + '-01');
  trendStartDate.setMonth(trendStartDate.getMonth() - 11);
  const trendStart = trendStartDate.toISOString().slice(0, 7);

  const monthQ      = toYYYYMM(month);
  const prevMonthQ  = toYYYYMM(prevMonth);
  const trendStartQ = toYYYYMM(trendStart);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function withCompany(q: any) {
    return companyId ? q.eq('company_id', companyId) : q;
  }

  const [currRes, prevRes, trendRes, monthsRes] = await Promise.all([
    withCompany(svc()
      .from('trend_prescriptions')
      .select('sales_rep, cso_name, hospital_name, hospital_type, prescription_amount')
      .eq('prescription_month', monthQ)
      .not('sales_rep', 'is', null))
      .limit(200000),

    withCompany(svc()
      .from('trend_prescriptions')
      .select('sales_rep, prescription_amount')
      .eq('prescription_month', prevMonthQ)
      .not('sales_rep', 'is', null))
      .limit(200000),

    withCompany(svc()
      .from('trend_prescriptions')
      .select('sales_rep, prescription_month, prescription_amount')
      .gte('prescription_month', trendStartQ)
      .lte('prescription_month', monthQ)
      .not('sales_rep', 'is', null)
      .not('prescription_month', 'is', null))
      .limit(1000000),

    withCompany(svc()
      .from('trend_prescriptions')
      .select('prescription_month')
      .not('prescription_month', 'is', null)
      .not('sales_rep', 'is', null)
      .order('prescription_month', { ascending: false }))
      .limit(5000),
  ]);

  const currData  = currRes.data  ?? [];
  const prevData  = prevRes.data  ?? [];
  const trendData = trendRes.data ?? [];

  // Available months (YYYYMM → YYYY-MM)
  const available_months = [...new Set(((monthsRes.data ?? []) as { prescription_month: string }[]).map(r => fromYYYYMM(r.prescription_month)))]
    .sort().reverse();

  // Current month: aggregation by sales_rep
  type MgrEntry = { total: number; hospitals: Set<string> };
  const mgrMap = new Map<string, MgrEntry>();
  for (const r of currData) {
    const mgr = (r.sales_rep as string)?.trim();
    if (!mgr) continue;
    if (!mgrMap.has(mgr)) mgrMap.set(mgr, { total: 0, hospitals: new Set() });
    const e = mgrMap.get(mgr)!;
    e.total += Number(r.prescription_amount ?? 0);
    if (r.hospital_name) e.hospitals.add(r.hospital_name as string);
  }

  // Previous month: by sales_rep
  const prevMap = new Map<string, number>();
  for (const r of prevData) {
    const mgr = (r.sales_rep as string)?.trim();
    if (!mgr) continue;
    prevMap.set(mgr, (prevMap.get(mgr) ?? 0) + Number(r.prescription_amount ?? 0));
  }

  const by_manager: ManagerRow[] = Array.from(mgrMap.entries()).map(([manager, e]) => {
    const prev = prevMap.get(manager) ?? 0;
    const change_pct = prev > 0 ? ((e.total - prev) / prev) * 100 : null;
    return { manager, total_amount: e.total, hospital_cnt: e.hospitals.size, prev_amount: prev, change_pct };
  }).sort((a, b) => b.total_amount - a.total_amount);

  // CSO breakdown
  type CsoEntry = { total: number; hospitals: Set<string> };
  const csoMap = new Map<string, CsoEntry>();
  for (const r of currData) {
    const mgr = (r.sales_rep as string)?.trim();
    const cso = ((r.cso_name as string) ?? '미지정').trim() || '미지정';
    if (!mgr) continue;
    const key = `${mgr}||${cso}`;
    if (!csoMap.has(key)) csoMap.set(key, { total: 0, hospitals: new Set() });
    const e = csoMap.get(key)!;
    e.total += Number(r.prescription_amount ?? 0);
    if (r.hospital_name) e.hospitals.add(r.hospital_name as string);
  }

  const by_cso: CsoRow[] = Array.from(csoMap.entries())
    .map(([key, e]) => {
      const [manager, cso_name] = key.split('||');
      return { manager, cso_name, total_amount: e.total, hospital_cnt: e.hospitals.size };
    })
    .sort((a, b) => {
      const mc = a.manager.localeCompare(b.manager, 'ko');
      return mc !== 0 ? mc : b.total_amount - a.total_amount;
    });

  // Hospital type breakdown
  type HospEntry = { total: number; hospitals: Set<string> };
  const hospMap = new Map<string, HospEntry>();
  for (const r of currData) {
    const mgr = (r.sales_rep as string)?.trim();
    const ht  = (r.hospital_type as string)?.trim() || '기타';
    if (!mgr) continue;
    const key = `${mgr}||${ht}`;
    if (!hospMap.has(key)) hospMap.set(key, { total: 0, hospitals: new Set() });
    const e = hospMap.get(key)!;
    e.total += Number(r.prescription_amount ?? 0);
    if (r.hospital_name) e.hospitals.add(r.hospital_name as string);
  }

  const by_hosp_type: HospTypeRow[] = Array.from(hospMap.entries())
    .map(([key, e]) => {
      const [manager, hospital_type] = key.split('||');
      return { manager, hospital_type, hospital_cnt: e.hospitals.size, total_amount: e.total };
    })
    .sort((a, b) => {
      const mc = a.manager.localeCompare(b.manager, 'ko');
      return mc !== 0 ? mc : b.total_amount - a.total_amount;
    });

  // Trend data (YYYYMM → YYYY-MM for prescription_month)
  const trendAgg = new Map<string, number>();
  for (const r of trendData) {
    const mgr = (r.sales_rep as string)?.trim();
    const pm  = fromYYYYMM((r.prescription_month as string)?.trim() ?? '');
    if (!mgr || !pm) continue;
    const key = `${mgr}||${pm}`;
    trendAgg.set(key, (trendAgg.get(key) ?? 0) + Number(r.prescription_amount ?? 0));
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

  return { available_months, by_manager, by_cso, by_hosp_type, trend, grand_total, prev_grand_total };
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
