-- new_contracts 위탁사 격리
ALTER TABLE public.new_contracts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id);
CREATE INDEX IF NOT EXISTS idx_nc_company ON public.new_contracts(company_id);

-- 기존 계약 데이터 전체를 아주약품으로 백필
UPDATE public.new_contracts
SET company_id = (SELECT id FROM public.client_companies WHERE name = '아주약품' LIMIT 1)
WHERE company_id IS NULL;
