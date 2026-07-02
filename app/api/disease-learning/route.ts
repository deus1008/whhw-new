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

  // ubist_data에 실제 존재하는 가장 최신 기간 기준으로 N개월 산출
  const { data: latestRow } = await svc()
    .from('ubist_data')
    .select('period')
    .not('period', 'is', null)
    .order('period', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRow?.period) return { byProduct: new Map(), periods: [] };

  const [latestY, latestM] = (latestRow.period as string).split('-').map(Number);
  const periods: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(latestY, latestM - 1 - i, 1);
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

    // ── disease_drugs 내 동일 제품명 중복 제거 (데이터 더 완전한 행 우선) ──
    const fieldScore = (d: Record<string, unknown>) =>
      Object.values(d).filter(v => v !== null && v !== undefined && v !== '' && v !== '-').length;

    const baseDrugsMap = new Map<string, Record<string, unknown>>();
    for (const d of drugs as Record<string, unknown>[]) {
      const key = ((d.product_name as string | null) ?? '').trim().toLowerCase();
      if (!key) continue;
      const prev = baseDrugsMap.get(key);
      if (!prev || fieldScore(d as Record<string, unknown>) > fieldScore(prev)) {
        baseDrugsMap.set(key, d as Record<string, unknown>);
      }
    }
    const baseDrugs = Array.from(baseDrugsMap.values());

    // 성분명 기반 API 전체 품목 보강
    // 1) HIRA 약가 API (ingrNm): 급여 등재 전 품목 (이미 승인된 서비스)
    // 2) 식약처 DrugPrdtPrmsnInfoService07 (item_ingr_name): 허가 DB 전체
    const uniqueIngrs = [...new Set(
      baseDrugs.map(d => (d.ingredient_name as string | null)?.trim()).filter(Boolean) as string[]
    )];
    // 소문자 정규화: 대소문자·공백 차이로 인한 중복 방지
    const knownNames = new Set(
      baseDrugs.map(d => ((d.product_name as string | null) ?? '').trim().toLowerCase()).filter(Boolean)
    );

    const HIRA_PRICE_URL = 'https://apis.data.go.kr/B551182/dgamtCrtrInfoService1.2/getDgamtList';
    const PRMSN_URL      = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06';
    const drugApiKey     = process.env.DRUG_API_KEY ?? '';

    // HIRA XML → items 파싱
    function parseHiraXml(xml: string): Array<{ name: string; mfr: string; std: string; price: number | null; payType: string | null }> {
      const out: Array<{ name: string; mfr: string; std: string; price: number | null; payType: string | null }> = [];
      for (const block of xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []) {
        const g = (tag: string) => block.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`))?.[1]?.trim() ?? '';
        const raw = g('itmNm');
        if (!raw) continue;
        // 제조사이관 표기 제거: "약품명(A->B)" → "약품명"
        const name = raw.replace(/\s*[\(（][^)\）]*(?:->|→)[^)\）]*[\)）]/g, '').trim();
        const priceRaw = Number(g('mxCprc').replace(/[^0-9]/g, ''));
        out.push({ name, mfr: g('mnfEntpNm'), std: g('nomNm'), price: isNaN(priceRaw) || priceRaw === 0 ? null : priceRaw, payType: g('payTpNm') || null });
      }
      return out;
    }

    // 식약처 JSON body → items
    function parsePrmsnJson(json: Record<string, unknown>): Array<{ name: string; mfr: string; std: string; seq: string; permitDate: string; etcOtc: string }> {
      const body = ((json?.response as Record<string, unknown>)?.body) as Record<string, unknown> | undefined;
      const raw: Record<string, unknown>[] = Array.isArray(body?.items)
        ? (body!.items as Record<string, unknown>[])
        : Array.isArray((body?.items as Record<string, unknown> | undefined)?.item)
          ? ((body!.items as Record<string, unknown>).item as Record<string, unknown>[])
          : (body?.items as Record<string, unknown> | undefined)?.item
            ? [(body!.items as Record<string, unknown>).item as Record<string, unknown>]
            : [];
      return raw.map(it => ({
        name:       ((it.ITEM_NAME as string | null) ?? '').trim(),
        mfr:        ((it.ENTP_NAME as string | null) ?? '').trim(),
        std:        ((it.CHART    as string | null) ?? '').trim(),
        seq:        String(it.ITEM_SEQ ?? ''),
        permitDate: ((it.ITEM_PERMIT_DATE as string | null) ?? '').trim(),
        etcOtc:     ((it.ETC_OTC_CODE    as string | null) ?? '').trim(),
      })).filter(x => x.name);
    }

    const extraDrugs: Record<string, unknown>[] = [];

    if (drugApiKey) {
      for (const ingrName of uniqueIngrs) {
        const coreIngr = ingrName.replace(/[\s（((\d].*$/, '').trim();
        if (coreIngr.length < 2) continue;

        // 두 API 병렬 호출
        const [hiraRes, prmsnRes] = await Promise.allSettled([
          // 1) HIRA 약가 (ingrNm 파라미터 → 성분 기반 전체 급여품목)
          fetch(
            `${HIRA_PRICE_URL}?ServiceKey=${encodeURIComponent(drugApiKey)}&ingrNm=${encodeURIComponent(coreIngr)}&numOfRows=500&pageNo=1`,
            { next: { revalidate: 86400 } },
          ).then(r => r.ok ? r.text() : ''),

          // 2) 식약처 DrugPrdtPrmsnInfoService07 (item_ingr_name → 허가 DB 성분 검색)
          fetch(
            `${PRMSN_URL}?${new URLSearchParams({ serviceKey: drugApiKey, pageNo: '1', numOfRows: '500', type: 'json', item_ingr_name: coreIngr })}`,
            { headers: { Accept: 'application/json' }, next: { revalidate: 86400 } },
          ).then(r => r.ok ? r.json() as Promise<Record<string, unknown>> : {}),
        ]);

        // HIRA 결과 처리
        if (hiraRes.status === 'fulfilled' && hiraRes.value) {
          for (const item of parseHiraXml(hiraRes.value)) {
            const norm = item.name.trim().toLowerCase();
            if (!norm || knownNames.has(norm)) continue;
            knownNames.add(norm);
            extraDrugs.push({
              id: null, disease_group: group, sub_category: sub ?? null, treatment_class: null,
              ingredient_name: ingrName, product_name: item.name, manufacturer: item.mfr || null,
              distributor: null, standard: item.std || null, pay_type: item.payType,
              is_original: false, mechanism: null, note: null, atc_code: null, atc_name: null,
              item_code: null, max_price: item.price, reference_drug: null,
              permit_kind: null, approval_date: null, from_price_db: true,
            });
          }
        }

        // 식약처 결과 처리 (HIRA에 없는 품목 추가)
        if (prmsnRes.status === 'fulfilled' && prmsnRes.value) {
          for (const item of parsePrmsnJson(prmsnRes.value)) {
            const norm = item.name.trim().toLowerCase();
            if (!norm || knownNames.has(norm)) continue;
            knownNames.add(norm);
            extraDrugs.push({
              id: null, disease_group: group, sub_category: sub ?? null, treatment_class: null,
              ingredient_name: ingrName, product_name: item.name, manufacturer: item.mfr || null,
              distributor: null, standard: item.std || null, pay_type: null,
              is_original: false, mechanism: null, note: null, atc_code: null, atc_name: null,
              item_code: item.seq || null, max_price: null, reference_drug: null,
              permit_kind: item.etcOtc || null, approval_date: item.permitDate || null,
              from_price_db: true,
            });
          }
        }
      }
    }

    const allDrugs = [...baseDrugs, ...extraDrugs];
    const productNames  = allDrugs.map(d => d.product_name as string).filter(Boolean);
    const manufacturers = [...new Set(allDrugs.map(d => d.manufacturer as string).filter(Boolean))];

    // 병렬: Ubist 처방액 + 수수료율
    const [ubistData, rateMap] = await Promise.all([
      fetchUbistAmounts(productNames, 1),
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
