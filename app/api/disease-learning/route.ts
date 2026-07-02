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
// getEffectiveCompanyId 불필요 — Ubist는 시장 전체 데이터

export const dynamic = 'force-dynamic';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// 최근 N개월 처방액 집계: product_name → { period: amount }
// Ubist는 시장 전체 데이터이므로 company_id 필터 없이 조회
async function fetchUbistAmounts(
  productNames: string[],
  months = 3,
): Promise<{ byProduct: Map<string, Record<string, number>>; periods: string[] }> {
  if (!productNames.length) return { byProduct: new Map(), periods: [] };

  // 오래된 순서로 정렬 (예: ['2026-05','2026-06','2026-07'])
  const now = new Date();
  const periods: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const { data } = await svc()
    .from('ubist_data')
    .select('product_name, period, prescription_amount')
    .in('product_name', productNames)
    .in('period', periods)
    .not('prescription_amount', 'is', null);

  const byProduct = new Map<string, Record<string, number>>();
  for (const row of data ?? []) {
    const k = (row.product_name ?? '').trim();
    if (!byProduct.has(k)) byProduct.set(k, {});
    const cur = byProduct.get(k)!;
    cur[row.period] = (cur[row.period] ?? 0) + (row.prescription_amount ?? 0);
  }
  return { byProduct, periods };
}

