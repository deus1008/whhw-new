-- 재고현황, 분석리포트, 미팅관리, 공지사항 위탁사 격리
-- Supabase Dashboard > SQL Editor 에서 실행하세요

ALTER TABLE public.monthly_stock ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
CREATE INDEX IF NOT EXISTS idx_monthly_stock_company ON public.monthly_stock(company_id);

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
CREATE INDEX IF NOT EXISTS idx_reports_company ON public.reports(company_id);

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
CREATE INDEX IF NOT EXISTS idx_meetings_company ON public.meetings(company_id);

ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
CREATE INDEX IF NOT EXISTS idx_notices_company ON public.notices(company_id);

-- 기존 데이터 전체 아주약품으로 백필
DO $$
DECLARE ajoo_id uuid;
BEGIN
  SELECT id INTO ajoo_id FROM public.client_companies WHERE name = '아주약품' LIMIT 1;
  IF ajoo_id IS NOT NULL THEN
    UPDATE public.monthly_stock SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.reports        SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.meetings       SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.notices        SET company_id = ajoo_id WHERE company_id IS NULL;
    RAISE NOTICE '백필 완료: %', ajoo_id;
  END IF;
END $$;
