-- ============================================================
-- 월간 회의자료 집계 함수
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE OR REPLACE FUNCTION get_meeting_report(p_month TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  v_prev_month TEXT;
  v_trend_start TEXT;
  v_result JSON;
BEGIN
  SET LOCAL work_mem = '64MB';

  v_prev_month  := TO_CHAR((TO_DATE(p_month, 'YYYY-MM') - INTERVAL '1 month'), 'YYYY-MM');
  v_trend_start := TO_CHAR((TO_DATE(p_month, 'YYYY-MM') - INTERVAL '11 months'), 'YYYY-MM');

  WITH curr AS MATERIALIZED (
    SELECT manager, cso_name, hospital_name, hospital_type, prescription_amount
    FROM commission_settlements
    WHERE prescription_month = p_month
      AND prescription_month IS NOT NULL
  ),
  prev AS MATERIALIZED (
    SELECT manager, prescription_amount
    FROM commission_settlements
    WHERE prescription_month = v_prev_month
      AND prescription_month IS NOT NULL
  ),
  trend AS MATERIALIZED (
    SELECT manager, prescription_month, prescription_amount
    FROM commission_settlements
    WHERE prescription_month >= v_trend_start
      AND prescription_month <= p_month
      AND prescription_month IS NOT NULL
  ),
  available AS MATERIALIZED (
    SELECT DISTINCT prescription_month
    FROM commission_settlements
    WHERE prescription_month IS NOT NULL
  )
  SELECT json_build_object(
    'available_months', (
      SELECT json_agg(prescription_month ORDER BY prescription_month DESC)
      FROM available
    ),

    'by_manager', (
      SELECT json_agg(row_to_json(t) ORDER BY t.total_amount DESC)
      FROM (
        SELECT
          manager,
          SUM(prescription_amount)::bigint AS total_amount,
          COUNT(DISTINCT hospital_name)::int AS hospital_cnt
        FROM curr
        WHERE manager IS NOT NULL
        GROUP BY manager
      ) t
    ),

    'prev_by_manager', (
      SELECT json_agg(row_to_json(t) ORDER BY t.manager)
      FROM (
        SELECT
          manager,
          SUM(prescription_amount)::bigint AS total_amount
        FROM prev
        WHERE manager IS NOT NULL
        GROUP BY manager
      ) t
    ),

    'by_cso', (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT
          manager,
          COALESCE(NULLIF(TRIM(COALESCE(cso_name, '')), ''), '미지정') AS cso_name,
          SUM(prescription_amount)::bigint AS total_amount,
          COUNT(DISTINCT hospital_name)::int AS hospital_cnt
        FROM curr
        WHERE manager IS NOT NULL
        GROUP BY manager, COALESCE(NULLIF(TRIM(COALESCE(cso_name, '')), ''), '미지정')
        ORDER BY manager, SUM(prescription_amount) DESC
      ) t
    ),

    'trend', (
      SELECT json_agg(row_to_json(t) ORDER BY t.manager, t.prescription_month)
      FROM (
        SELECT
          manager,
          prescription_month,
          SUM(prescription_amount)::bigint AS total_amount
        FROM trend
        WHERE manager IS NOT NULL
        GROUP BY manager, prescription_month
      ) t
    ),

    'hosp_type_breakdown', (
      SELECT json_agg(row_to_json(t) ORDER BY t.manager, t.hospital_type)
      FROM (
        SELECT
          manager,
          COALESCE(hospital_type, '기타') AS hospital_type,
          COUNT(DISTINCT hospital_name)::int AS hospital_cnt,
          SUM(prescription_amount)::bigint AS total_amount
        FROM curr
        WHERE manager IS NOT NULL
        GROUP BY manager, COALESCE(hospital_type, '기타')
      ) t
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 인덱스 (없으면 생성)
CREATE INDEX IF NOT EXISTS idx_commsett_presc_month_manager
  ON commission_settlements(prescription_month, manager);
