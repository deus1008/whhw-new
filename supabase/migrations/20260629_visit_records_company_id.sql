-- visit_records 위탁사별 데이터 격리
ALTER TABLE public.visit_records ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
CREATE INDEX IF NOT EXISTS idx_visit_records_company ON public.visit_records(company_id);

-- 기존 영업활동 기록 전체를 아주약품으로 백필
UPDATE public.visit_records
SET company_id = (SELECT id FROM public.client_companies WHERE name = '아주약품' LIMIT 1)
WHERE company_id IS NULL;
