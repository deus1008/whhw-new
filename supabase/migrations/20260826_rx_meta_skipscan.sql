-- 다처방성분 meta 가속: ubist_data가 수백만 행이 되면 DISTINCT 전체 스캔이 타임아웃난다.
-- 재귀 스킵스캔(loose index scan)으로 고유 기간·진료과를 인덱스 시크만으로 수집 → 크기 무관 수 ms.

-- 진료과 있는 행의 기간 스킵스캔용 부분 인덱스(specialty 스킵스캔은 기존 idx_ubist_spec_period 사용).
CREATE INDEX IF NOT EXISTS idx_ubist_period_spec
  ON public.ubist_data (period) WHERE specialty IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_rx_trend_meta() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE
  sp AS (
    (SELECT specialty FROM public.ubist_data WHERE specialty IS NOT NULL ORDER BY specialty LIMIT 1)
    UNION ALL
    SELECT (SELECT u.specialty FROM public.ubist_data u
            WHERE u.specialty > sp.specialty ORDER BY u.specialty LIMIT 1)
    FROM sp WHERE sp.specialty IS NOT NULL
  ),
  pr AS (
    (SELECT period FROM public.ubist_data WHERE specialty IS NOT NULL AND period IS NOT NULL ORDER BY period LIMIT 1)
    UNION ALL
    SELECT (SELECT u.period FROM public.ubist_data u
            WHERE u.period > pr.period AND u.specialty IS NOT NULL ORDER BY u.period LIMIT 1)
    FROM pr WHERE pr.period IS NOT NULL
  )
  SELECT jsonb_build_object(
    'periods',     (SELECT COALESCE(jsonb_agg(period ORDER BY period DESC), '[]') FROM pr WHERE period IS NOT NULL),
    'specialties', (SELECT COALESCE(jsonb_agg(specialty ORDER BY specialty), '[]') FROM sp WHERE specialty IS NOT NULL)
  );
$$;
ALTER FUNCTION public.get_rx_trend_meta() SET statement_timeout = '20s';
