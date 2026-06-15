-- 재고현황: 수동 등록/수정 항목
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type     text        NOT NULL DEFAULT '예측',
  product_code   text        NOT NULL DEFAULT '',
  product_name   text        NOT NULL,
  sales_3m       numeric,
  sales_month    numeric,
  stock_amount   numeric,
  stock_days     integer,
  stockout_start text,
  supply_date    text,
  stockout_days  text,
  manufacturer   text        NOT NULL DEFAULT '',
  cause          text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inv_alert ON public.inventory_items(alert_type);
