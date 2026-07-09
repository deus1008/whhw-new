-- ============================================================
-- EDI 처방 집계 함수 (get_edi_summary)
-- 수수료정산(commission_settlements)의 hospital_category/hospital_type으로
-- 의원/병원 분류 적용 (EDI 데이터에 hospital_type이 없어도 정확히 구분)
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

  WITH hosp_class AS MATERIALIZED (
    -- 수수료정산 데이터로 병의원 분류 (get_dashboard_settlements와 동일 로직)
    -- hospital_category 우선, 없으면 hospital_type 참조
    SELECT
      hospital_name,
      BOOL_OR(
        COALESCE(hospital_category, hospital_type, '') = '의원'
        OR COALESCE(hospital_category, hospital_type, '') LIKE '%의원'
      ) AS is_clinic
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND hospital_name IS NOT NULL
    GROUP BY hospital_name
  ),
  base AS MATERIALIZED (
    SELECT
      tp.prescription_month,
      tp.hospital_name,
      tp.product_name,
      tp.prescription_amount,
      COALESCE(NULLIF(TRIM(COALESCE(tp.cso_name, '')), ''), '미지정') AS cso_label,
      -- 정산데이터에 병원이 있으면 그 분류 사용, 없으면 병원으로 처리
      COALESCE(hc.is_clinic, FALSE) AS is_clinic
    FROM trend_prescriptions tp
    LEFT JOIN hosp_class hc ON hc.hospital_name = tp.hospital_name
    WHERE tp.company_id = p_company_id
      AND tp.prescription_month = ANY(p_months)
      AND tp.prescription_month IS NOT NULL
  )
  SELECT json_build_object(

    -- 월별 집계
    'by_month', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.prescription_month), '[]'::json)
      FROM (
        SELECT
          prescription_month,
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL)::int              AS hosp_cnt,
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL AND is_clinic)::int  AS clinic_cnt,
          COUNT(DISTINCT hospital_name) FILTER (WHERE hospital_name IS NOT NULL AND NOT is_clinic)::int AS hosp_type_cnt,
          COUNT(DISTINCT product_name)  FILTER (WHERE product_name IS NOT NULL)::int               AS prod_cnt,
          COUNT(DISTINCT product_name)  FILTER (WHERE product_name IS NOT NULL AND is_clinic)::int   AS clinic_prod_cnt,
          COUNT(DISTINCT product_name)  FILTER (WHERE product_name IS NOT NULL AND NOT is_clinic)::int AS hosp_prod_cnt,
          COALESCE(SUM(prescription_amount), 0)::bigint                                            AS presc_amt,
          COALESCE(SUM(prescription_amount) FILTER (WHERE is_clinic), 0)::bigint                   AS clinic_amt,
          COALESCE(SUM(prescription_amount) FILTER (WHERE NOT is_clinic), 0)::bigint               AS hosp_amt
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

CREATE INDEX IF NOT EXISTS idx_cs_company_hosp_name
  ON commission_settlements(company_id, hospital_name);
