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
import { resolveDrugCore, loadReferenceKeys, computeOrigListPrices, origGroupKey } from '@/lib/disease-learning/resolve';
import { profileIsAdmin } from '@/lib/roles';
// getEffectiveCompanyId 불필요 — Ubist는 시장 전체 데이터

export const dynamic = 'force-dynamic';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// 최근 N개월 처방액 집계: 보험코드(insurance_code) → { period: amount }
//   ubist_data.insurance_code == drug_prices.item_code 로 정확 매칭
//   (제품명은 "로수탄젯 정 10/10mg" 처럼 표기가 달라 이름 매칭은 실패)
//   Ubist는 시장 전체 데이터이므로 company_id 필터 없이 조회. 병원구분·지역별 행을 합산.
async function fetchUbistByCode(
  codes: string[],
  months = 1,
): Promise<{ byCode: Map<string, Record<string, number>>; periods: string[] }> {
  if (!codes.length) return { byCode: new Map(), periods: [] };

  const { data: latestRow } = await svc()
    .from('ubist_data')
    .select('period')
    .not('period', 'is', null)
    .order('period', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestRow?.period) return { byCode: new Map(), periods: [] };

  const [latestY, latestM] = (latestRow.period as string).split('-').map(Number);
  const periods: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(latestY, latestM - 1 - i, 1);
    periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const byCode = new Map<string, Record<string, number>>();
  for (let i = 0; i < codes.length; i += 300) {
    const { data } = await svc()
      .from('ubist_data')
      .select('insurance_code, period, prescription_amount')
      .in('insurance_code', codes.slice(i, i + 300))
      .in('period', periods)
      .not('prescription_amount', 'is', null);
    for (const row of data ?? []) {
      const k = String(row.insurance_code ?? '').trim();
      if (!k) continue;
      if (!byCode.has(k)) byCode.set(k, {});
      const cur = byCode.get(k)!;
      cur[row.period] = (cur[row.period] ?? 0) + (row.prescription_amount ?? 0);
    }
  }
  return { byCode, periods };
}

