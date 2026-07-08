-- trend_prescriptions: company_id 컬럼 추가 및 기존 데이터 아주약품 태깅
ALTER TABLE public.trend_prescriptions
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);

CREATE INDEX IF NOT EXISTS idx_trend_company ON public.trend_prescriptions(company_id);

DO $$
DECLARE
  ajoo_id uuid;
BEGIN
  SELECT id INTO ajoo_id FROM public.client_companies WHERE name = '아주약품' LIMIT 1;
  IF ajoo_id IS NOT NULL THEN
    UPDATE public.trend_prescriptions SET company_id = ajoo_id WHERE company_id IS NULL;
    RAISE NOTICE '기존 데이터를 아주약품(%)으로 태깅 완료', ajoo_id;
  ELSE
    RAISE NOTICE '아주약품을 client_companies에서 찾을 수 없습니다';
  END IF;
END $$;
