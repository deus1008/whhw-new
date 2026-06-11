'use server';

import { createClient as createSvc } from '@supabase/supabase-js';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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

/** 의약품명/성분명으로 검색 → 고유 제품 목록 반환 */
export async function searchUbistItems(query: string): Promise<UbistSearchItem[]> {
  if (!query.trim()) return [];
  const q = `%${query.trim()}%`;

  const { data, error } = await svc()
    .from('ubist_data')
    .select('product_name, ingredient_name, manufacturer')
    .or(`product_name.ilike.${q},ingredient_name.ilike.${q}`)
    .limit(500);

  if (error || !data) return [];

  // 제품명 기준 중복 제거 (가장 먼저 나온 행의 manufacturer/ingredient 사용)
  const seen = new Map<string, UbistSearchItem>();
  for (const row of data) {
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
    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'ko'));
}

/** 선택된 제품들의 기간별 처방 데이터 집계 */
export async function analyzeUbistItems(
  productNames: string[],
): Promise<UbistProductAnalysis[]> {
  if (!productNames.length) return [];

  const { data, error } = await svc()
    .from('ubist_data')
    .select('product_name, ingredient_name, manufacturer, period, prescription_amount, prescription_count')
    .in('product_name', productNames)
    .order('period', { ascending: true });

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
