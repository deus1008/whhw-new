-- 수수료율표 보험코드(청구코드) 저장 — 약품 item_code 정확 매칭용.
--   제품명/회사명 표기 차이로 인한 매칭 누락을 없애기 위해 보험코드로 조인.
ALTER TABLE public.commission_rates ADD COLUMN IF NOT EXISTS insurance_code text;
CREATE INDEX IF NOT EXISTS idx_commission_rates_insurance ON public.commission_rates (insurance_code);
