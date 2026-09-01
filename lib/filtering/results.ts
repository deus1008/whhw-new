import type { SupabaseClient } from '@supabase/supabase-js';

// 병원명 정규화(공백·괄호 제거) — EDI 파일명과 마스터명 표기차 흡수
const normHos = (s: string) => s.replace(/[\s()（）·.]/g, '');

/**
 * (처방처명 + 품목 보험코드)로 EDI(trend_prescriptions)에서 처방액>0 최초 월을 찾아
 * 'YYYY-MM-01' 로 반환. 없으면 null.
 */
export async function detectPrescriptionStart(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: SupabaseClient<any, any, any>,
  hospitalName: string | null,
  insCode: string | null,
): Promise<string | null> {
  if (!hospitalName || !insCode) return null;

  // 1) 정확 매칭(인덱스 활용)
  const { data } = await svc
    .from('trend_prescriptions')
    .select('prescription_month')
    .eq('insurance_code', insCode)
    .eq('hospital_name', hospitalName)
    .gt('prescription_amount', 0)
    .order('prescription_month', { ascending: true })
    .limit(1);
  let ym: string | undefined = data?.[0]?.prescription_month ?? undefined;

  // 2) 정규화 폴백(표기차) — 해당 보험코드 실적을 모아 병원명 정규화 일치
  if (!ym) {
    const { data: all } = await svc
      .from('trend_prescriptions')
      .select('hospital_name, prescription_month')
      .eq('insurance_code', insCode)
      .gt('prescription_amount', 0)
      .order('prescription_month', { ascending: true })
      .limit(8000);
    const target = normHos(hospitalName);
    const hit = (all ?? []).find(r => normHos(String(r.hospital_name ?? '')) === target);
    ym = hit?.prescription_month ?? undefined;
  }

  if (!ym || !/^\d{6}$/.test(ym)) return null;
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
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
    const fr = String(it.final_result ?? '').trim();
    if (/^\d{4}[-.]\d{1,2}/.test(fr)) continue; // 이미 처방시작월 있음 → 건너뜀
    const det = await detectPrescriptionStart(svc, it.hospital_name, it.item_insurance_code);
    if (!det) continue;
    const { error } = await svc
      .from('hospital_filtering')
      .update({ final_result: det, result_auto: true, updated_at: now })
      .eq('id', it.id);
    if (!error) updated++;
  }
  return updated;
}
