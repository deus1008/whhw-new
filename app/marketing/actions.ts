'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { MarketingSchedule } from './page';

export type ScheduleInput = {
  title:      string;
  start_date: string;
  end_date:   string;
  category:   string;
  location:   string;
  assignee:   string;
  memo:       string;
};

type Result<T = void> = { data?: T; error?: string };

async function getAuthorized() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: '인증이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved')
    return { error: '승인된 계정이 아닙니다.' };

  return { supabase, user, role: profile.role as string };
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

/* ── 생성 ─────────────────────────────────────────────────── */
export async function createSchedule(
  input: ScheduleInput,
): Promise<Result<MarketingSchedule>> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.title)      return { error: '제목을 입력하세요.' };
  if (!input.start_date) return { error: '날짜를 입력하세요.' };

  const { data, error } = await auth.supabase
    .from('marketing_schedules')
    .insert({ ...clean(input), user_id: auth.user!.id })
    .select()
    .single();

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/marketing');
  return { data: data as MarketingSchedule };
}

/* ── 수정 ─────────────────────────────────────────────────── */
export async function updateSchedule(
  id: string,
  input: ScheduleInput,
): Promise<Result<MarketingSchedule>> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.title)      return { error: '제목을 입력하세요.' };
  if (!input.start_date) return { error: '날짜를 입력하세요.' };

  // 본인 또는 관리자만 수정
  if (auth.role !== 'admin') {
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
  revalidatePath('/marketing');
  return { data: data as MarketingSchedule };
}

/* ── 삭제 ─────────────────────────────────────────────────── */
export async function deleteSchedule(id: string): Promise<Result> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  if (auth.role !== 'admin') {
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
  revalidatePath('/marketing');
  return {};
}
