'use server';

import { createClient as createSvc } from '@supabase/supabase-js';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type DrugResult = {
  item_name:       string;
  ingredient_name: string | null;
  manufacturer:    string | null;
  max_price:       number | null;
  standard:        string | null;
  item_code:       string | null;
};

export type CommissionRate = {
  company_name: string;
  product_name: string | null;
  rate:         number;  // % 단위 (예: 15.5)
};

export type SimRow = DrugResult & {
  quantity:            number;
  commission_rate:     number;
  prescription_amount: number;
  settlement_amount:   number;
  rate_matched:        boolean;  // DB 수수료율 매칭 여부
};

/* ── 1단계: 검색어로 성분명 후보 목록 조회 ─────────────── */
// 성분명/제품명 모두 검색 → 매칭되는 성분명(함량 포함)별 제품 수 반환
export async function findIngredientOptions(query: string): Promise<{ ingredient_name: string; count: number }[]> {
  if (!query.trim()) return [];

  const q = `%${query.trim()}%`;
  const { data, error } = await svc()
    .from('drug_prices')
    .select('ingredient_name')
    .or(`ingredient_name.ilike.${q},item_name.ilike.${q}`)
    .not('ingredient_name', 'is', null)
    .not('max_price', 'is', null)
    .limit(2000);

  if (error) { console.error('[findIngredientOptions]', error); return []; }

  // ingredient_name 별 카운트
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const ing = row.ingredient_name as string;
    if (ing) counts[ing] = (counts[ing] ?? 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])   // 제품 수 많은 순
    .slice(0, 30)
    .map(([ingredient_name, count]) => ({ ingredient_name, count }));
}

/* ── 2단계: 선택된 성분명(=함량)으로 전 제약사 제품 조회 ── */
export async function getDrugsByExactIngredient(ingredientName: string): Promise<DrugResult[]> {
  if (!ingredientName.trim()) return [];

  const { data, error } = await svc()
    .from('drug_prices')
    .select('item_name, ingredient_name, manufacturer, max_price, standard, item_code')
    .eq('ingredient_name', ingredientName)
    .not('max_price', 'is', null)
    .order('manufacturer')
    .order('item_name')
    .limit(300);

  if (error) { console.error('[getDrugsByExactIngredient]', error); return []; }
  return (data ?? []) as DrugResult[];
}

/* ── 수수료율 조회 (가장 최근 업로드 파일 기준) ─────────── */
export type CommissionRateResult = {
  rates:      CommissionRate[];
  sourceFile: string | null;   // 기준 파일명
};

export async function getCommissionRates(companyId?: string | null): Promise<CommissionRateResult> {
  // documents 테이블에서 가장 최근 업로드(ready)된 수수료율 파일 기준 (위탁사별 필터)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docsQ: any = svc()
    .from('documents')
    .select('filename, created_at')
    .eq('category', '수수료율(딜러)')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1);
  if (companyId) docsQ = docsQ.eq('company_id', companyId);
  const { data: latest } = await docsQ.single();

  if (!latest?.filename) return { rates: [], sourceFile: null };

  // Supabase REST API 기본 max_rows=1000 제한 → 페이지네이션으로 전체 로드
  const PAGE = 1000;
  const allRates: CommissionRate[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await svc()
      .from('commission_rates')
      .select('company_name, product_name, rate')
      .eq('source_file', latest.filename)
      .order('company_name')
      .order('id', { ascending: true })   // 안정적 페이지네이션 보장
      .range(page * PAGE, (page + 1) * PAGE - 1);

    if (error) { console.error('[getCommissionRates] 페이지', page, error); break; }
    if (!data || data.length === 0) break;
    allRates.push(...(data as CommissionRate[]));
    if (data.length < PAGE) break;  // 마지막 페이지
    page++;
  }

  console.log(`[getCommissionRates] 총 ${allRates.length}행 로드 완료 (${page + 1}페이지)`);
  return { rates: allRates, sourceFile: latest.filename };
}
