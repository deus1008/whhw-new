import type { SupabaseClient } from '@supabase/supabase-js';

// 병원명 정규화(공백·괄호 제거) — EDI 파일명과 마스터명 표기차 흡수
const normHos = (s: string) => s.replace(/[\s()（）·.]/g, '');

export type RxStart = {
  month: string;  amount: number;       // 최초 처방월·금액
  lastMonth: string; lastAmount: number; // 최근 처방월·금액
};

const toMonth = (ym: string) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;

/**
 * (처방처명 + 품목 보험코드)로 EDI(trend_prescriptions)에서 처방액>0 월별 실적을 모아
 * 최초 월·금액과 최근 월·금액을 반환. 같은 월 여러 행은 합산. 없으면 null.
 */
export async function detectPrescriptionStart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>,
  hospitalName: string | null,
  insCode: string | null,
): Promise<RxStart | null> {
  if (!hospitalName || !insCode) return null;

  // 1) 정확 매칭(인덱스 활용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[] = (await svc
    .from('trend_prescriptions')
    .select('prescription_month, prescription_amount')
    .eq('insurance_code', insCode)
    .eq('hospital_name', hospitalName)
    .gt('prescription_amount', 0)
    .limit(2000)).data ?? [];

  // 2) 정규화 폴백(표기차) — 해당 보험코드 실적을 모아 병원명 정규화 일치
  if (!rows.length) {
    const { data: all } = await svc
      .from('trend_prescriptions')
      .select('hospital_name, prescription_month, prescription_amount')
      .eq('insurance_code', insCode)
      .gt('prescription_amount', 0)
      .limit(8000);
    const target = normHos(hospitalName);
    rows = (all ?? []).filter(r => normHos(String(r.hospital_name ?? '')) === target);
  }

  // 월별 합산
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const m = String(r.prescription_month ?? '');
    if (!/^\d{6}$/.test(m)) continue;
    byMonth.set(m, (byMonth.get(m) ?? 0) + (Number(r.prescription_amount) || 0));
  }
  const months = [...byMonth.keys()].sort();
  if (!months.length) return null;
  const first = months[0], last = months[months.length - 1];
  return {
    month: toMonth(first), amount: Math.round(byMonth.get(first) ?? 0),
    lastMonth: toMonth(last), lastAmount: Math.round(byMonth.get(last) ?? 0),
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
    .select('id, hospital_name, item_insurance_code, final_result')
    .not('item_insurance_code', 'is', null)
    .not('hospital_name', 'is', null)
    .limit(10000);

  let updated = 0;
  const now = new Date().toISOString();
  for (const it of items ?? []) {
    const det = await detectPrescriptionStart(svc, it.hospital_name, it.item_insurance_code);
    if (!det) continue;
    // 최근월실적은 매번 갱신. 최초처방월은 아직 날짜가 아닐 때만 자동 채움(수동 입력값 보존).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = { last_rx_month: det.lastMonth, last_rx_amount: det.lastAmount, updated_at: now };
    const fr = String(it.final_result ?? '').trim();
    if (!/^\d{4}[-.]\d{1,2}/.test(fr)) {
      patch.final_result = det.month; patch.first_rx_amount = det.amount; patch.result_auto = true;
    }
    const { error } = await svc.from('hospital_filtering').update(patch).eq('id', it.id);
    if (!error) updated++;
  }
  return updated;
}
