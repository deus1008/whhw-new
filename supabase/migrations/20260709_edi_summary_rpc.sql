-- ============================================================
-- EDI 처방 집계 함수 (get_edi_summary)
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE OR REPLACE FUNCTION get_edi_summary(
  p_company_id UUID,
  p_months TEXT[]   -- YYYYMM 포맷 예: ARRAY['202505','202604','202605']
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  v_result JSON;
BEGIN
  SET LOCAL work_mem = '64MB';

  WITH base AS MATERIALIZED (
    SELECT
      prescription_month,
      hospital_name,
      product_name,
      prescription_amount,
      hospital_type,
      COALESCE(NULLIF(TRIM(COALESCE(cso_name, '')), ''), '미지정') AS cso_label
    FROM trend_prescriptions
    WHERE company_id = p_company_id
      AND prescription_month = ANY(p_months)
      AND prescription_month IS NOT NULL
  )
  SELECT json_build_object(

    -- 월별 집계
    'by_month', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.prescription_month), '[]'::json)
      FROM (
        SELECT
          prescription_month,
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::int AS hosp_cnt,
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL
            AND (hospital_type = '의원' OR (hospital_type LIKE '%의원%' AND hospital_type NOT LIKE '%병원%')))::int AS clinic_cnt,
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL
            AND NOT (hospital_type = '의원' OR (hospital_type LIKE '%의원%' AND hospital_type NOT LIKE '%병원%')))::int AS hosp_type_cnt,
          COUNT(DISTINCT product_name)  FILTER (WHERE product_name IS NOT NULL)::int AS prod_cnt,
          COUNT(DISTINCT product_name)  FILTER (WHERE product_name IS NOT NULL
            AND (hospital_type = '의원' OR (hospital_type LIKE '%의원%' AND hospital_type NOT LIKE '%병원%')))::int AS clinic_prod_cnt,
          COUNT(DISTINCT product_name)  FILTER (WHERE product_name IS NOT NULL
            AND NOT (hospital_type = '의원' OR (hospital_type LIKE '%의원%' AND hospital_type NOT LIKE '%병원%')))::int AS hosp_prod_cnt,
          COALESCE(SUM(prescription_amount), 0)::bigint AS presc_amt,
          COALESCE(SUM(prescription_amount) FILTER (
            WHERE hospital_type = '의원' OR (hospital_type LIKE '%의원%' AND hospital_type NOT LIKE '%병원%')
          ), 0)::bigint AS clinic_amt,
          COALESCE(SUM(prescription_amount) FILTER (
            WHERE NOT (hospital_type = '의원' OR (hospital_type LIKE '%의원%' AND hospital_type NOT LIKE '%병원%'))
          ), 0)::bigint AS hosp_amt
        FROM base
        GROUP BY prescription_month
      ) t
    ),

    -- 품목별 월별 집계
    'by_product', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          product_name,
          prescription_month,
          COALESCE(SUM(prescription_amount), 0)::bigint AS presc_amt
        FROM base
        WHERE product_name IS NOT NULL
        GROUP BY product_name, prescription_month
      ) t
    ),

    -- CSO별 월별 집계
    'by_cso_month', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          cso_label AS cso_name,
          prescription_month,
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::int AS hosp_cnt,
          COUNT(DISTINCT product_name)  FILTER (WHERE product_name IS NOT NULL)::int  AS prod_cnt,
          COALESCE(SUM(prescription_amount), 0)::bigint                               AS presc_amt
        FROM base
        GROUP BY cso_label, prescription_month
      ) t
    ),

    -- CSO별 전체 집계
    'by_cso_total', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.total_presc_amt DESC), '[]'::json)
      FROM (
        SELECT
          cso_label AS cso_name,
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::int AS total_hosp_cnt,
          COALESCE(SUM(prescription_amount), 0)::bigint                               AS total_presc_amt
        FROM base
        GROUP BY cso_label
      ) t
    ),

    -- 전체 합계
    'totals', (
      SELECT row_to_json(t)
      FROM (
        SELECT
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::int AS total_hosp_cnt,
          COALESCE(SUM(prescription_amount), 0)::bigint                               AS total_presc_amt
        FROM base
      ) t
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 인덱스 (없으면 생성)
CREATE INDEX IF NOT EXISTS idx_trend_presc_company_month
  ON trend_prescriptions(company_id, prescription_month);
