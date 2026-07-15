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
import { formOf } from '@/lib/drug-form';
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
    // 큐레이션 행은 unit 이 없으므로 제품명으로 제형 판정
    const baseDrugs: Record<string, unknown>[] = Array.from(baseDrugsMap.values()).map(d => ({
      ...d, form: formOf(null, (d.product_name as string | null) ?? null),
    }));

    // ── 성분 기반 전체 품목 보강 — 약품검색(drug_prices)과 동일 소스, 급여코드(item_code) 기준 ──
    // disease_drugs 성분명은 한글, drug_prices 성분명은 영문이므로,
    // 큐레이션 대표 제품명을 drug_prices 에 접두 매칭해 '영문 성분 시그니처'를 구한 뒤
    // 동일 시그니처(단일↔단일 / 복합↔복합)의 전 품목을 급여코드 단위로 보강한다.
    const uniqueIngrs = [...new Set(
      baseDrugs.map(d => (d.ingredient_name as string | null)?.trim()).filter(Boolean) as string[]
    )];

    const norm0 = (s: string) => s.replace(/[\s.\-/,·]/g, '').toLowerCase();
    // 영문 성분 시그니처: 염·용량 제거 후 핵심 성분 토큰 집합(정렬)
    const SALTS = /\b(calcium|sodium|potassium|magnesium|hydrochloride|hcl|sulfate|sulphate|maleate|besylate|mesylate|dihydrate|trihydrate|monohydrate|hydrate|acetate|fumarate|succinate|tartrate|bitartrate|phosphate|hemihydrate|hydrobromide|nitrate|citrate|ethyl|ester)\b/gi;
    const engSig = (ingr: string): string => {
      const toks = ingr.toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .split(/[,/]/)
        .map(part => part
          .replace(/\d[\d.]*\s*(mg|mcg|g|iu|ml|㎎|㎍)?/gi, ' ')
          .replace(SALTS, ' ')
          .replace(/[^a-z\s]/gi, ' ')
          .trim().split(/\s+/)[0])
        .filter(t => t && t.length >= 3);
      return [...new Set(toks)].sort().join('+');
    };

    // 1) 한글 성분 → 영문 시그니처 (성분별 대표 제품을 drug_prices 접두 매칭)
    const sigByKo = new Map<string, string>();
    const seedByKo = new Map<string, string>();
    for (const d of baseDrugs) {
      const ko = ((d.ingredient_name as string | null) ?? '').trim();
      const pn = ((d.product_name as string | null) ?? '').trim();
      if (ko && pn && !seedByKo.has(ko)) seedByKo.set(ko, pn);
    }
    for (const [ko, pn] of seedByKo) {
      const seed = pn.replace(/[（(].*$/, '').trim().split(/\s/)[0];
      if (seed.length < 2) continue;
      const { data } = await svc().from('drug_prices')
        .select('ingredient_name').ilike('item_name', `${seed}%`).limit(1);
      const eng = (data?.[0]?.ingredient_name as string | undefined);
      if (eng) { const sig = engSig(eng); if (sig) sigByKo.set(ko, sig); }
    }

    // 오리지널 판정용 접두어(큐레이션 is_original 제품명)
    const origPrefixes = baseDrugs
      .filter(d => d.is_original && d.product_name)
      .map(d => norm0((d.product_name as string).replace(/[（(].*$/, '')))
      .filter(Boolean);
    const isOriginalName = (itemName: string): boolean => {
      const nn = norm0(itemName.replace(/[（(].*$/, ''));
      return !!nn && origPrefixes.some(p => nn.startsWith(p) || p.startsWith(nn));
    };

    // 함량 추출: 영문 성분에서 해당 성분의 '기준 함량'
    //   "rosuvastatin calcium (as rosuvastatin   10mg)" → 10mg  (as 표기 우선)
    //   "simvastatin   20mg"                            → 20mg
    const doseOf = (eng: string, tok: string): string => {
      const asRe    = new RegExp(`as\\s+${tok}[^)0-9]*([\\d.]+)\\s*(mg|mcg|g|iu|ml|㎍)`, 'i');
      const plainRe = new RegExp(`${tok}[^,/;()]*?([\\d.]+)\\s*(mg|mcg|g|iu|ml|㎍)`, 'i');
      const m = eng.match(asRe) ?? eng.match(plainRe);
      return m ? `${Number(m[1])}${m[2].toLowerCase()}` : '';
    };
    const strengthOf = (eng: string, sig: string): string =>
      sig.split('+').map(t => doseOf(eng, t)).filter(Boolean).join('/');

    // 2) 시그니처별 drug_prices 전 품목 보강 (급여코드=item_code 단위 중복제거)
    const byCode = new Map<string, Record<string, unknown>>();
    for (const [koIngr, sig] of sigByKo) {
      for (const tok of sig.split('+')) {
        const { data } = await svc()
          .from('drug_prices')
          .select('item_code, item_name, ingredient_name, manufacturer, standard, pay_type, max_price, unit')
          .ilike('ingredient_name', `%${tok}%`).limit(1500);
        for (const r of data ?? []) {
          const eng = (r.ingredient_name as string) ?? '';
          if (engSig(eng) !== sig) continue;
          const code = String(r.item_code ?? '');
          if (!code || byCode.has(code)) continue;
          byCode.set(code, {
            id: null, disease_group: group, sub_category: sub ?? null, treatment_class: null,
            ingredient_name: koIngr, product_name: r.item_name,
            strength: strengthOf(eng, sig) || null,          // 4단계: 함량
            // drug_prices.manufacturer 는 허가/판매사 → 판매사(distributor).
            // 제조사(제조원)는 아래에서 permit_pkg.maker 로 보강.
            manufacturer: r.manufacturer || null,
            distributor:  r.manufacturer || null,
            standard: r.standard || null, pay_type: r.pay_type || null,
            is_original: isOriginalName((r.item_name as string) ?? ''),
            mechanism: null, note: null, atc_code: null, atc_name: null,
            item_code: code, max_price: r.max_price ?? null, reference_drug: null,
            permit_kind: null, approval_date: null, from_price_db: true,
            form: formOf(r.unit as string | null, (r.item_name as string) ?? null),
          });
        }
      }
    }

    // 제조사(제조원) 보강: permit_pkg(급여코드 → 허가 상세 제조원)
    {
      const codes = [...byCode.keys()];
      for (let i = 0; i < codes.length; i += 200) {
        const { data } = await svc().from('permit_pkg')
          .select('code, maker').in('code', codes.slice(i, i + 200));
        for (const r of data ?? []) {
          const row = byCode.get(String(r.code));
          if (row && r.maker) row.manufacturer = String(r.maker);   // 제조사 = 실제 제조원
        }
      }
    }

    // 확장된 성분 = 급여코드 전 품목 / 미해석 성분 = 큐레이션 원본 유지
    const expandedProducts = Array.from(byCode.values());
    const unresolvedBase = baseDrugs.filter(
      d => !sigByKo.has(((d.ingredient_name as string | null) ?? '').trim()),
    );

    // ── drug_prices에서 누락 데이터 보완 (max_price/manufacturer/pay_type null 인 baseDrug) ──
    // HIRA API 성분명이 영문인 경우 ingredient_name 검색 실패 → 제품명 prefix로 직접 조회
    const normP0 = (s: string) => s.replace(/[\s\.\-\/,·]/g, '').toLowerCase();
    const baseMissingPrice = baseDrugs.filter(d => !d.max_price && d.product_name);
    if (baseMissingPrice.length > 0) {
      const orFilter = baseMissingPrice
        .map(d => `item_name.ilike.${(d.product_name as string).replace(/[%*?]/g, '')}%`)
        .join(',');
      const { data: dpRows } = await svc()
        .from('drug_prices')
        .select('item_name, max_price, manufacturer, pay_type, standard')
        .or(orFilter)
        .limit(200);
      // 제품명 앞부분(괄호 이전) 기준 맵 구성
      const dpMap = new Map<string, Record<string, unknown>>();
      for (const row of dpRows ?? []) {
        const baseKey = normP0(((row.item_name as string) ?? '').replace(/[（(].*$/, '').trim());
        if (!dpMap.has(baseKey)) dpMap.set(baseKey, row as Record<string, unknown>);
      }
      for (const drug of baseDrugs) {
        if (drug.max_price || !drug.product_name) continue;
        const key = normP0((drug.product_name as string).replace(/[（(].*$/, '').trim());
        const found = dpMap.get(key);
        if (!found) continue;
        if (!drug.max_price   && found.max_price)   drug.max_price   = found.max_price;
        if (!drug.manufacturer && found.manufacturer) drug.manufacturer = found.manufacturer;
        if (!drug.pay_type    && found.pay_type)    drug.pay_type    = found.pay_type;
        if (!drug.standard    && found.standard)    drug.standard    = found.standard;
      }
    }

    const allDrugs = [...expandedProducts, ...unresolvedBase];

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

    const enriched = allDrugs.map((d: Record<string, unknown>) => {
      const ingrKey = ((d.ingredient_name as string | null) ?? '').trim();
      const computedRef = !d.is_original ? (origByIngr.get(ingrKey) ?? null) : null;
      return {
        ...d,
        reference_drug:  (d.reference_drug as string | null) ?? computedRef,
        ubist_monthly:   ubistData.byCode.get(String(d.item_code ?? '')) ?? null,
        commission_rate: rateMap.get((d.product_name as string) ?? '') ?? null,
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
