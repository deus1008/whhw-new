'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';
import { detectPrescriptionStart, runResultRefresh } from '@/lib/filtering/results';

/** 서비스 롤 — 관리자 수정·삭제 시 RLS 우회(권한은 getAuthorized로 검증). */
function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type FilteringInput = {
  received_date: string;   // YYYY-MM-DD (빈값 허용)
  ym:            string;
  manager:       string;
  company_name:  string;
  dealer_name:   string;
  dealer_phone:  string;
  hospital_code: string;
  hospital_type: string;
  hospital_name: string;
  product_name:  string;
  department:    string;
  kol:           string;
  dc_timing:     string;
  coding_month:  string;
  edi_received:  string;
  mbo:           string;   // 입력은 문자열, 저장 시 숫자 변환
  answer:        string;
  final_result:  string;
  memo:          string;
  item_insurance_code: string;  // 품목 보험코드(9) — EDI 매칭
  notify_target:       string;  // 통보대상(자유입력)
  notify_reason:       string;  // 사유
};

async function getAuthorized() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: '인증이 필요합니다.' };
  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_id, full_name, email').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return { error: '승인된 계정이 아닙니다.' };
  const isAdmin = normalizeRole(profile.role) === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);
  const myName = (profile.full_name || profile.email || '') as string;
  // 회사 기준 역할: 회사 미지정 = 얼라이언스(지역장/입력측), 회사 지정 = 위탁사(답변측)
  const isConsignor = !!profileCompanyId;   // 위탁사(아주약품 등) — 답변 주체
  const isAlliance  = !profileCompanyId;    // 얼라이언스(지역장) — 입력 주체
  return { supabase, user, isAdmin, companyId, profileCompanyId, myName, isConsignor, isAlliance };
}

function toNum(s: string): number | null {
  const n = Number(String(s).replace(/[,\s원]/g, ''));
  return Number.isFinite(n) && String(s).trim() !== '' ? Math.round(n) : null;
}

function clean(input: FilteringInput) {
  const t = (v: string) => (v ?? '').trim() || null;
  return {
    received_date: input.received_date || null,
    ym:            t(input.ym) ?? (input.received_date ? input.received_date.slice(0, 7) : null),
    manager:       t(input.manager),
    company_name:  t(input.company_name),
    dealer_name:   t(input.dealer_name),
    dealer_phone:  t(input.dealer_phone),
    hospital_code: t(input.hospital_code),
    hospital_type: t(input.hospital_type),
    hospital_name: t(input.hospital_name),
    product_name:  t(input.product_name),
    department:    t(input.department),
    kol:           t(input.kol),
    dc_timing:     t(input.dc_timing),
    coding_month:  t(input.coding_month),
    edi_received:  t(input.edi_received),
    mbo:           toNum(input.mbo),
    answer:        t(input.answer),
    final_result:  t(input.final_result),
    memo:          t(input.memo),
    item_insurance_code: (input.item_insurance_code ?? '').replace(/\D/g, '') || null,
    notify_target: t(input.notify_target),
    notify_reason: t(input.notify_reason),
  };
}

export async function createFiltering(input: FilteringInput): Promise<{ error?: string }> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.hospital_name.trim()) return { error: '처방처명을 입력하세요.' };
  if (!input.product_name.trim())  return { error: '품목명을 입력하세요.' };

  const c = clean(input);
  // 답변이 이미 있으면 확인완료, 없으면 대기(위탁사 답변 대기)
  const status = c.answer ? 'confirmed' : 'pending';

  // 실적 자동 감지 — 병원명·보험코드 있으면 최초/최근 처방월·금액 표기
  let result_auto = false;
  let first_rx_amount: number | null = null;
  let last_rx_month: string | null = null;
  let last_rx_amount: number | null = null;
  if (c.hospital_name && c.item_insurance_code) {
    const det = await detectPrescriptionStart(serviceClient(), c.hospital_name, c.item_insurance_code);
    if (det) {
      last_rx_month = det.lastMonth; last_rx_amount = det.lastAmount;
      if (!c.final_result) { c.final_result = det.month; first_rx_amount = det.amount; result_auto = true; }
    }
  }

  const { error } = await auth.supabase
    .from('hospital_filtering')
    .insert({ ...c, status, result_auto, first_rx_amount, last_rx_month, last_rx_amount, user_id: auth.user!.id, company_id: auth.companyId ?? null });

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/filtering');
  return {};
}

