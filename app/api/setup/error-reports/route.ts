// 테이블 1회 생성용 임시 엔드포인트 — 생성 완료 후 삭제 예정
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // pg 직접 접근 대신 — 테이블 없으면 insert 에러를 보고 안내
  const svc = createClient(url, key);
  const { error } = await svc.from('error_reports').select('id').limit(1);

  if (!error) {
    return Response.json({ ok: true, message: 'error_reports 테이블이 이미 존재합니다.' });
  }

  // 테이블이 없는 경우 — 아래 SQL을 Supabase 대시보드에서 실행하도록 안내
  const sql = `
CREATE TABLE IF NOT EXISTS public.error_reports (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title          text NOT NULL,
  content        text NOT NULL,
  status         text NOT NULL DEFAULT '접수',
  reporter_id    uuid,
  reporter_email text,
  reporter_name  text,
  admin_comment  text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_all ON public.error_reports FOR ALL USING (true);
  `.trim();

  return Response.json({
    ok: false,
    message: '테이블이 없습니다. Supabase 대시보드 > SQL Editor에서 아래 SQL을 실행하세요.',
    sql,
  });
}
