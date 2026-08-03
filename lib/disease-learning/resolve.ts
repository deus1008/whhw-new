import { formOf } from '@/lib/drug-form';
import type { SupabaseClient } from '@supabase/supabase-js';

/* ── 순수 헬퍼 (라우트 drugs 모드와 빌드 잡이 공유) ────────────────── */

export const norm0 = (s: string) => s.replace(/[\s.\-/,·]/g, '').toLowerCase();

// 염·용량 토큰
const SALTS = /\b(calcium|sodium|potassium|magnesium|hydrochloride|hcl|sulfate|sulphate|maleate|besylate|mesylate|dihydrate|trihydrate|monohydrate|hydrate|acetate|fumarate|succinate|tartrate|bitartrate|phosphate|hemihydrate|hydrobromide|nitrate|citrate|ethyl|ester)\b/gi;

// 영문 성분 시그니처: 염·용량 제거 후 핵심 성분 토큰 집합(정렬). 파트 내 의미 토큰 전부 보존.
export const engSig = (ingr: string): string => {
  const toks = ingr.toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,/]/)
    .flatMap(part => part
      .replace(/\d[\d.]*\s*(mg|mcg|g|iu|ml|㎎|㎍)?/gi, ' ')
      .replace(SALTS, ' ')
      .replace(/[^a-z\s]/gi, ' ')
      .trim().split(/\s+/))
    .filter(t => t && t.length >= 3);
  return [...new Set(toks)].sort().join('+');
};

// 제품명 seed: 괄호 이전 첫 토큰 + or() 구문 충돌문자 제거
export const seedOf = (pn: string) =>
  pn.replace(/[（(].*$/, '').trim().split(/\s/)[0].replace(/[,()%*.]/g, '');

// 함량: 활성성분(콤마 구분)별 대표 용량 1개. 괄호 밖 용량 우선(없으면 (as base Xmg)).
const DOSE_RE = /([\d.]+)\s*(mg|mcg|g|iu|ml|㎎|㎍)/i;
const doseOfPart = (part: string): string => {
  const outside = part.replace(/\([^)]*\)/g, ' ');
  const m = outside.match(DOSE_RE) ?? part.match(DOSE_RE);
  return m ? `${Number(m[1])}${m[2].toLowerCase()}` : '';
};
export const strengthOf = (eng: string): string =>
  eng.split(',').map(doseOfPart).filter(Boolean).join('/');

