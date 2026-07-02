/**
 * GET /api/disease-learning
 * 질환학습 데이터 조회
 *
 * Query params:
 *   mode=groups            → 질환군 + 중분류 목록
 *   mode=drugs&group=X&sub=Y → 해당 그룹 의약품 목록 (약가·수수료율·처방액 포함)
 *   mode=mechanism&group=X&sub=Y → 작용기전 설명
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

export const dynamic = 'force-dynamic';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// 최근 N개월 처방액 집계: product_name → total_amount
async function fetchUbistAmounts(
  productNames: string[],
  companyId: string | null,
  months = 3,
): Promise<Map<string, number>> {
  if (!productNames.length) return new Map();

  // 최근 months개 period 계산
  const now = new Date();
  const periods: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = svc()
    .from('ubist_data')
    .select('product_name, prescription_amount')
    .in('product_name', productNames)
    .in('period', periods)
    .not('prescription_amount', 'is', null);

  if (companyId) q = q.eq('company_id', companyId);

  const { data } = await q;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const k = (row.product_name ?? '').trim();
    map.set(k, (map.get(k) ?? 0) + (row.prescription_amount ?? 0));
  }
  return map;
}

// 수수료율: manufacturer → rate (품목 미지정 시 제조사 기본값)
async function fetchCommissionRates(
  manufacturers: string[],
  productNames: string[],
): Promise<Map<string, number>> {
  if (!manufacturers.length) return new Map();

  const { data } = await svc()
    .from('commission_rates')
    .select('company_name, product_name, rate')
    .or(`company_name.in.(${manufacturers.map(m => `"${m}"`).join(',')}),product_name.in.(${productNames.map(p => `"${p}"`).join(',')})`);

  const byProduct = new Map<string, number>();
  const byMfr     = new Map<string, number>();

  for (const row of data ?? []) {
    const rate = Number(row.rate ?? 0);
    if (row.product_name) {
      byProduct.set(row.product_name.trim(), rate);
    } else if (row.company_name) {
      byMfr.set(row.company_name.trim(), rate);
    }
  }

  // 결과: productName → rate (제품명 우선, 없으면 제조사 기본)
  return new Map([...byProduct, ...byMfr]);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!profile || (profile.status as string) !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isAdmin = profileIsAdmin(profile);
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);

  const sp   = req.nextUrl.searchParams;
  const mode = sp.get('mode') ?? 'groups';

  // ── mode=groups: 질환군 목록 ───────────────────────────────────────────
  if (mode === 'groups') {
    const { data } = await svc()
      .from('disease_drugs')
      .select('disease_group, sub_category')
      .not('disease_group', 'is', null)
      .order('disease_group')
      .order('sub_category');

    // 질환군 → [중분류 목록]
    const tree = new Map<string, Set<string>>();
    for (const row of data ?? []) {
      const g = (row.disease_group as string).trim();
      const s = (row.sub_category as string | null)?.trim() ?? '';
      if (!tree.has(g)) tree.set(g, new Set());
      if (s) tree.get(g)!.add(s);
    }

    return NextResponse.json({
      groups: Array.from(tree.entries()).map(([g, subs]) => ({
        group: g,
        subs:  Array.from(subs).sort(),
      })),
    });
  }

  // ── mode=drugs: 의약품 목록 ────────────────────────────────────────────
  if (mode === 'drugs') {
    const group = sp.get('group');
    const sub   = sp.get('sub');

    if (!group) return NextResponse.json({ error: 'group 파라미터 필요' }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = svc()
      .from('disease_drugs')
      .select('id, disease_group, sub_category, treatment_class, ingredient_name, product_name, manufacturer, standard, pay_type, is_original, mechanism, note, atc_code, atc_name, item_code, max_price, reference_drug, permit_kind, approval_date')
      .eq('disease_group', group)
      .order('is_original', { ascending: false })
      .order('ingredient_name')
      .order('product_name');

    if (sub) q = q.eq('sub_category', sub);

    const { data: drugs, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!drugs?.length) return NextResponse.json({ drugs: [] });

    const productNames  = drugs.map((d: { product_name: string }) => d.product_name).filter(Boolean) as string[];
    const manufacturers = [...new Set(drugs.map((d: { manufacturer: string }) => d.manufacturer).filter(Boolean) as string[])];

    // 병렬: Ubist 처방액 + 수수료율
    const [ubistMap, rateMap] = await Promise.all([
      fetchUbistAmounts(productNames, companyId, 3),
      fetchCommissionRates(manufacturers, productNames),
    ]);

    const enriched = drugs.map((d: Record<string, unknown>) => ({
      ...d,
      ubist_amount:    ubistMap.get((d.product_name as string) ?? '') ?? null,
      commission_rate: rateMap.get((d.product_name as string) ?? '')
        ?? rateMap.get((d.manufacturer as string) ?? '')
        ?? null,
    }));

    return NextResponse.json({ drugs: enriched });
  }

  // ── mode=mechanism: 작용기전 ────────────────────────────────────────────
  if (mode === 'mechanism') {
    const group = sp.get('group');
    const sub   = sp.get('sub');
    if (!group) return NextResponse.json({ error: 'group 필요' }, { status: 400 });

    const { data } = await svc()
      .from('disease_drugs')
      .select('mechanism, sub_category, treatment_class')
      .eq('disease_group', group)
      .not('mechanism', 'is', null)
      .limit(50);

    const mechs = new Map<string, string>();
    for (const r of data ?? []) {
      const key = r.sub_category ?? '전체';
      if (!mechs.has(key) && r.mechanism) mechs.set(key, r.mechanism as string);
    }

    return NextResponse.json({
      mechanisms: Array.from(mechs.entries()).map(([sub, text]) => ({ sub, text })),
    });
  }

  return NextResponse.json({ error: `알 수 없는 mode: ${mode}` }, { status: 400 });
}
