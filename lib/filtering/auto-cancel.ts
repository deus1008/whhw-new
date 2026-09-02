import type { SupabaseClient } from '@supabase/supabase-js';

/** 최초처방월이 실제 처방월(날짜)인지 — 처방 결과 유무 판정. */
function isPrescribed(final: string | null): boolean {
  return !!final && /^\d{4}[-./]\d{1,2}/.test(final.trim());
}

/**
 * 장기 미진행 건 자동 취소.
 * 규칙: 접수일자로부터 6개월이 경과할 때까지 최초처방월(처방 결과)이 없으면
 *       답변을 '취소'로 변경하고, 이력(filtering_log)에 사유 '6개월 이상 경과'를 남긴다.
 * - 이미 '취소'인 건은 제외(재처리·중복로그 방지).
 * - 처방 결과가 있는 건(최초처방월이 날짜)은 제외.
 * 반환: 이번에 취소 처리된 건수.
 */
export async function runAutoCancel(
  svc: SupabaseClient,
  asOf: Date = new Date(),
): Promise<{ cancelled: number; scanned: number }> {
  const cutoff = new Date(asOf);
  cutoff.setMonth(cutoff.getMonth() - 6);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  // 접수일 6개월 경과 & 아직 취소가 아닌 후보
  const { data, error } = await svc
    .from('hospital_filtering')
    .select('id, hospital_name, product_name, answer, final_result, received_date')
    .not('received_date', 'is', null)
    .lte('received_date', cutoffStr)
    .or('answer.is.null,answer.neq.취소');
  if (error) throw error;

  const scanned = (data ?? []).length;
  // 처방 결과가 없는(최초처방월이 날짜가 아닌) 건만 취소
  const targets = (data ?? []).filter(r => !isPrescribed(r.final_result as string | null));
  if (targets.length === 0) return { cancelled: 0, scanned };

  const now = new Date().toISOString();
  const ids = targets.map(t => t.id as string);

  // 상태 일괄 변경(청크)
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { error: uErr } = await svc
      .from('hospital_filtering')
      .update({ answer: '취소', status: 'confirmed', updated_at: now })
      .in('id', slice);
    if (uErr) throw uErr;
  }

  // 이력 일괄 기록(청크)
  const logs = targets.map(t => ({
    filtering_id: t.id,
    hospital_name: t.hospital_name,
    product_name: t.product_name,
    action: '자동취소',
    from_answer: (t.answer as string | null) ?? null,
    to_answer: '취소',
    reason: '6개월 이상 경과',
    changed_by_name: '시스템(자동)',
  }));
  for (let i = 0; i < logs.length; i += 500) {
    const slice = logs.slice(i, i + 500);
    const { error: lErr } = await svc.from('filtering_log').insert(slice);
    if (lErr) throw lErr;
  }

  return { cancelled: targets.length, scanned };
}
