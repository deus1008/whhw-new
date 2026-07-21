/**
 * 시장 landscape 자동 구성 — UBIST 처방데이터를 성분키로 집계.
 *
 * ubist_data.ingredient_name(예: 'finasteride 1mg [159001ATB]')이 동일 성분+함량
 * 경쟁품목을 한 키로 묶으므로, 그 키로 전 행을 모아 제품×연도 처방금액을 롤업한다.
 * 화면은 5년 CAGR 구조로 만들되, 실제 표시 연도는 데이터에 존재하는 연도만큼(월→연 롤업).
 * 처방량(prescription_count)은 현재 미채움 → 있으면 표시, 없으면 금액 기준 분석.
 *
 * 약가·대조약·수수료율 보강은 exact-key 조인만 사용(퍼지 매칭 금지):
 *   - 약가·대조약: ubist insurance_code = products.insurance_code
 *   - 수수료율: 제품군 접두매칭(route.ts fetchCommissionRates 로직 이식) + 처방액 가중 평균
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketData, MarketProduct } from './types';

const norm = (s: string | null | undefined) =>
  String(s ?? '').replace(/[\s.\-/,·()]/g, '').toLowerCase();
const yearOf = (period: string) => period.slice(0, 4);
const isMonthly = (period: string) => /^\d{4}-\d{2}$/.test(period);

/**
 * 브랜드 stem — 제형·함량 접미어를 제거해 연간('유로리드 정 5mg')과
 * 월별('유로리드') 표기를 같은 키로 묶는다. + 정규화 제조사.
 */
function brandStem(name: string | null | undefined): string {
  return norm(String(name ?? '')
    .replace(/\d+\.?\d*\s*(mg|밀리그램|㎎|g|mcg|㎍|iu|단위|밀리리터|ml|㎖|%)/gi, '')
    .replace(/(서방정|장용정|연질캡슐|경질캡슐|정|캡슐|주사액|주사|주|점안액|시럽|건조시럽|과립|산)/g, ''));
}
const stemKey = (name: string | null | undefined, mfr: string | null | undefined) =>
  `${brandStem(name)}|${norm(mfr)}`;

/**
 * 성분키 검색 — distinct ingredient_name (경쟁 landscape 정의 단위).
 *  · 영문 성분명: 접두 검색(ingredient_name 은 항상 영문 성분으로 시작).
 *  · 한글 제품명: 부분일치(product_name). 사용자가 브랜드명(크레스토 등)으로도 찾을 수 있게.
 * 둘을 병렬 조회해 매칭된 ingredient_name 을 합친다. product_name 부분일치는
 * pg_trgm 인덱스(20260718)로 가속. SF 전용 ubist_market 을 소스로 한다.
 */
export async function listIngredients(svc: SupabaseClient, query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [byIng, byProd] = await Promise.all([
    svc.from('ubist_market').select('ingredient_name')
      .ilike('ingredient_name', `${q}%`).not('ingredient_name', 'is', null).limit(4000),
    svc.from('ubist_market').select('ingredient_name')
      .ilike('product_name', `%${q}%`).not('ingredient_name', 'is', null).limit(4000),
  ]);
  const set = new Set<string>();
  for (const r of [...(byIng.data ?? []), ...(byProd.data ?? [])]) {
    const v = String(r.ingredient_name ?? '').trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko')).slice(0, 100);
}

/** 수수료율 제품군 접두매칭(route.ts:75-138 이식, 읽기전용) → product_name→rate(0~1) */
async function commissionMap(
  svc: SupabaseClient,
  drugs: { product_name: string; company: string | null }[],
): Promise<Map<string, number>> {
  const { data: latestDoc } = await svc
    .from('documents').select('filename')
    .eq('category', '수수료율(딜러)').eq('status', 'ready')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  let q = svc.from('commission_rates').select('company_name, product_name, rate');
  if (latestDoc?.filename) q = q.eq('source_file', latestDoc.filename as string);
  const { data: rows } = await q;
  if (!rows?.length) return new Map();

  const rules = rows
    .filter(r => ((r.product_name as string | null) ?? '').trim())
    .map(r => ({
      key: norm(String(r.product_name).replace(/군\s*$/, '')),
      company: norm(String(r.company_name ?? '')),
      rate: Number(r.rate ?? 0),
    }))
    .filter(r => r.key.length >= 2)
    .sort((a, b) => b.key.length - a.key.length);

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
      if (r.company && cn && !(cn.includes(r.company) || r.company.includes(cn))) continue;
      rate = r.rate; break;
    }
    if (rate == null && cn) rate = companyOnly.get(cn) ?? null;
    if (rate != null) out.set(d.product_name, rate);
  }
  return out;
}