export async function updateFiltering(id: string, input: FilteringInput): Promise<{ error?: string }> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  // 현재 행 조회 (권한·상태 전이 판단)
  const svc = serviceClient();
  const { data: row } = await svc
    .from('hospital_filtering')
    .select('user_id, company_id, manager, answer, status')
    .eq('id', id).single();
  if (!row) return { error: '대상을 찾을 수 없습니다.' };
  const prevAnswer = (row.answer as string | null) ?? null;

  const isOwner    = row.user_id === auth.user!.id;
  const isManager  = auth.isAlliance && !!auth.myName && row.manager === auth.myName;
  // 위탁사(회사 지정 사용자)는 답변을 위해 수정 가능
  const canEdit = auth.isAdmin || isOwner || isManager || auth.isConsignor;
  if (!canEdit) return { error: '수정 권한이 없습니다.' };

  const c = clean(input);
  const now = new Date().toISOString();
  const answeredBefore = !!(row.answer && String(row.answer).trim());
  const answeredNow = !!c.answer;

  // 상태 전이
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { ...c, updated_at: now };
  if (!answeredNow) {
    // 답변 비움 → 대기
    patch.status = 'pending';
    patch.answered_at = null; patch.answered_by = null; patch.reviewed_at = null;
  } else if (auth.isConsignor && !isOwner) {
    // 위탁사가 답변 입력/변경 → 답변완료(지역장 확인 대기)
    patch.status = 'answered';
    patch.answered_at = answeredBefore && row.status === 'answered' ? undefined : now;
    patch.answered_by = auth.user!.id;
    patch.reviewed_at = null;
    if (patch.answered_at === undefined) delete patch.answered_at;
  } else {
    // 지역장/관리자가 답변 확정 → 확인완료
    patch.status = 'confirmed';
    if (!answeredBefore) patch.answered_at = now;
    patch.reviewed_at = now;
  }

  // 실적 자동 감지 — 최근월실적은 갱신, 최초처방월은 비어있을 때만 자동 표기
  if (c.hospital_name && c.item_insurance_code) {
    const det = await detectPrescriptionStart(svc, c.hospital_name, c.item_insurance_code);
    if (det) {
      patch.last_rx_month = det.lastMonth; patch.last_rx_amount = det.lastAmount;
      if (!c.final_result) { patch.final_result = det.month; patch.first_rx_amount = det.amount; patch.result_auto = true; }
    }
  }

  const { error } = await svc.from('hospital_filtering').update(patch).eq('id', id);
  if (error) return { error: `수정 실패: ${error.message}` };

  // 통보/상태 변경 이력(증빙) — 답변이 바뀌면 기록
  const nextAnswer = c.answer ?? null;
  if (prevAnswer !== nextAnswer) {
    await svc.from('filtering_log').insert({
      filtering_id: id, hospital_name: c.hospital_name, product_name: c.product_name,
      action: '답변변경', from_answer: prevAnswer, to_answer: nextAnswer,
      reason: c.notify_reason, notify_target: c.notify_target,
      changed_by: auth.user!.id, changed_by_name: auth.myName,
    });
  }

  revalidatePath('/filtering');
  return {};
}

/** EDI 실적 기반 최종결과 자동 갱신(버튼/수동 실행). 갱신 건수 반환. */
export async function refreshFilteringResults(): Promise<{ updated: number; error?: string }> {
  const auth = await getAuthorized();
  if (auth.error) return { updated: 0, error: auth.error };
  const updated = await runResultRefresh(serviceClient());
  revalidatePath('/filtering');
  return { updated };
}

/** 특정 항목의 통보/변경 이력 조회. */
export async function getFilteringLogs(id: string): Promise<{
  created_at: string; action: string | null; from_answer: string | null; to_answer: string | null;
  reason: string | null; notify_target: string | null; changed_by_name: string | null;
}[]> {
  const auth = await getAuthorized();
  if (auth.error) return [];
  const svc = serviceClient();
  const { data } = await svc
    .from('filtering_log')
    .select('created_at, action, from_answer, to_answer, reason, notify_target, changed_by_name')
    .eq('filtering_id', id).order('created_at', { ascending: false }).limit(50);
  return data ?? [];
}

/** 지역장(담당자)이 답변완료 항목을 열람 → 확인완료로 전환(배지 감소). */
export async function confirmFiltering(id: string): Promise<{ error?: string; status?: string }> {
  const auth = await getAuthorized();
  if (auth.error) return { error: auth.error };
  const svc = serviceClient();
  const { data: row } = await svc
    .from('hospital_filtering').select('manager, status').eq('id', id).single();
  if (!row) return { error: '대상을 찾을 수 없습니다.' };
  if (row.status !== 'answered') return { status: row.status };
  const isManager = auth.isAlliance && !!auth.myName && row.manager === auth.myName;
  if (!isManager && !auth.isAdmin) return { status: row.status };  // 권한 없으면 조용히 무시

  const { error } = await svc
    .from('hospital_filtering')
    .update({ status: 'confirmed', reviewed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'answered');
  if (error) return { error: error.message };
  revalidatePath('/filtering');
  return { status: 'confirmed' };
}

/** 좌측/홈 아이콘 배지 카운트 — 위탁사: 대기(미답변) 건수, 지역장: 본인 담당 답변완료 건수. */
export async function getFilteringBadge(): Promise<number> {
  const auth = await getAuthorized();
  if (auth.error) return 0;
  const svc = serviceClient();
  if (auth.isConsignor) {
    // 위탁사: 자사(company_id) 대기 건수
    let q = svc.from('hospital_filtering').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (auth.profileCompanyId) q = q.eq('company_id', auth.profileCompanyId);
    const { count } = await q;
    return count ?? 0;
  }
  // 지역장(얼라이언스): 본인이 담당자인 답변완료 건수
  if (!auth.myName) return 0;
  const { count } = await svc
    .from('hospital_filtering').select('id', { count: 'exact', head: true })
    .eq('status', 'answered').eq('manager', auth.myName);
  return count ?? 0;
}

export async function deleteFiltering(id: string): Promise<{ error?: string }> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  const db = auth.isAdmin ? serviceClient() : auth.supabase;
  if (!auth.isAdmin) {
    const { data: row } = await auth.supabase
      .from('hospital_filtering').select('user_id').eq('id', id).single();
    if (!row || row.user_id !== auth.user!.id) return { error: '삭제 권한이 없습니다.' };
  }

  const { error } = await db.from('hospital_filtering').delete().eq('id', id);
  if (error) return { error: `삭제 실패: ${error.message}` };
  revalidatePath('/filtering');
  return {};
}
