'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type Todo = { id: string; text: string; done: boolean };

export type MeetingRow = {
  id: string;
  title: string;
  category: string;
  content: string;
  todos: Todo[];
  meeting_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const CATEGORIES = ['마케팅관련', '영업관련', '정책관련', '공급관련', '기타'] as const;

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getMeetings(): Promise<MeetingRow[]> {
  const { data } = await svc()
    .from('meetings')
    .select('id, title, category, meeting_date, todos, created_at, updated_at')
    .order('meeting_date', { ascending: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as MeetingRow[];
}

export async function getMeeting(id: string): Promise<MeetingRow | null> {
  const { data } = await svc()
    .from('meetings')
    .select('*')
    .eq('id', id)
    .single();
  return (data ?? null) as MeetingRow | null;
}

export async function createMeeting(form: {
  title: string;
  category: string;
  meeting_date: string;
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
  updates: Partial<{ title: string; category: string; content: string; todos: Todo[]; meeting_date: string }>,
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