// 수수료율: 수수료율(딜러) 폴더의 최신 파일 기준.
//   수수료율표는 '로스틴군' 처럼 **제품군** 단위라 제품명 정확일치는 실패 →
//   '군' 제거 후 접두 매칭(긴 키 우선) + 회사명 교차확인(동명이품 오매칭 방지).
//   반환: product_name → rate
async function fetchCommissionRates(
  drugs: { product_name: string; company: string | null }[],
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

  const norm = (s: string) => String(s ?? '').replace(/[\s.\-/,·()]/g, '').toLowerCase();

  // 제품군 규칙: '로스틴군' → 접두키 '로스틴' (긴 키부터 매칭)
  const rules = rows
    .filter(r => ((r.product_name as string | null) ?? '').trim())
    .map(r => ({
      key:     norm(String(r.product_name).replace(/군\s*$/, '')),
      company: norm(String(r.company_name ?? '')),
      rate:    Number(r.rate ?? 0),
    }))
    .filter(r => r.key.length >= 2)
    .sort((a, b) => b.key.length - a.key.length);

  // 제품 미지정(회사 단위) 수수료율
  const companyOnly = new Map<string, number>();
  for (const r of rows) {
    if (!((r.product_name as string | null) ?? '').trim()) {
      companyOnly.set(norm(String(r.company_name ?? '')), Number(r.rate ?? 0));
    }
  }

  const out = new Map<string, number>();
  for (const d of drugs) {
    const pn = norm(d.product_name);
    const cn = norm(d.company ?? '');
    if (!pn) continue;
    let rate: number | null = null;
    for (const r of rules) {
      if (!pn.startsWith(r.key)) continue;
      // 회사 정보가 양쪽에 있으면 일치할 때만 적용
      if (r.company && cn && !(cn.includes(r.company) || r.company.includes(cn))) continue;
      rate = r.rate;
      break;
    }
    if (rate == null && cn) rate = companyOnly.get(cn) ?? null;
    if (rate != null) out.set(d.product_name, rate);
  }
  return out;
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

    let allDrugs: Record<string, unknown>[];
    let uniqueIngrs: string[];
    try {
      const core = await resolveDrugCore(svc(), group, sub);
      allDrugs = core.drugs;
      uniqueIngrs = core.uniqueIngrs;
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
    if (!allDrugs.length) return NextResponse.json({ drugs: [] });

    // 제조사 누락 제품 목록 (ubist_data에서 실시간 보완)
    const missingMfrProds = allDrugs
      .filter(d => !d.manufacturer && d.product_name)
      .map(d => d.product_name as string);

    // 처방액: 보험코드 기준 / 수수료율: 제품군 접두 매칭(판매사 기준)
    const codes = [...new Set(allDrugs.map(d => String(d.item_code ?? '')).filter(Boolean))];
    const rateInput = allDrugs.map(d => ({
      product_name: (d.product_name as string) ?? '',
      company: ((d.distributor as string | null) ?? (d.manufacturer as string | null)) ?? null,
    }));

    // 병렬: Ubist 처방액 + 수수료율 + 제조사 보완
    const [ubistData, rateMap, ubistMfrRows] = await Promise.all([
      fetchUbistByCode(codes, 1),
      fetchCommissionRates(rateInput),
      missingMfrProds.length > 0
        ? svc()
            .from('ubist_data')
            .select('product_name, manufacturer')
            .in('ingredient_name', uniqueIngrs)
            .not('manufacturer', 'is', null)
            .limit(3000)
            .then(r => r.data ?? [])
        : Promise.resolve([]),
    ]);

    // normProd(ubist_product_name) → manufacturer 맵으로 누락 제조사 보완
    if (ubistMfrRows.length > 0) {
      const normP = (s: string) => s.replace(/[\s\.\-\/,·]/g, '').toLowerCase();
      const mfrMap = new Map<string, string>();
      for (const row of ubistMfrRows) {
        if (row.product_name && row.manufacturer)
          mfrMap.set(normP(row.product_name as string), row.manufacturer as string);
      }
      for (const drug of allDrugs) {
        if (drug.manufacturer || !drug.product_name) continue;
        const n = normP(drug.product_name as string);
        let mfr: string | undefined;
        if (mfrMap.has(n)) {
          mfr = mfrMap.get(n);
        } else {
          for (const [un, m] of mfrMap) {
            if (un.startsWith(n) || n.startsWith(un)) { mfr = m; break; }
          }
        }
        if (mfr) drug.manufacturer = mfr;
      }
    }

    // 성분명별 오리지널 제품명 → 제네릭의 대조약으로 사용
    const origByIngr = new Map<string, string>();
    for (const d of allDrugs) {
      if (d.is_original && d.ingredient_name && d.product_name) {
        origByIngr.set((d.ingredient_name as string).trim(), (d.product_name as string).trim());
      }
    }

    // 최초등재약가(오리지널) — 동일제제군(성분+함량+제형)별 대조약/오리지널 상한금액 최고가
    const refKeys = await loadReferenceKeys(svc());
    const origPriceByGrp = computeOrigListPrices(allDrugs, refKeys);

    const enriched: Record<string, unknown>[] = allDrugs.map((d: Record<string, unknown>) => {
      const ingrKey = ((d.ingredient_name as string | null) ?? '').trim();
      const computedRef = !d.is_original ? (origByIngr.get(ingrKey) ?? null) : null;
      const og = origPriceByGrp.get(origGroupKey(d));
      return {
        ...d,
        reference_drug:  (d.reference_drug as string | null) ?? computedRef,
        orig_list_price: og?.price ?? null,
        orig_price_est:  og?.estimated ?? false,
        ubist_monthly:   ubistData.byCode.get(String(d.item_code ?? '')) ?? null,
        commission_rate: rateMap.get((d.product_name as string) ?? '') ?? null,
      };
    });

    // 성분 설명(ingredient_info) — 화면에 나오는 성분만
    const ingrNames = [...new Set(enriched
      .map(d => ((d.ingredient_name as string | null) ?? '').trim()).filter(Boolean))];
    const info: Record<string, { description: string; drug_class: string | null; grounded: boolean }> = {};
    for (let i = 0; i < ingrNames.length; i += 200) {
      const { data } = await svc().from('ingredient_info')
        .select('ingredient_name, description, drug_class, grounded')
        .in('ingredient_name', ingrNames.slice(i, i + 200));
      for (const r of data ?? []) {
        info[String(r.ingredient_name)] = {
          description: String(r.description), drug_class: r.drug_class as string | null,
          grounded: Boolean(r.grounded),
        };
      }
    }

    return NextResponse.json({ drugs: enriched, periods: ubistData.periods, info });
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
