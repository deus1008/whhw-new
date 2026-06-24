-- 월별 재고현황 테이블
CREATE TABLE IF NOT EXISTS monthly_stock (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file     TEXT        NOT NULL,
  year            TEXT        NOT NULL,
  period          TEXT        NOT NULL,
  material_code   TEXT        NOT NULL,
  material_name   TEXT        NOT NULL,
  unit            TEXT,
  available_qty   NUMERIC     NOT NULL DEFAULT 0,
  transit_qty     NUMERIC     NOT NULL DEFAULT 0,
  total_qty       NUMERIC     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monthly_stock_year_period_idx ON monthly_stock (year, period);
CREATE INDEX IF NOT EXISTS monthly_stock_source_file_idx ON monthly_stock (source_file);
CREATE INDEX IF NOT EXISTS monthly_stock_total_qty_idx   ON monthly_stock (total_qty DESC);
