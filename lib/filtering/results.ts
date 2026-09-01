import type { SupabaseClient } from '@supabase/supabase-js';

// 병원명 정규화(공백·괄호 제거) — EDI 파일명과 마스터명 표기차 흡수
const normHos = (s: string) => s.replace(/[\s()（）·.]/g, '');

export type RxStart = {
  month: string;  amount: number;       // 최초 처방월·금액
  lastMonth: string; lastAmount: number; // 최근 처방월·금액
};

const toMonth = (ym: string) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;

// 품목명 → 브랜드 핵심어(군·제형·함량 제거). 예: '아나탄군'→'아나탄', '다파릴듀오서방정'→'다파릴'
export function brandKey(name: string | null): string {
  let s = String(name ?? '').replace(/\([^)]*\)/g, ' ');
  s = s.split(/[\d]/)[0];  // 첫 숫자 이전
  // 제형/수식 접미 제거(반복)
  const suffix = /(군|정제|정|캡슐|주사액|주사|주|시럽|점안액|점이액|흡입액|연고|크림|패치|겔|장용정|필름정|서방정|서방|과립|산제|산|현탁액|액|듀오|플러스|에스알|에스|엑스알|이알)$/;
  let prev = '';
  while (s && s !== prev) { prev = s; s = s.replace(suffix, ''); }
  return s.replace(/\s/g, '').trim();
}

// 품목명(브랜드) → products 마스터의 보험코드 목록
async function brandCodes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>, productName: string | null,
): Promise<string[]> {
  const brand = brandKey(productName);
  if (brand.length < 2) return [];
  const { data } = await svc
    .from('products')
    .select('insurance_code')
    .ilike('product_name', `${brand}%`)
    .not('insurance_code', 'is', null)
    .limit(80);
  return [...new Set((data ?? []).map(r => String(r.insurance_code)).filter(Boolean))];
}

// (처방처명 + 보험코드) EDI 월별 처방액 합계 Map
async function monthlySums(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>, hospitalName: string, insCode: string,
): Promise<Map<string, number>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = (await svc
    .from('trend_prescriptions')
    .select('prescription_month, prescription_amount')
    .eq('insurance_code', insCode).eq('hospital_name', hospitalName)
    .gt('prescription_amount', 0).limit(3000)).data ?? [];
  if (!rows.length) {
    const { data: all } = await svc
      .from('trend_prescriptions')
      .select('hospital_name, prescription_month, prescription_amount')
      .eq('insurance_code', insCode).gt('prescription_amount', 0).limit(8000);
    const target = normHos(hospitalName);
    rows = (all ?? []).filter(r => normHos(String(r.hospital_name ?? '')) === target);
  }
  const m = new Map<string, number>();
  for (const r of rows) {
    const mm = String(r.prescription_month ?? '');
    if (!/^\d{6}$/.test(mm)) continue;
    m.set(mm, (m.get(mm) ?? 0) + (Number(r.prescription_amount) || 0));
  }
  return m;
}

/**
 * (처방처명 + 품목) → EDI 최초/최근 처방월·금액.
 *  - 품목 보험코드(insCode)가 있으면 정확 매칭.
 *  - 없으면 품목명(브랜드) → products 보험코드들로 매칭(합산).
 */
export async function detectPrescriptionStart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>,
  hospitalName: string | null,
  insCode: string | null,
  productName?: string | null,
): Promise<RxStart | null> {
  if (!hospitalName) return null;
  const codes = insCode ? [insCode] : await brandCodes(svc, productName ?? null);
  if (!codes.length) return null;

  const total = new Map<string, number>();
  for (const code of codes) {
    const m = await monthlySums(svc, hospitalName, code);
    for (const [mm, amt] of m) total.set(mm, (total.get(mm) ?? 0) + amt);
  }
  const months = [...total.keys()].sort();
  if (!months.length) return null;
  const first = months[0], last = months[months.length - 1];
  return {
    month: toMonth(first), amount: Math.round(total.get(first) ?? 0),
    lastMonth: toMonth(last), lastAmount: Math.round(total.get(last) ?? 0),
  };
}

/**
 * 최종결과가 아직 처방시작월(날짜)이 아닌 필터링 항목을 스캔해
 * EDI 실적에서 최초 처방월을 찾으면 final_result 자동 표기. 갱신 건수 반환.
 */
export async function runResultRefresh(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>,
): Promise<number> {
  const { data: items } = await svc
    .from('hospital_filtering')
    .select('id, hospital_name, item_insurance_code, product_name, final_result')
    .not('hospital_name', 'is', null)
    .limit(10000);
  if (!items?.length) return 0;

  // 품목명(브랜드) → 코드 캐시
  const codeCache = new Map<string, string[]>();
  async function codesFor(it: { item_insurance_code: string | null; product_name: string | null }): Promise<string[]> {
    if (it.item_insurance_code) return [String(it.item_insurance_code)];
    const pn = it.product_name ?? '';
    if (codeCache.has(pn)) return codeCache.get(pn)!;
    const codes = await brandCodes(svc, pn);
    codeCache.set(pn, codes);
    return codes;
  }

  // 병원별 EDI 실적(코드→월→금액) 캐시 — 병원명 정확 매칭(인덱스)
  const hospCache = new Map<string, Map<string, Map<string, number>>>();
  async function loadHosp(h: string): Promise<Map<string, Map<string, number>>> {
    if (hospCache.has(h)) return hospCache.get(h)!;
    const { data } = await svc
      .from('trend_prescriptions')
      .select('insurance_code, prescription_month, prescription_amount')
      .eq('hospital_name', h).gt('prescription_amount', 0).limit(20000);
    const byCode = new Map<string, Map<string, number>>();
    for (const r of data ?? []) {
      const code = String(r.insurance_code ?? ''); const mm = String(r.prescription_month ?? '');
      if (!code || !/^\d{6}$/.test(mm)) continue;
      if (!byCode.has(code)) byCode.set(code, new Map());
      const mmap = byCode.get(code)!;
      mmap.set(mm, (mmap.get(mm) ?? 0) + (Number(r.prescription_amount) || 0));
    }
    hospCache.set(h, byCode);
    return byCode;
  }

  let updated = 0;
  const now = new Date().toISOString();
  for (const it of items) {
    const codes = await codesFor(it);
    if (!codes.length) continue;
    const byCode = await loadHosp(String(it.hospital_name));
    const total = new Map<string, number>();
    for (const code of codes) {
      const mm = byCode.get(code);
      if (!mm) continue;
      for (const [m, a] of mm) total.set(m, (total.get(m) ?? 0) + a);
    }
    const months = [...total.keys()].sort();
    if (!months.length) continue;
    const first = months[0], last = months[months.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = { last_rx_month: toMonth(last), last_rx_amount: Math.round(total.get(last) ?? 0), updated_at: now };
    const fr = String(it.final_result ?? '').trim();
    if (!/^\d{4}[-.]\d{1,2}/.test(fr)) {
      patch.final_result = toMonth(first); patch.first_rx_amount = Math.round(total.get(first) ?? 0); patch.result_auto = true;
    }
    const { error } = await svc.from('hospital_filtering').update(patch).eq('id', it.id);
    if (!error) updated++;
  }
  return updated;
}
