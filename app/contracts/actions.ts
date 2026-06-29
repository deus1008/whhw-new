'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

export type ContractInput = {
  manager:         string;
  company_name:    string;
  contract_start:  string;
  contract_end:    string;
  auto_renewal:    boolean;
  evidence:        string;
  details:         string;
  expected_month:  string;
  expected_amount: string;
  hospitals:       string;
  contact_name:    string;
  contact_phone:   string;
  contact_email:   string;
  memo:            string;
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

function clean(input: ContractInput) {
  return {
    manager:         input.manager.trim(),
    company_name:    input.company_name.trim(),
    contract_start:  input.contract_start,
    contract_end:    input.contract_end  || null,
    auto_renewal:    input.auto_renewal,
    evidence:        input.evidence.trim()        || null,
    details:         input.details.trim()         || null,
    expected_month:  input.expected_month.trim()  || null,
    expected_amount: input.expected_amount.trim() || null,
    hospitals:       input.hospitals.trim()       || null,
    contact_name:    input.contact_name.trim()    || null,
    contact_phone:   input.contact_phone.trim()   || null,
    contact_email:   input.contact_email.trim()   || null,
    memo:            input.memo.trim()             || null,
  };
}

export async function createContract(input: ContractInput): Promise<{ error?: string }> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.manager.trim())     return { error: '담당자를 입력하세요.' };
  if (!input.company_name.trim()) return { error: '업체명을 입력하세요.' };
  if (!input.contract_start)     return { error: '계약 시작일을 입력하세요.' };

  const { error } = await auth.supabase
    .from('new_contracts')
    .insert({ ...clean(input), user_id: auth.user!.id, company_id: auth.companyId ?? null });

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/contracts');
  return {};
}

export async function updateContract(id: string, input: ContractInput): Promise<{ error?: string }> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  if (!auth.isAdmin) {
    const { data: row } = await auth.supabase
      .from('new_contracts').select('user_id').eq('id', id).single();
    if (!row || row.user_id !== auth.user!.id) return { error: '수정 권한이 없습니다.' };
  }

  const { error } = await auth.supabase
    .from('new_contracts')
    .update({ ...clean(input), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: `수정 실패: ${error.message}` };
  revalidatePath('/contracts');
  return {};
}

export async function deleteContract(id: string): Promise<{ error?: string }> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  if (!auth.isAdmin) {
    const { data: row } = await auth.supabase
      .from('new_contracts').select('user_id').eq('id', id).single();
    if (!row || row.user_id !== auth.user!.id) return { error: '삭제 권한이 없습니다.' };
  }

  const { error } = await auth.supabase
    .from('new_contracts').delete().eq('id', id);

  if (error) return { error: `삭제 실패: ${error.message}` };
  revalidatePath('/contracts');
  return {};
}
