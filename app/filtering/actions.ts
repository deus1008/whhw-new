'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

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
};

async function getAuthorized() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: '인증이 필요합니다.' };
  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return { error: '승인된 계정이 아닙니다.' };
  const isAdmin = normalizeRole(profile.role) === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);
  return { supabase, user, isAdmin, companyId };
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
  };
}

export async function createFiltering(input: FilteringInput): Promise<{ error?: string }> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.hospital_name.trim()) return { error: '처방처명을 입력하세요.' };
  if (!input.product_name.trim())  return { error: '품목명을 입력하세요.' };

  const { error } = await auth.supabase
    .from('hospital_filtering')
    .insert({ ...clean(input), user_id: auth.user!.id, company_id: auth.companyId ?? null });

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/filtering');
  return {};
}

export async function updateFiltering(id: string, input: FilteringInput): Promise<{ error?: string }> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  const db = auth.isAdmin ? serviceClient() : auth.supabase;
  if (!auth.isAdmin) {
    const { data: row } = await auth.supabase
      .from('hospital_filtering').select('user_id').eq('id', id).single();
    if (!row || row.user_id !== auth.user!.id) return { error: '수정 권한이 없습니다.' };
  }

  const { error } = await db
    .from('hospital_filtering')
    .update({ ...clean(input), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: `수정 실패: ${error.message}` };
  revalidatePath('/filtering');
  return {};
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
