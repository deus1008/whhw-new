-- 다처방성분 meta(진료과·월 목록) DISTINCT 가속 — 진료과 있는 행만 대상 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_ubist_spec_period
  ON public.ubist_data (specialty, period) WHERE specialty IS NOT NULL;
ALTER FUNCTION public.get_rx_trend_meta() SET statement_timeout = '55s';
