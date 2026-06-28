'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Todo, MeetingRow } from './types';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getMeetings(): Promise<MeetingRow[]> {
  const { data } = await svc()
    .from('meetings')
    .select('id, title, category, meeting_date, todos, status, priority, created_at, updated_at')
    .order('created_at', { ascending: false });
  return (data ?? []).map(r => ({
    ...r,
    status:   (r.status   ?? '대기') as MeetingRow['status'],
    priority: (r.priority ?? '보통') as MeetingRow['priority'],
  })) as MeetingRow[];
}

export async function getMeeting(id: string): Promise<MeetingRow | null> {
  const { data } = await svc()
    .from('meetings')
    .select('*')
    .eq('id', id)
    .single();
  if (!data) return null;
  return {
    ...data,
    status:   (data.status   ?? '대기') as MeetingRow['status'],
    priority: (data.priority ?? '보통') as MeetingRow['priority'],
  } as MeetingRow;
}

export async function createMeeting(form: {
  title: string;
  category: string;
  meeting_date: string;
  status?: string;
  priority?: string;
}): Promise<{ id?: string; error?: string }> {
  const user = await getUser();
  if (!user) return { error: '인증이 필요합니다.' };
  const { data, error } = await svc()
    .from('meetings')
    .insert({ ...form, content: '', todos: [], created_by: user.id })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function updateMeeting(
  id: string,
  updates: Partial<{ title: string; category: string; content: string; todos: Todo[]; meeting_date: string; status: string; priority: string }>,
): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: '인증이 필요합니다.' };
  const { error } = await svc()
    .from('meetings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteMeeting(id: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: '인증이 필요합니다.' };
  const { error } = await svc().from('meetings').delete().eq('id', id);
  if (error) return { error: error.message };
  return {};
}

export async function clearCategory(category: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: '인증이 필요합니다.' };
  const { error } = await svc()
    .from('meetings')
    .update({ category: null, updated_at: new Date().toISOString() })
    .eq('category', category);
  if (error) return { error: error.message };
  return {};
}

export async function renameCategory(oldCat: string, newCat: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: '인증이 필요합니다.' };
  const { error } = await svc()
    .from('meetings')
    .update({ category: newCat, updated_at: new Date().toISOString() })
    .eq('category', oldCat);
  if (error) return { error: error.message };
  return {};
}

export async function addTodoToCalendar(params: {
  todoText:     string;
  meetingTitle: string;
  meetingDate:  string;   // YYYY-MM-DD (fallback)
  dueDate?:     string;   // YYYY-MM-DD (우선 사용)
}): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: '인증이 필요합니다.' };

  const { error } = await svc()
    .from('marketing_schedules')
    .insert({
      user_id:    user.id,
      title:      params.todoText,
      start_date: params.dueDate ?? params.meetingDate,
      category:   '영업관리',
      memo:       `📝 회의록 "${params.meetingTitle}"`,
    });

  if (error) return { error: error.message };
  return {};
}