// 함량 정렬(숫자 오름차순)
export const strengthNums = (s: string | null): number[] => (s ?? '').split('/').map(x => parseFloat(x) || 0);
export function cmpStrength(a: string | null, b: string | null): number {
  const A = strengthNums(a), B = strengthNums(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] ?? 0) - (B[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export type DrugCore = Record<string, unknown>;

/* ── 최초등재약가(오리지널 조정 전 상한가) 산출 ─────────────────────────
   규정(약제의 결정 및 조정 기준 별표1)상 최초등재약가 = 최초등재제품의 "조정 전"
   (최초 등재 시점) 상한금액. 이는 과거 이력값으로 현재가 테이블(및 어떤 공식 API)에도
   없다(HIRA dgamt는 코드별 현재가 1건만 반환 — 이력 없음).
   [Phase 1] 급여이력 미적재 상태에서는 역산 추정:
     제네릭 등재가 = 최초등재약가 × 53.55%(규정) 이므로,
     추정 최초등재약가 = max( 대조약(오리지널) 현재가,  최고 제네릭 현재가 ÷ 0.5355 ).
     ( 대조약 현재가는 원가의 하한, 제네릭 역산은 원가 복원 — 둘 중 큰 값 채택 )
   [Phase 2] 대조약 급여이력 최초 등재가 적재 후 정확값으로 교체(estimated=false). */

// 규정: 자료제출의약품(제네릭) 등재가 = 최초등재약가 × 53.55%
const GENERIC_CEILING = 0.5355;

// 대조약 목록의 품목명 정규화 키(용량 괄호·규격 접미어 제거 후 norm0)
export const refKeyOf = (itemName: string): string =>
  norm0(itemName.replace(/_\(.*$/, '').replace(/[（(].*$/, ''));

// 동일제제군 키: 성분(한글) + 함량 + 제형
export const origGroupKey = (d: Record<string, unknown>): string =>
  `${String(d.ingredient_name ?? '').trim()}|${d.strength ?? ''}|${d.form ?? ''}`;

// 식약처 대조약(오리지널) 품목명 정규화 키셋 로드
export async function loadReferenceKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
): Promise<Set<string>> {
  const keys = new Set<string>();
  let from = 0; const P = 1000;
  while (true) {
    const { data } = await db.from('drug_reference').select('item_name').range(from, from + P - 1);
    if (!data?.length) break;
    for (const r of data) { const k = refKeyOf(String((r as { item_name?: string }).item_name ?? '')); if (k) keys.add(k); }
    if (data.length < P) break; from += P;
  }
  return keys;
}

// 동일제제군별 최초등재약가 맵. price=상한가, estimated=역산 추정 여부(false=급여이력 정확값).
//   origByCode(선택): item_code → 급여이력 최초 등재가. 있으면 해당 동일제제군은 정확값 사용.
export function computeOrigListPrices(
  drugs: Record<string, unknown>[],
  refKeys: Set<string>,
  origByCode?: Map<string, number>,
): Map<string, { price: number; estimated: boolean }> {
  // 동일제제군별로 대조약/오리지널 최고가(refMax)·제네릭 최고가(genMax)·이력 정확가(exact) 집계
  const agg = new Map<string, { refMax: number; genMax: number; exact: number }>();
  for (const d of drugs) {
    const p = Number(d.max_price ?? 0);
    if (!(p > 0)) continue;
    const k = origGroupKey(d);
    const a = agg.get(k) ?? { refMax: 0, genMax: 0, exact: 0 };
    const isRef = refKeys.has(refKeyOf(String(d.product_name ?? ''))) || Boolean(d.is_original);
    if (isRef) a.refMax = Math.max(a.refMax, p);
    else       a.genMax = Math.max(a.genMax, p);
    const hist = origByCode?.get(String(d.item_code ?? ''));
    if (hist && hist > 0) a.exact = Math.max(a.exact, hist);
    agg.set(k, a);
  }
  const out = new Map<string, { price: number; estimated: boolean }>();
  for (const [k, a] of agg) {
    if (a.exact > 0) { out.set(k, { price: a.exact, estimated: false }); continue; } // 급여이력 정확값
    const est = a.genMax > 0 ? Math.round(a.genMax / GENERIC_CEILING) : 0;
    const price = Math.max(a.refMax, est);
    if (price > 0) out.set(k, { price, estimated: true }); // 폴백: 역산 추정
  }
  return out;
}

/* ── drugs 결정적 코어 ──────────────────────────────────────────────
   disease_drugs(큐레이션) → 영문 시그니처 다수결 → drug_prices 확장 →
   한글 성분명 폴백 → 제조원(permit_pkg) 보강 → 가격 백필 → allDrugs(각 행 strength 포함).
   라우트/빌드가 공유. ubist·수수료율·ingredient_info 등 enrichment 는 호출부(라우트)에서 수행. */
export async function resolveDrugCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  group: string,
  sub: string | null,
): Promise<{ drugs: DrugCore[]; uniqueIngrs: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db
    .from('disease_drugs')
    .select('id, disease_group, sub_category, treatment_class, ingredient_name, product_name, manufacturer, distributor, standard, pay_type, is_original, mechanism, note, atc_code, atc_name, item_code, max_price, reference_drug, permit_kind, approval_date')
    .eq('disease_group', group)
    .order('is_original', { ascending: false })
    .order('ingredient_name')
    .order('product_name');
  if (sub) q = q.eq('sub_category', sub);

  const { data: drugs, error } = await q;
  if (error) throw new Error(error.message);
  if (!drugs?.length) return { drugs: [], uniqueIngrs: [] };

  // 동일 제품명 중복 제거(데이터 더 완전한 행 우선)
  const fieldScore = (d: Record<string, unknown>) =>
    Object.values(d).filter(v => v !== null && v !== undefined && v !== '' && v !== '-').length;
  const baseDrugsMap = new Map<string, Record<string, unknown>>();
  for (const d of drugs as Record<string, unknown>[]) {
    const key = ((d.product_name as string | null) ?? '').trim().toLowerCase();
    if (!key) continue;
    const prev = baseDrugsMap.get(key);
    if (!prev || fieldScore(d) > fieldScore(prev)) baseDrugsMap.set(key, d);
  }
  const baseDrugs: Record<string, unknown>[] = Array.from(baseDrugsMap.values()).map(d => ({
    ...d, form: formOf(null, (d.product_name as string | null) ?? null),
  }));

  const uniqueIngrs = [...new Set(
    baseDrugs.map(d => (d.ingredient_name as string | null)?.trim()).filter(Boolean) as string[]
  )];

  // 1) 한글 성분 → 영문 시그니처 (제품별 다수결)
  const sigByKo = new Map<string, string>();
  const prodsByKo = new Map<string, string[]>();
  for (const d of baseDrugs) {
    const ko = ((d.ingredient_name as string | null) ?? '').trim();
    const pn = ((d.product_name as string | null) ?? '').trim();
    if (!ko || !pn) continue;
    if (!prodsByKo.has(ko)) prodsByKo.set(ko, []);
    const arr = prodsByKo.get(ko)!;
    if (!arr.includes(pn)) arr.push(pn);
  }
  for (const [ko, prods] of prodsByKo) {
    const seeds = [...new Set(prods.map(seedOf).filter(s => s.length >= 2))];
    if (!seeds.length) continue;
    const orFilter = seeds.map(s => `item_name.ilike.${s}%`).join(',');
    const { data } = await db.from('drug_prices').select('item_name, ingredient_name').or(orFilter).limit(300);
    const rows = (data ?? []) as { item_name: string; ingredient_name: string }[];
    const votes = new Map<string, number>();
    for (const s of seeds) {
      const ns = norm0(s);
      const row = rows.find(r => norm0(r.item_name ?? '').startsWith(ns));
      if (!row) continue;
      const sig = engSig(row.ingredient_name ?? '');
      if (sig) votes.set(sig, (votes.get(sig) ?? 0) + 1);
    }
    if (!votes.size) continue;
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) sigByKo.set(ko, ranked[0][0]);
  }

  // 오리지널 판정용 접두어
  const origPrefixes = baseDrugs
    .filter(d => d.is_original && d.product_name)
    .map(d => norm0((d.product_name as string).replace(/[（(].*$/, '')))
    .filter(Boolean);
  const isOriginalName = (itemName: string): boolean => {
    const nn = norm0(itemName.replace(/[（(].*$/, ''));
    return !!nn && origPrefixes.some(p => nn.startsWith(p) || p.startsWith(nn));
  };

  // 2) 시그니처별 drug_prices 전 품목 보강(급여코드 단위 중복제거)
  const byCode = new Map<string, Record<string, unknown>>();
  for (const [koIngr, sig] of sigByKo) {
    for (const tok of sig.split('+')) {
      const { data } = await db
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
          strength: strengthOf(eng) || null,
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

  // 2-b) 영문 시그니처 미해석 성분 → 한글 성분명으로 item_name 직접 매칭 보강
  const doseSimple = (eng: string): string | null => {
    const m = eng.match(/([\d.]+)\s*(mg|mcg|g|iu|ml|㎎|㎍)/i);
    return m ? `${Number(m[1])}${m[2].toLowerCase()}` : null;
  };
  const unresolvedIngrs = uniqueIngrs.filter(ko => !sigByKo.has(ko));
  for (const ko of unresolvedIngrs) {
    const koCore = ko.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim();
    if (koCore.length < 3) continue;
    const { data } = await db
      .from('drug_prices')
      .select('item_code, item_name, ingredient_name, manufacturer, standard, pay_type, max_price, unit')
      .ilike('item_name', `%${koCore}%`).limit(1500);
    for (const r of data ?? []) {
      const code = String(r.item_code ?? '');
      if (!code || byCode.has(code)) continue;
      const eng = (r.ingredient_name as string) ?? '';
      byCode.set(code, {
        id: null, disease_group: group, sub_category: sub ?? null, treatment_class: null,
        ingredient_name: ko, product_name: r.item_name,
        strength: doseSimple(eng),
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

  // 제조사(제조원) 보강: permit_pkg(급여코드 → 허가 상세 제조원)
  {
    const codes = [...byCode.keys()];
    for (let i = 0; i < codes.length; i += 200) {
      const { data } = await db.from('permit_pkg').select('code, maker').in('code', codes.slice(i, i + 200));
      for (const r of data ?? []) {
        const row = byCode.get(String(r.code));
        if (row && r.maker) row.manufacturer = String(r.maker);
      }
    }
  }

  const expandedProducts = Array.from(byCode.values());
  const unresolvedBase = baseDrugs.filter(
    d => !sigByKo.has(((d.ingredient_name as string | null) ?? '').trim()),
  );

  // baseDrug 가격/제조사 백필 (max_price null)
  const normP0 = (s: string) => s.replace(/[\s.\-/,·]/g, '').toLowerCase();
  const baseMissingPrice = baseDrugs.filter(d => !d.max_price && d.product_name);
  if (baseMissingPrice.length > 0) {
    const orFilter = baseMissingPrice
      .map(d => `item_name.ilike.${(d.product_name as string).replace(/[%*?]/g, '')}%`)
      .join(',');
    const { data: dpRows } = await db
      .from('drug_prices')
      .select('item_name, max_price, manufacturer, pay_type, standard')
      .or(orFilter)
      .limit(200);
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
      if (!drug.max_price   && found.max_price)     drug.max_price   = found.max_price;
      if (!drug.manufacturer && found.manufacturer) drug.manufacturer = found.manufacturer;
      if (!drug.pay_type    && found.pay_type)      drug.pay_type    = found.pay_type;
      if (!drug.standard    && found.standard)      drug.standard    = found.standard;
    }
  }

  const allDrugs = [...expandedProducts, ...unresolvedBase];
  return { drugs: allDrugs, uniqueIngrs };
}