// 수수료율: 수수료율(딜러) 폴더의 최신 파일 기준 조회
// product_name 일치 우선, 없으면 company_name(제약사) 일치
async function fetchCommissionRates(
  manufacturers: string[],
  productNames: string[],
): Promise<Map<string, number>> {
  // 최신 수수료율(딜러) 파일명 조회
  const { data: latestDoc } = await svc()
    .from('documents')
    .select('filename')
    .eq('category', '수수료율(딜러)')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 최신 파일 기준으로 전체 수수료율 로드 (파일이 없으면 전체)
  let q = svc()
    .from('commission_rates')
    .select('company_name, product_name, rate');

  if (latestDoc?.filename) {
    q = q.eq('source_file', latestDoc.filename);
  }

  const { data: rows } = await q;
  if (!rows?.length) return new Map();

  // JS에서 매칭: product_name 우선, 없으면 company_name
  const mfrSet  = new Set(manufacturers.map(m => m.trim().toLowerCase()));
  const prodSet = new Set(productNames.map(p => p.trim().toLowerCase()));

  const byProduct = new Map<string, number>();
  const byMfr     = new Map<string, number>();

  for (const row of rows) {
    const rate    = Number(row.rate ?? 0);
    const prod    = (row.product_name as string | null)?.trim() ?? '';
    const company = (row.company_name as string).trim();

    if (prod && prodSet.has(prod.toLowerCase())) {
      byProduct.set(prod, rate);
    }
    if (mfrSet.has(company.toLowerCase())) {
      byMfr.set(company, rate);
    }
  }

  // productName → rate 우선, manufacturer → rate 보조
  return new Map([...byMfr, ...byProduct]);
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
      .select('id, disease_group, sub_category, treatment_class, ingredient_name, product_name, manufacturer, distributor, standard, pay_type, is_original, mechanism, note, atc_code, atc_name, item_code, max_price, reference_drug, permit_kind, approval_date')
      .eq('disease_group', group)
      .order('is_original', { ascending: false })
      .order('ingredient_name')
      .order('product_name');

    if (sub) q = q.eq('sub_category', sub);

    const { data: drugs, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!drugs?.length) return NextResponse.json({ drugs: [] });

    // 식약처 DrugPrdtPrmsnInfoService07 API로 동일 성분 제네릭 보강
    const uniqueIngrs = [...new Set(
      (drugs as Record<string, unknown>[])
        .map(d => (d.ingredient_name as string | null)?.trim())
        .filter(Boolean) as string[]
    )];
    const knownNames = new Set(
      (drugs as Record<string, unknown>[]).map(d => (d.product_name as string | null)?.trim()).filter(Boolean)
    );

    const PRMSN_URL = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06';
    const drugApiKey = process.env.DRUG_API_KEY ?? '';

    const extraDrugs: Record<string, unknown>[] = [];
    for (const ingrName of uniqueIngrs) {
      // 성분명 핵심어 추출 (숫자·괄호 이전)
      const coreIngr = ingrName.replace(/[\s（((\d].*$/, '').trim();
      if (coreIngr.length < 2 || !drugApiKey) continue;
      try {
        const qs = new URLSearchParams({
          serviceKey: drugApiKey,
          pageNo: '1',
          numOfRows: '200',
          type: 'json',
          item_name: coreIngr,
        });
        const res = await fetch(`${PRMSN_URL}?${qs}`, {
          headers: { Accept: 'application/json' },
          next: { revalidate: 86400 },
        });
        if (!res.ok) continue;

        const json = await res.json() as Record<string, unknown>;
        const body = ((json?.response as Record<string, unknown>)?.body) as Record<string, unknown> | undefined;
        const rawItems: Record<string, unknown>[] = Array.isArray(body?.items)
          ? (body!.items as Record<string, unknown>[])
          : Array.isArray((body?.items as Record<string, unknown> | undefined)?.item)
            ? ((body!.items as Record<string, unknown>).item as Record<string, unknown>[])
            : (body?.items as Record<string, unknown> | undefined)?.item
              ? [(body!.items as Record<string, unknown>).item as Record<string, unknown>]
              : [];

        for (const item of rawItems) {
          const pName = (item.ITEM_NAME as string | null)?.trim();
          if (!pName || knownNames.has(pName)) continue;
          knownNames.add(pName);
          extraDrugs.push({
            id: null,
            disease_group: group,
            sub_category: sub ?? null,
            treatment_class: null,
            ingredient_name: ingrName,
            product_name: pName,
            manufacturer: (item.ENTP_NAME as string | null) ?? null,
            distributor: null,
            standard: (item.CHART as string | null) ?? null,
            pay_type: null,
            is_original: false,
            mechanism: null,
            note: null,
            atc_code: null,
            atc_name: null,
            item_code: String(item.ITEM_SEQ ?? '') || null,
            max_price: null,
            reference_drug: null,
            permit_kind: (item.ETC_OTC_CODE as string | null) ?? null,
            approval_date: (item.ITEM_PERMIT_DATE as string | null) ?? null,
            from_price_db: true,
          });
        }
      } catch { /* API 실패 시 스킵 */ }
    }

    const allDrugs = [...(drugs as Record<string, unknown>[]), ...extraDrugs];
    const productNames  = allDrugs.map(d => d.product_name as string).filter(Boolean);
    const manufacturers = [...new Set(allDrugs.map(d => d.manufacturer as string).filter(Boolean))];

    // 병렬: Ubist 처방액 + 수수료율
    const [ubistData, rateMap] = await Promise.all([
      fetchUbistAmounts(productNames, 3),
      fetchCommissionRates(manufacturers, productNames),
    ]);

    // 성분명별 오리지널 제품명 → 제네릭의 대조약으로 사용
    const origByIngr = new Map<string, string>();
    for (const d of allDrugs) {
      if (d.is_original && d.ingredient_name && d.product_name) {
        origByIngr.set((d.ingredient_name as string).trim(), (d.product_name as string).trim());
      }
    }

    const enriched = allDrugs.map((d: Record<string, unknown>) => {
      const ingrKey = ((d.ingredient_name as string | null) ?? '').trim();
      const computedRef = !d.is_original ? (origByIngr.get(ingrKey) ?? null) : null;
      return {
        ...d,
        reference_drug:  (d.reference_drug as string | null) ?? computedRef,
        ubist_monthly:   ubistData.byProduct.get((d.product_name as string) ?? '') ?? null,
        commission_rate: rateMap.get((d.product_name as string) ?? '')
          ?? rateMap.get((d.manufacturer as string) ?? '')
          ?? null,
      };
    });

    return NextResponse.json({ drugs: enriched, periods: ubistData.periods });
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
