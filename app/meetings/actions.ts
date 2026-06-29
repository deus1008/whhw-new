'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';
import type { Todo, MeetingRow, TaskSecurity } from './types';

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

async function getUserAndCompany() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, companyId: null };
  const { data: profile } = await supabase
    .from('profiles').select('role, company_id').eq('id', user.id).single();
  if (!profile) return { user, companyId: null };
  const isAdmin = normalizeRole(profile.role as string) === '관리자';
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);
  return { user, companyId };
}

export async function getMeetings(companyId: string | null): Promise<MeetingRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = svc()
    .from('meetings')
    .select('id, title, category, meeting_date, todos, status, priority, security_level, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (companyId) q = q.eq('company_id', companyId);
  const { data } = await q;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    status:         (r.status         ?? '대기') as MeetingRow['status'],
    priority:       (r.priority       ?? '보통') as MeetingRow['priority'],
    security_level: (r.security_level ?? '공개') as MeetingRow['security_level'],
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
    status:         (data.status         ?? '대기') as MeetingRow['status'],
    priority:       (data.priority       ?? '보통') as MeetingRow['priority'],
    security_level: (data.security_level ?? '공개') as MeetingRow['security_level'],
  } as MeetingRow;
}

export async function createMeeting(form: {
  title: string;
  category: string;
  meeting_date: string;
  status?: string;
  priority?: string;
  security_level?: string;
}): Promise<{ id?: string; error?: string }> {
  const { user, companyId } = await getUserAndCompany();
  if (!user) return { error: '인증이 필요합니다.' };
  const { data, error } = await svc()
    .from('meetings')
    .insert({ ...form, meeting_date: form.meeting_date || null, content: '', todos: [], created_by: user.id, company_id: companyId ?? null })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function updateMeeting(
  id: string,
  updates: Partial<{ title: string; category: string; content: string; todos: Todo[]; meeting_date: string; status: string; priority: string; security_level: string }>,
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

/* ── 보안등급 관련 ─────────────────────────────────────────────── */

/** 현재 사용자가 열람 가능한 보안등급 목록 (계층적) */
export async function getUserAccessLevels(userId: string): Promise<TaskSecurity[]> {
  const { data } = await svc()
    .from('task_security_access')
    .select('level')
    .eq('user_id', userId);
  const grants = (data ?? []).map(r => r.level as TaskSecurity);
  const levels: TaskSecurity[] = ['공개'];
  if (grants.includes('기밀')) { levels.push('내부', '기밀'); }
  else if (grants.includes('내부')) { levels.push('내부'); }
  return levels;
}

/** 관리자 전용: 모든 접근 권한 목록 */
export async function getSecurityAccessList(): Promise<{ user_id: string; level: TaskSecurity }[]> {
  const { data } = await svc().from('task_security_access').select('user_id, level');
  return (data ?? []) as { user_id: string; level: TaskSecurity }[];
}

/** 관리자 전용: 사용자에게 보안등급 부여 */
export async function grantSecurityAccess(userId: string, level: '내부' | '기밀'): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: '인증이 필요합니다.' };
  const { error } = await svc().from('task_security_access')
    .upsert({ level, user_id: userId, granted_by: user.id }, { onConflict: 'level,user_id' });
  if (error) return { error: error.message };
  return {};
}

/** 관리자 전용: 사용자 보안등급 해제 */
export async function revokeSecurityAccess(userId: string, level: '내부' | '기밀'): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: '인증이 필요합니다.' };
  const { error } = await svc().from('task_security_access')
    .delete().eq('user_id', userId).eq('level', level);
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