type RawRow = { product_name: string; manufacturer: string | null; seller: string | null; period: string; amount: number; code: string | null; price: number | null; isOriginal: boolean };
type Agg = {
  product_name: string;         // 표시명(가장 완전한 이름)
  manufacturer: string | null;
  seller: string | null;
  amountByYear: Record<string, number>;
  insuranceCodes: Set<string>;
  price: number | null;         // 파일 표기 약가(폴백)
  isOriginal: boolean;          // 대조약(Original) 여부 — UBIST Generic 컬럼 기준
};

/** 시장 landscape 구성 — SF 전용 ubist_market 기준 */
export async function buildMarket(svc: SupabaseClient, ingredientKey: string): Promise<MarketData> {
  // 1) 전 행 수집(페이지네이션)
  const raw: RawRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc
      .from('ubist_market')
      .select('product_name, manufacturer, seller, period, prescription_amount, insurance_code, price, is_original')
      .eq('ingredient_name', ingredientKey)
      .range(from, from + 999);
    if (error) throw new Error(`ubist_market 조회: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) {
      const pname = String(r.product_name ?? '').trim();
      if (!pname) continue;
      raw.push({
        product_name: pname,
        manufacturer: (r.manufacturer as string) ?? null,
        seller: (r.seller as string) ?? null,
        period: String(r.period ?? '').trim(),
        amount: Number(r.prescription_amount ?? 0),
        code: String(r.insurance_code ?? '').trim() || null,
        price: r.price != null ? Number(r.price) : null,
        isOriginal: r.is_original === true,
      });
    }
    if (data.length < 1000) break;
  }
  const hasQuantity = false; // ubist_market 은 처방량 미보유(금액만)

  // 1-a) 연간 행의 코드로 stem→코드 매핑 → 코드 없는 월별 행을 같은 제품에 병합
  const codeByStem = new Map<string, string>();
  for (const r of raw) if (r.code) { const k = stemKey(r.product_name, r.manufacturer); if (!codeByStem.has(k)) codeByStem.set(k, r.code); }
  const resolveCode = (r: RawRow) => r.code ?? codeByStem.get(stemKey(r.product_name, r.manufacturer)) ?? null;
  const groupKey = (r: RawRow) => { const c = resolveCode(r); return c ? `C:${c}` : `N:${norm(r.product_name)}|${norm(r.manufacturer)}`; };

  // 1-b) 연도별 월 커버리지 → 부분연도 연환산 계수
  const monthsByYear = new Map<string, Set<string>>();
  const hasAnnualByYear = new Map<string, boolean>();
  for (const r of raw) {
    if (!r.period) continue;
    const y = yearOf(r.period);
    if (isMonthly(r.period)) (monthsByYear.get(y) ?? monthsByYear.set(y, new Set()).get(y)!).add(r.period);
    else hasAnnualByYear.set(y, true);
  }
  const factorOf = (y: string): number => {
    if (hasAnnualByYear.get(y)) return 1;               // 연간 데이터 = full year
    const mc = monthsByYear.get(y)?.size ?? 0;
    return mc > 0 && mc < 12 ? 12 / mc : 1;             // 부분연도 → 연환산
  };
  const partialYears = new Set<string>();

  // 2) 그룹 집계
  const byProduct = new Map<string, Agg>();
  const yearSet = new Set<string>();
  for (const r of raw) {
    const key = groupKey(r);
    let a = byProduct.get(key);
    if (!a) { a = { product_name: r.product_name, manufacturer: r.manufacturer, seller: r.seller, amountByYear: {}, insuranceCodes: new Set(), price: null, isOriginal: false }; byProduct.set(key, a); }
    // 표시명은 더 완전한(긴) 이름 우선
    if (r.product_name.length > a.product_name.length) a.product_name = r.product_name;
    const yr = yearOf(r.period);
    if (yr) { a.amountByYear[yr] = (a.amountByYear[yr] ?? 0) + r.amount; yearSet.add(yr); }
    if (r.price != null && a.price == null) a.price = r.price;
    if (r.isOriginal) a.isOriginal = true;
    const c = resolveCode(r);
    if (c) a.insuranceCodes.add(c);
  }

  // 2-a) 부분연도 연환산 적용
  const years = [...yearSet].sort();
  for (const y of years) { const f = factorOf(y); if (f !== 1) partialYears.add(y); }
  for (const a of byProduct.values()) {
    for (const y of years) { const f = factorOf(y); if (f !== 1 && a.amountByYear[y]) a.amountByYear[y] = a.amountByYear[y] * f; }
  }

  const latestYear = years[years.length - 1];
  const fullYears = years.filter(y => !partialYears.has(y));   // 연환산 아닌 연도(CAGR용)

  // 2) 약가 보강 — 전체 약가표 drug_prices.item_code = insurance_code (exact).
  //    (products 마스터는 자사 품목만이라 시장 경쟁사가 없음 → drug_prices 사용)
  //    대조약은 아래에서 UBIST is_original 로 판정.
  const allCodes = [...new Set([...byProduct.values()].flatMap(a => [...a.insuranceCodes]))];
  const priceByCode = new Map<string, number>();
  for (let i = 0; i < allCodes.length; i += 300) {
    const { data } = await svc.from('drug_prices')
      .select('item_code, max_price')
      .in('item_code', allCodes.slice(i, i + 300));
    for (const r of data ?? []) {
      if (r.max_price != null) priceByCode.set(String(r.item_code), Number(r.max_price));
    }
  }

  // 3) 수수료율 맵 — 수수료는 판매사(seller)에게 지급되므로 회사는 seller 우선
  const rateMap = await commissionMap(
    svc,
    [...byProduct.values()].map(a => ({ product_name: a.product_name, company: a.seller ?? a.manufacturer })),
  );

  // 4) 제품 행 조립
  const marketTotalByYear: Record<string, number> = {};
  for (const y of years) marketTotalByYear[y] = 0;

  const products: MarketProduct[] = [...byProduct.values()].map(a => {
    // 약가: drug_prices 우선, 없으면 파일 표기 price 폴백
    let price: number | null = null;
    for (const c of a.insuranceCodes) { const p = priceByCode.get(c); if (p != null) { price = p; break; } }
    if (price == null) price = a.price;
    const isRef = a.isOriginal;   // 대조약 = UBIST Original
    const total = Object.values(a.amountByYear).reduce((s, v) => s + v, 0);
    for (const y of years) marketTotalByYear[y] += a.amountByYear[y] ?? 0;
    // CAGR: full year(연환산 아님)끼리만. 부분연도는 ×계수 증폭으로 노이즈가 커 제외.
    let cagr: number | null = null;
    if (fullYears.length >= 2) {
      const s0 = fullYears[0], s1 = fullYears[fullYears.length - 1];
      const sv = a.amountByYear[s0] ?? 0, ev = a.amountByYear[s1] ?? 0;
      const span = Number(s1) - Number(s0);
      if (sv > 0 && ev > 0 && span > 0) cagr = Math.pow(ev / sv, 1 / span) - 1;
    }
    return {
      product_name: a.product_name,
      manufacturer: a.manufacturer,
      insurance_code: [...a.insuranceCodes][0] ?? null,
      price,
      commission_rate: rateMap.get(a.product_name) ?? null,
      is_reference: isRef,
      amountByYear: a.amountByYear,
      total,
      share: null, // 아래에서 채움
      cagr,
    };
  });

  // 5) Share(최신년) + 대조약 합산 점유 + 처방액 가중 평균요율
  const latestTotal = marketTotalByYear[latestYear] || 0;
  let refShareSum = 0;
  let rateWeightedNum = 0, rateWeightedDen = 0;
  for (const p of products) {
    const latest = p.amountByYear[latestYear] ?? 0;
    p.share = latestTotal > 0 ? latest / latestTotal : null;
    if (p.is_reference) refShareSum += p.share ?? 0;
    if (p.commission_rate != null && latest > 0) { rateWeightedNum += p.commission_rate * latest; rateWeightedDen += latest; }
  }
  products.sort((a, b) => (b.amountByYear[latestYear] ?? 0) - (a.amountByYear[latestYear] ?? 0) || b.total - a.total);

  const notes: string[] = [];
  if (fullYears.length < 2) notes.push('완전한 연도가 2개 미만이라 CAGR을 계산하지 못했습니다. 과거 연간 UBIST를 추가하면 자동 확장됩니다.');
  if (partialYears.size) notes.push(`${[...partialYears].sort().join(', ')}년은 월 커버리지가 12개월 미만이라 연환산(run-rate) 표시입니다(* 표시). CAGR은 완전연도(${fullYears.join(', ') || '없음'})로만 계산.`);

  return {
    ingredientKey,
    years,
    partialYears: [...partialYears].sort(),
    products,
    marketTotalByYear,
    referenceShare: refShareSum > 0 ? refShareSum : null,
    avgCommission: rateWeightedDen > 0 ? rateWeightedNum / rateWeightedDen : null,
    hasQuantity,
    note: notes.length ? notes.join(' ') : undefined,
  };
}
