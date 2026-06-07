-- 재고현황: 품절 경보 (품절예측 시트)
CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_file  text NOT NULL,
  alert_type   text,                  -- 품절 / 부족 등
  product_code text,
  product_name text,
  sales_3m     numeric,               -- 직3매출(백만/월)
  sales_month  numeric,               -- 당월매출(백만)
  stock_amount numeric,               -- 재고(백만)
  stock_days   numeric,               -- 재고일(SF대비)
  stockout_start_date date,           -- 품절(예측)시작일
  supply_date  date,                  -- 공급예정일
  stockout_days text,                 -- 품절일수 (예: "14일")
  manufacturer text,                  -- 제조처
  cause        text,                  -- 발생유형
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.stock_alerts DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sa_source ON public.stock_alerts(source_file);
CREATE INDEX IF NOT EXISTS idx_sa_alert  ON public.stock_alerts(alert_type);

-- 재고현황: 전체 재고+판매계획 (Sheet1 + 재고 시트)
CREATE TABLE IF NOT EXISTS public.stock_items (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_file        text NOT NULL,
  product_code       text,
  product_name       text,
  pm                 text,
  available_stock    numeric DEFAULT 0,   -- 가용 재고 (EA)
  total_stock        numeric DEFAULT 0,   -- 가용+운송 (EA)
  monthly_plan       numeric,             -- 당월판매계획
  monthly_actual     numeric,             -- 당월판매
  avg_3m             numeric,             -- 3개월평균 판매량
  plan_ratio         numeric,             -- 판매계획대비 (%)
  order_available    numeric,             -- 주문가능량
  stock_rotation_days numeric,            -- 재고회전일
  created_at         timestamptz DEFAULT now()
);
ALTER TABLE public.stock_items DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_si_source ON public.stock_items(source_file);
CREATE INDEX IF NOT EXISTS idx_si_code   ON public.stock_items(product_code);
