'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** 현재 세션 기준 활성 위탁사 ID 조회 */
async function getActiveCompanyId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', user.id)
      .single();
    if (!profile) return null;
    const isAdmin = normalizeRole(profile.role as string) === '관리자';
    const profileCompanyId = (profile.company_id as string) ?? null;
    const isAlliance = isAllianceEmployee(profileCompanyId, isAdmin);
    return await getEffectiveCompanyId(profileCompanyId, isAdmin || isAlliance);
  } catch {
    return null;
  }
}

export type UbistSearchItem = {
  product_name:    string;
  ingredient_name: string | null;
  manufacturer:    string | null;
};

export type UbistPeriodRow = {
  period:         string;
  total_amount:   number;   // 원 단위 합계
  total_count:    number;
};

export type UbistProductAnalysis = {
  product_name:    string;
  ingredient_name: string | null;
  manufacturer:    string | null;
  periods:         UbistPeriodRow[];
  grand_amount:    number;  // 전체 합계 (원)
  grand_count:     number;
};

export type UbistIngredientOption = {
  ingredient_name: string;
  count: number;  // 해당 성분의 고유 제품 수
};

/** 검색어로 성분명 후보 목록 반환 (성분명·제품명 모두 검색) */
export async function findUbistIngredientOptions(query: string): Promise<UbistIngredientOption[]> {
  if (!query.trim()) return [];
  const companyId = await getActiveCompanyId();
  const q = `%${query.trim()}%`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilter(q: any) { return companyId ? q.eq('company_id', companyId) : q; }

  const [r1, r2] = await Promise.all([
    applyFilter(svc().from('ubist_data').select('ingredient_name, product_name')
      .ilike('ingredient_name', q).not('ingredient_name', 'is', null).limit(3000)),
    applyFilter(svc().from('ubist_data').select('ingredient_name, product_name')
      .ilike('product_name', q).not('ingredient_name', 'is', null).limit(3000)),
  ]);

  // 성분명별 고유 제품명 집합
  const map = new Map<string, Set<string>>();
  for (const row of [...(r1.data ?? []), ...(r2.data ?? [])]) {
    const ing  = (row.ingredient_name as string)?.trim();
    const prod = (row.product_name   as string)?.trim();
    if (!ing || !prod) continue;
    if (!map.has(ing)) map.set(ing, new Set());
    map.get(ing)!.add(prod);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 40)
    .map(([ingredient_name, prods]) => ({ ingredient_name, count: prods.size }));
}

/** 선택된 성분명 목록으로 고유 제품 목록 반환 */
export async function searchUbistByIngredients(ingredientNames: string[]): Promise<UbistSearchItem[]> {
  if (!ingredientNames.length) return [];
  const companyId = await getActiveCompanyId();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = svc()
    .from('ubist_data')
    .select('product_name, ingredient_name, manufacturer')
    .in('ingredient_name', ingredientNames)
    .limit(2000);
  if (companyId) q = q.eq('company_id', companyId);
  const { data } = await q;

  const seen = new Map<string, UbistSearchItem>();
  for (const row of data ?? []) {
    const key = (row.product_name ?? '').trim();
    if (key && !seen.has(key)) {
      seen.set(key, {
        product_name:    key,
        ingredient_name: row.ingredient_name ?? null,
        manufacturer:    row.manufacturer    ?? null,
      });
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    const mfr = (a.manufacturer ?? '').localeCompare(b.manufacturer ?? '', 'ko');
    if (mfr !== 0) return mfr;
    return a.product_name.localeCompare(b.product_name, 'ko');
  });
}

/** 의약품명/성분명으로 검색 → 고유 제품 목록 반환 */
export async function searchUbistItems(query: string): Promise<UbistSearchItem[]> {
  if (!query.trim()) return [];
  const companyId = await getActiveCompanyId();
  const q = `%${query.trim()}%`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilter(base: any) { return companyId ? base.eq('company_id', companyId) : base; }

  // .or() 내 한글+% 패턴이 PostgREST에서 인코딩 문제를 일으킬 수 있어
  // 두 개의 별도 쿼리로 분리 후 합산
  const [r1, r2] = await Promise.all([
    applyFilter(svc().from('ubist_data').select('product_name, ingredient_name, manufacturer').ilike('product_name', q).limit(300)),
    applyFilter(svc().from('ubist_data').select('product_name, ingredient_name, manufacturer').ilike('ingredient_name', q).limit(300)),
  ]);

  const combined = [...(r1.data ?? []), ...(r2.data ?? [])];
  if (!combined.length) return [];

  // 제품명 기준 중복 제거 (가장 먼저 나온 행의 manufacturer/ingredient 사용)
  const seen = new Map<string, UbistSearchItem>();
  for (const row of combined) {
    const key = (row.product_name ?? '').trim();
    if (key && !seen.has(key)) {
      seen.set(key, {
        product_name:    key,
        ingredient_name: row.ingredient_name ?? null,
        manufacturer:    row.manufacturer    ?? null,
      });
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => {
      const mfr = (a.manufacturer ?? '').localeCompare(b.manufacturer ?? '', 'ko');
      if (mfr !== 0) return mfr;
      return a.product_name.localeCompare(b.product_name, 'ko');
    });
}

/** 선택된 제품들의 기간별 처방 데이터 집계 */
export async function analyzeUbistItems(
  productNames: string[],
  hospitalTypes?: string[],   // 빈 배열 또는 미전달 = 전체
): Promise<UbistProductAnalysis[]> {
  if (!productNames.length) return [];
  const companyId = await getActiveCompanyId();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = svc()
    .from('ubist_data')
    .select('product_name, ingredient_name, manufacturer, period, prescription_amount, prescription_count')
    .in('product_name', productNames)
    .order('period', { ascending: true });

  if (companyId) query = query.eq('company_id', companyId);
  if (hospitalTypes && hospitalTypes.length > 0) {
    query = query.in('hospital_type', hospitalTypes);
  }

  const { data, error } = await query;

  if (error || !data) return [];

  // product_name → { meta, periods: Map<period, {amount, count}> }
  const prodMap = new Map<string, {
    ingredient_name: string | null;
    manufacturer:    string | null;
    periods:         Map<string, { amount: number; count: number }>;
  }>();

  for (const row of data) {
    const prod   = (row.product_name ?? '').trim();
    const period = (row.period        ?? '').trim();
    if (!prod) continue;

    if (!prodMap.has(prod)) {
      prodMap.set(prod, {
        ingredient_name: row.ingredient_name ?? null,
        manufacturer:    row.manufacturer    ?? null,
        periods:         new Map(),
      });
    }
    const entry = prodMap.get(prod)!;
    const prev  = entry.periods.get(period) ?? { amount: 0, count: 0 };
    entry.periods.set(period, {
      amount: prev.amount + (row.prescription_amount ?? 0),
      count:  prev.count  + (row.prescription_count  ?? 0),
    });
  }

  const result: UbistProductAnalysis[] = [];
  for (const [prodName, { ingredient_name, manufacturer, periods }] of prodMap) {
    const periodRows: UbistPeriodRow[] = Array.from(periods.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, { amount, count }]) => ({ period, total_amount: amount, total_count: count }));

    const grand_amount = periodRows.reduce((s, r) => s + r.total_amount, 0);
    const grand_count  = periodRows.reduce((s, r) => s + r.total_count, 0);

    result.push({ product_name: prodName, ingredient_name, manufacturer, periods: periodRows, grand_amount, grand_count });
  }

  // 요청한 순서로 정렬
  result.sort((a, b) => productNames.indexOf(a.product_name) - productNames.indexOf(b.product_name));
  return result;
}
