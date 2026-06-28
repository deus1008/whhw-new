-- ============================================================
-- 위탁사별 데이터 격리: 모든 데이터 테이블에 company_id 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- ============================================================

-- 1) company_id 컬럼 추가 (이미 있으면 무시)
ALTER TABLE public.commission_settlements ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
ALTER TABLE public.trend_prescriptions    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
ALTER TABLE public.customer_status        ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
ALTER TABLE public.documents              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
ALTER TABLE public.upcoming_products      ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
ALTER TABLE public.inventory_items        ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
ALTER TABLE public.dc_status              ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);

-- 2) 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_cs_company       ON public.commission_settlements(company_id);
CREATE INDEX IF NOT EXISTS idx_trend_company    ON public.trend_prescriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_custstatus_co    ON public.customer_status(company_id);
CREATE INDEX IF NOT EXISTS idx_docs_company     ON public.documents(company_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_co      ON public.upcoming_products(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_company      ON public.inventory_items(company_id);
CREATE INDEX IF NOT EXISTS idx_dc_company       ON public.dc_status(company_id);

-- 3) 기존 데이터를 아주약품으로 일괄 태깅
DO $$
DECLARE
  ajoo_id uuid;
BEGIN
  SELECT id INTO ajoo_id FROM public.client_companies WHERE name = '아주약품' LIMIT 1;
  IF ajoo_id IS NOT NULL THEN
    UPDATE public.commission_settlements SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.trend_prescriptions    SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.customer_status        SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.documents              SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.upcoming_products      SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.inventory_items        SET company_id = ajoo_id WHERE company_id IS NULL;
    UPDATE public.dc_status              SET company_id = ajoo_id WHERE company_id IS NULL;
    RAISE NOTICE '기존 데이터를 아주약품(%)으로 태깅 완료', ajoo_id;
  ELSE
    RAISE NOTICE '아주약품을 client_companies에서 찾을 수 없습니다 — 백필 생략';
  END IF;
END $$;
