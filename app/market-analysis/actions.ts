'use server';

import { createClient as createSvc } from '@supabase/supabase-js';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// 한국 의약품 제형 접미사 (길이 내림차순으로 정렬 — 먼저 매칭)
const DRUG_FORM_SUFFIXES = [
  '서방정', '필름정', '장용정', '주사액', '점안액', '점이액', '흡입액',
  '캡슐', '주사', '시럽', '과립', '연고', '크림', '패치', '겔', '스프레이',
  '좌제', '산제', '용액', '정',
];

/**
 * "오메프라졸캡슐" → "%오메프라졸%캡슐%"
 * 공백 없이 붙여 쓴 의약품명+제형을 분리해 ILIKE 와일드카드 패턴으로 변환.
 * 이미 공백이 포함된 경우 또는 접미사가 없으면 원래 패턴 그대로 반환.
 */
function buildProductSearchPattern(q: string): string {
  if (q.includes(' ')) return `%${q}%`;
  for (const form of DRUG_FORM_SUFFIXES) {
    if (q.endsWith(form) && q.length > form.length) {
      const base = q.slice(0, q.length - form.length).trim();
      if (base) return `%${base}%${form}%`;
    }
  }
  return `%${q}%`;
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
  const rawQ  = query.trim();
  const ingQ  = `%${rawQ}%`;
  const prodQ = buildProductSearchPattern(rawQ);

  // Ubist는 시장 전체 데이터 — company_id 필터 없이 조회
  const [r1, r2, r3] = await Promise.all([
    // 성분명으로 검색 (ingredient_name 있는 경우)
    svc().from('ubist_data').select('ingredient_name, product_name')
      .ilike('ingredient_name', ingQ).not('ingredient_name', 'is', null).limit(3000),
    // 제품명으로 검색 — 제형 접미사 분리 패턴 적용 (ingredient_name 있는 경우)
    svc().from('ubist_data').select('ingredient_name, product_name')
      .ilike('product_name', prodQ).not('ingredient_name', 'is', null).limit(3000),
    // 제품명으로 검색 (ingredient_name 없는 경우 — 제품명을 그룹핑 키로 사용)
    svc().from('ubist_data').select('ingredient_name, product_name')
      .ilike('product_name', prodQ).is('ingredient_name', null).limit(3000),
  ]);

  // 성분명별 고유 제품명 집합
  const map = new Map<string, Set<string>>();

  // ingredient_name 기준 그룹핑
  for (const row of [...(r1.data ?? []), ...(r2.data ?? [])]) {
    const ing  = (row.ingredient_name as string)?.trim();
    const prod = (row.product_name   as string)?.trim();
    if (!ing || !prod) continue;
    if (!map.has(ing)) map.set(ing, new Set());
    map.get(ing)!.add(prod);
  }

  // ingredient_name이 null인 경우: 제품명을 키로 사용
  for (const row of r3.data ?? []) {
    const prod = (row.product_name as string)?.trim();
    if (!prod) continue;
    if (!map.has(prod)) map.set(prod, new Set());
    map.get(prod)!.add(prod);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 40)
    .map(([ingredient_name, prods]) => ({ ingredient_name, count: prods.size }));
}

/** 선택된 성분명 목록으로 고유 제품 목록 반환 */
export async function searchUbistByIngredients(ingredientNames: string[]): Promise<UbistSearchItem[]> {
  if (!ingredientNames.length) return [];

  const [r1, r2] = await Promise.all([
    // ingredient_name 기준 검색 (성분명이 있는 경우)
    svc()
      .from('ubist_data')
      .select('product_name, ingredient_name, manufacturer')
      .in('ingredient_name', ingredientNames)
      .limit(2000),
    // ingredient_name이 null인 경우: product_name이 키로 사용됐으므로 product_name으로 검색
    svc()
      .from('ubist_data')
      .select('product_name, ingredient_name, manufacturer')
      .in('product_name', ingredientNames)
      .is('ingredient_name', null)
      .limit(2000),
  ]);

  const seen = new Map<string, UbistSearchItem>();
  for (const row of [...(r1.data ?? []), ...(r2.data ?? [])]) {
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
  const rawQ  = query.trim();
  const ingQ  = `%${rawQ}%`;
  const prodQ = buildProductSearchPattern(rawQ);

  const [r1, r2] = await Promise.all([
    svc().from('ubist_data').select('product_name, ingredient_name, manufacturer').ilike('product_name', prodQ).limit(300),
    svc().from('ubist_data').select('product_name, ingredient_name, manufacturer').ilike('ingredient_name', ingQ).limit(300),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = svc()
    .from('ubist_data')
    .select('product_name, ingredient_name, manufacturer, period, prescription_amount, prescription_count')
    .in('product_name', productNames)
    .order('period', { ascending: true });

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
