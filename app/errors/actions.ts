'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type ErrorReport = {
  id:             string;
  title:          string;
  content:        string;
  status:         '접수' | '처리중' | '완료';
  reporter_id:    string | null;
  reporter_email: string | null;
  reporter_name:  string | null;
  admin_comment:  string | null;
  reporter_seen:  boolean;
  created_at:     string;
  updated_at:     string;
};

/* ── 오류 신고 제출 (모든 로그인 사용자) ─────────── */
export async function submitErrorReport(
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const title   = (formData.get('title')   as string)?.trim();
  const content = (formData.get('content') as string)?.trim();
  if (!title)   return { error: '제목을 입력하세요.' };
  if (!content) return { error: '내용을 입력하세요.' };

  const { error } = await svc().from('error_reports').insert({
    title,
    content,
    reporter_id:    user.id,
    reporter_email: user.email ?? null,
    reporter_name:  profile?.full_name ?? null,
  });

  if (error) return { error: `전송 실패: ${error.message}` };
  return {};
}

/* ── 전체 목록 조회 (관리자) ─────────────────────── */
export async function getErrorReports(): Promise<ErrorReport[]> {
  const { data, error } = await svc()
    .from('error_reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('[getErrorReports]', error); return []; }
  return (data ?? []) as ErrorReport[];
}

/* ── 상태/조치결과 업데이트 (관리자) — 인앱 회신 ─────
   조치결과(admin_comment)가 있으면 reporter_seen=false 로 만들어
   신고자 화면에 '새 조치' 배지가 뜨게 한다(메일/문자 발송 없음). */
export async function updateErrorReport(
  formData: FormData,
): Promise<{ error?: string }> {
  const id            = formData.get('id')            as string;
  const status        = formData.get('status')        as string;
  const admin_comment = (formData.get('admin_comment') as string)?.trim() || null;

  const update: Record<string, unknown> = {
    status, admin_comment, updated_at: new Date().toISOString(),
  };
  if (admin_comment) update.reporter_seen = false;   // 신고자에게 새 조치 알림

  const { error } = await svc().from('error_reports').update(update).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/errors');
  return {};
}

/* ── 내 신고 목록 조회 (신고자 본인) + 열람 시 읽음 처리 ── */
export async function getMyErrorReports(): Promise<ErrorReport[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const db = svc();
  const { data, error } = await db
    .from('error_reports')
    .select('*')
    .eq('reporter_id', user.id)
    .order('created_at', { ascending: false });
  if (error) { console.error('[getMyErrorReports]', error); return []; }

  // 열람 = 읽음 처리 → 사용자 배지 제거
  await db.from('error_reports')
    .update({ reporter_seen: true })
    .eq('reporter_id', user.id)
    .eq('reporter_seen', false);

  return (data ?? []) as ErrorReport[];
}

/* ── 신고자용 미확인 조치 건수 (홈 '오류신고' 배지) ── */
export async function getMyUnseenCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count } = await svc()
    .from('error_reports')
    .select('*', { count: 'exact', head: true })
    .eq('reporter_id', user.id)
    .eq('reporter_seen', false)
    .not('admin_comment', 'is', null);
  return count ?? 0;
}

/* ── 접수 건수 (관리자 '오류신고함' 배지용) ─────────── */
export async function getPendingCount(): Promise<number> {
  const { count } = await svc()
    .from('error_reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', '접수');
  return count ?? 0;
}
