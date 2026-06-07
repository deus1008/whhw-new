-- 오류신고 테이블
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

DROP POLICY IF EXISTS "service_all" ON public.error_reports;
CREATE POLICY "service_all" ON public.error_reports FOR ALL USING (true);
