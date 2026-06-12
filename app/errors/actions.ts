'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendErrorReportReply } from '@/lib/email';

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

/* ── 상태/조치결과 업데이트 (관리자) ─────────────── */
export async function updateErrorReport(
  formData: FormData,
): Promise<{ error?: string; emailSent?: boolean }> {
  const id            = formData.get('id')            as string;
  const status        = formData.get('status')        as string;
  const admin_comment = (formData.get('admin_comment') as string)?.trim() || null;
  const sendEmail     = formData.get('send_email') === '1';

  // 이메일 발송 위해 기존 신고 데이터 조회
  const { data: report } = await svc()
    .from('error_reports')
    .select('title, content, reporter_email')
    .eq('id', id)
    .single();

  const { error } = await svc()
    .from('error_reports')
    .update({ status, admin_comment, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };

  // 이메일 발송: 체크박스 ON + 조치결과 있음 + 수신자 이메일 있음
  let emailSent = false;
  if (sendEmail && admin_comment && report?.reporter_email) {
    emailSent = await sendErrorReportReply({
      to:            report.reporter_email,
      reportTitle:   report.title,
      reportContent: report.content,
      status,
      adminComment:  admin_comment,
    });
  }

  revalidatePath('/errors');
  return { emailSent };
}

/* ── 접수 건수 (대시보드 배지용) ─────────────────── */
export async function getPendingCount(): Promise<number> {
  const { count } = await svc()
    .from('error_reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', '접수');
  return count ?? 0;
}
