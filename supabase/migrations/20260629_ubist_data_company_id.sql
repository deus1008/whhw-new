-- ubist_data 위탁사별 데이터 격리
ALTER TABLE public.ubist_data ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
CREATE INDEX IF NOT EXISTS idx_ubist_data_company ON public.ubist_data(company_id);

-- 기존 시장분석 데이터 전체를 아주약품으로 백필
UPDATE public.ubist_data
SET company_id = (SELECT id FROM public.client_companies WHERE name = '아주약품' LIMIT 1)
WHERE company_id IS NULL;
