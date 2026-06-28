'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import type { MarketingSchedule } from './page';

function svc() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type ScheduleInput = {
  title:      string;
  start_date: string;
  end_date:   string;
  category:   string;
  location:   string;
  assignee:   string;
  memo:       string;
};

export type ScheduleCategory = {
  id:         string;
  name:       string;
  color:      string;
  sort_order: number;
};

type Result<T = void> = { data?: T; error?: string };

async function getAuthorized() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: '인증이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved')
    return { error: '승인된 계정이 아닙니다.' };

  const role = normalizeRole(profile.role);
  const isAdminRole = isAdmin(role);
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdminRole);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdminRole || isAllianceUser);

  return { supabase, user, role, companyId };
}

function isAdmin(role: string) {
  return role === '관리자' || role === '마케팅총괄' || role === '사업총괄' || role === '영업관리총괄';
}

function clean(input: ScheduleInput) {
  return {
    title:      input.title.trim(),
    start_date: input.start_date,
    end_date:   input.end_date   || null,
    category:   input.category.trim()  || null,
    location:   input.location.trim()  || null,
    assignee:   input.assignee.trim()  || null,
    memo:       input.memo.trim()      || null,
  };
}

/* ── 일정 생성 ─────────────────────────────────────────────── */
export async function createSchedule(
  input: ScheduleInput,
): Promise<Result<MarketingSchedule>> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.title)      return { error: '제목을 입력하세요.' };
  if (!input.start_date) return { error: '날짜를 입력하세요.' };

  const { data, error } = await auth.supabase
    .from('marketing_schedules')
    .insert({ ...clean(input), user_id: auth.user!.id, company_id: auth.companyId ?? null })
    .select()
    .single();

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/calendar');
  return { data: data as MarketingSchedule };
}

/* ── 일정 수정 ─────────────────────────────────────────────── */
export async function updateSchedule(
  id: string,
  input: ScheduleInput,
): Promise<Result<MarketingSchedule>> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.title)      return { error: '제목을 입력하세요.' };
  if (!input.start_date) return { error: '날짜를 입력하세요.' };

  if (!isAdmin(auth.role!)) {
    const { data: existing } = await auth.supabase
      .from('marketing_schedules').select('user_id').eq('id', id).single();
    if (!existing || existing.user_id !== auth.user!.id)
      return { error: '수정 권한이 없습니다.' };
  }

  const { data, error } = await auth.supabase
    .from('marketing_schedules')
    .update(clean(input))
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: `수정 실패: ${error.message}` };
  revalidatePath('/calendar');
  return { data: data as MarketingSchedule };
}

/* ── 일정 삭제 ─────────────────────────────────────────────── */
export async function deleteSchedule(id: string): Promise<Result> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  if (!isAdmin(auth.role!)) {
    const { data: existing } = await auth.supabase
      .from('marketing_schedules').select('user_id').eq('id', id).single();
    if (!existing || existing.user_id !== auth.user!.id)
      return { error: '삭제 권한이 없습니다.' };
  }

  const { error } = await auth.supabase
    .from('marketing_schedules')
    .delete()
    .eq('id', id);

  if (error) return { error: `삭제 실패: ${error.message}` };
  revalidatePath('/calendar');
  return {};
}

/* ── 카테고리 추가 ─────────────────────────────────────────── */
export async function createCategory(
  input: { name: string; color: string; sort_order: number },
): Promise<Result<ScheduleCategory>> {
  const auth = await getAuthorized();
  if (auth.error) return { error: auth.error };
  if (!isAdmin(auth.role!)) return { error: '관리자만 카테고리를 추가할 수 있습니다.' };
  if (!input.name.trim()) return { error: '카테고리 이름을 입력하세요.' };

  const { data, error } = await svc()
    .from('schedule_categories')
    .insert({ name: input.name.trim(), color: input.color, sort_order: input.sort_order })
    .select()
    .single();

  if (error) return { error: `추가 실패: ${error.message}` };
  revalidatePath('/calendar');
  return { data: data as ScheduleCategory };
}

/* ── 카테고리 수정 ─────────────────────────────────────────── */
export async function updateCategory(
  id: string,
  input: { name: string; color: string },
): Promise<Result<ScheduleCategory>> {
  const auth = await getAuthorized();
  if (auth.error) return { error: auth.error };
  if (!isAdmin(auth.role!)) return { error: '관리자만 카테고리를 수정할 수 있습니다.' };
  if (!input.name.trim()) return { error: '카테고리 이름을 입력하세요.' };

  const { data, error } = await svc()
    .from('schedule_categories')
    .update({ name: input.name.trim(), color: input.color })
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: `수정 실패: ${error.message}` };
  revalidatePath('/calendar');
  return { data: data as ScheduleCategory };
}

/* ── 카테고리 삭제 ─────────────────────────────────────────── */
export async function deleteCategory(id: string): Promise<Result> {
  const auth = await getAuthorized();
  if (auth.error) return { error: auth.error };
  if (!isAdmin(auth.role!)) return { error: '관리자만 카테고리를 삭제할 수 있습니다.' };

  const { error } = await svc()
    .from('schedule_categories')
    .delete()
    .eq('id', id);

  if (error) return { error: `삭제 실패: ${error.message}` };
  revalidatePath('/calendar');
  return {};
}

/* ── 카테고리 순서 변경 (두 항목 swap) ─────────────────────── */
export async function swapCategoryOrder(
  idA: string, orderA: number,
  idB: string, orderB: number,
): Promise<Result> {
  const auth = await getAuthorized();
  if (auth.error) return { error: auth.error };
  if (!isAdmin(auth.role!)) return { error: '권한 없음' };

  const db = svc();
  const [r1, r2] = await Promise.all([
    db.from('schedule_categories').update({ sort_order: orderB }).eq('id', idA),
    db.from('schedule_categories').update({ sort_order: orderA }).eq('id', idB),
  ]);
  if (r1.error || r2.error) return { error: '순서 변경 실패' };
  revalidatePath('/calendar');
  return {};
}
