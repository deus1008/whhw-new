CREATE TABLE IF NOT EXISTS commission_rates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text        NOT NULL,
  product_name text,                         -- NULL = 해당 제약사 전체 적용
  rate         numeric(7,4) NOT NULL DEFAULT 0, -- 예: 15.50 = 15.5%
  source_file  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_name, product_name)
);

ALTER TABLE commission_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr_select" ON commission_rates FOR SELECT USING (true);
CREATE POLICY "cr_insert" ON commission_rates FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cr_update" ON commission_rates FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "cr_delete" ON commission_rates FOR DELETE USING (auth.uid() IS NOT NULL);
