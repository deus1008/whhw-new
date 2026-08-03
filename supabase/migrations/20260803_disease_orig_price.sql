-- 대조약(오리지널) 최초 등재 상한가 — HIRA 급여이력에서 수집(Phase 2).
-- item_code(제품코드=mdsCd) 기준. orig_price 는 주성분코드(동일제제군) 최소일자 상한가.
CREATE TABLE IF NOT EXISTS public.disease_orig_price (
  item_code   text PRIMARY KEY,          -- 대조약 제품코드(mdsCd) = drug_prices.item_code
  gnlnm_cd    text,                       -- 주성분코드(동일제제군)
  item_name   text,
  orig_price  integer NOT NULL,           -- 최초 등재 상한가(조정 전)
  orig_date   text,                        -- 최초 등재 적용개시일자(YYYYMMDD)
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disease_orig_price_gnlnm ON public.disease_orig_price (gnlnm_cd);

ALTER TABLE public.disease_orig_price ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON public.disease_orig_price;
CREATE POLICY "service_all" ON public.disease_orig_price FOR ALL USING (true);
