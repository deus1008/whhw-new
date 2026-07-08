-- ============================================================
-- Supabase SQL Editor에서 실행하세요
-- (기존 함수 교체 - correlated subquery 제거 최적화)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_commsett_company_month
  ON commission_settlements(company_id, prescription_month);

CREATE INDEX IF NOT EXISTS idx_commsett_company_month_prod
  ON commission_settlements(company_id, prescription_month, product_name)
  WHERE product_name IS NOT NULL;

CREATE OR REPLACE FUNCTION get_dashboard_settlements(
  p_company_id UUID,
  p_since_month TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  v_recent_months TEXT[];
  v_result        JSON;
BEGIN
  SET LOCAL work_mem = '128MB';

  -- 최근 3개월 결정
  SELECT ARRAY(
    SELECT DISTINCT prescription_month
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND prescription_month IS NOT NULL
      AND prescription_month >= p_since_month
    ORDER BY prescription_month DESC
    LIMIT 3
  ) INTO v_recent_months;

  WITH filtered AS MATERIALIZED (
    SELECT
      prescription_month,
      hospital_name,
      product_name,
      prescription_amount,
      settlement_amount,
      COALESCE(NULLIF(TRIM(COALESCE(cso_name, '')), ''), '미지정') AS cso_norm,
      (COALESCE(hospital_category, hospital_type, '') = '의원'
       OR COALESCE(hospital_category, hospital_type, '') LIKE '%의원') AS is_clinic
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND prescription_month IS NOT NULL
      AND prescription_month = ANY(v_recent_months)
  ),
  -- 병원별 사전 집계
  h AS MATERIALIZED (
    SELECT
      prescription_month, hospital_name, is_clinic, cso_norm,
      SUM(prescription_amount)::bigint AS pa,
      SUM(settlement_amount)::bigint   AS sa
    FROM filtered
    WHERE hospital_name IS NOT NULL
    GROUP BY 1, 2, 3, 4
  ),
  -- 제품별 사전 집계
  p AS MATERIALIZED (
    SELECT
      prescription_month, product_name, is_clinic,
      SUM(prescription_amount)::bigint AS pa
    FROM filtered
    WHERE product_name IS NOT NULL
    GROUP BY 1, 2, 3
  ),
  -- 월별 × 의원/병원별 품목 수 (correlated subquery 제거)
  prod_cnt_type AS MATERIALIZED (
    SELECT prescription_month, is_clinic,
      COUNT(DISTINCT product_name)::int AS prod_cnt
    FROM p
    GROUP BY 1, 2
  ),
  -- 월별 전체 품목 수 (correlated subquery 제거)
  prod_cnt_month AS MATERIALIZED (
    SELECT prescription_month,
      COUNT(DISTINCT product_name)::int AS prod_cnt
    FROM p
    GROUP BY 1
  ),
  -- CSO별 × 월별 품목 수
  cp AS MATERIALIZED (
    SELECT cso_norm, prescription_month,
      COUNT(DISTINCT product_name)::int AS prod_cnt
    FROM filtered
    WHERE product_name IS NOT NULL
    GROUP BY 1, 2
  ),
  -- TOP 50 병원 미리 계산 (IN 서브쿼리 제거)
  top50_hosps AS MATERIALIZED (
    SELECT hospital_name
    FROM h
    GROUP BY hospital_name
    ORDER BY SUM(pa) DESC
    LIMIT 50
  )
  SELECT json_build_object(
    'recent_months', to_json(v_recent_months),

    -- 월별 × 의원/병원
    'by_month_type', (
      SELECT json_agg(row_to_json(t) ORDER BY t.prescription_month, t.is_clinic)
      FROM (
        SELECT
          hg.prescription_month, hg.is_clinic,
          COUNT(DISTINCT hg.hospital_name)::int AS hosp_cnt,
          COALESCE(pc.prod_cnt, 0)              AS prod_cnt,
          SUM(hg.pa)::bigint                    AS presc_amt,
          SUM(hg.sa)::bigint                    AS sett_amt
        FROM h hg
        LEFT JOIN prod_cnt_type pc
          ON pc.prescription_month = hg.prescription_month
         AND pc.is_clinic = hg.is_clinic
        GROUP BY hg.prescription_month, hg.is_clinic, pc.prod_cnt
      ) t
    ),

    -- 월별 합계
    'by_month_total', (
      SELECT json_agg(row_to_json(t) ORDER BY t.prescription_month)
      FROM (
        SELECT
          hg.prescription_month,
          COUNT(DISTINCT hg.hospital_name)::int AS hosp_cnt,
          COALESCE(pc.prod_cnt, 0)              AS prod_cnt,
          SUM(hg.pa)::bigint                    AS presc_amt,
          SUM(hg.sa)::bigint                    AS sett_amt
        FROM h hg
        LEFT JOIN prod_cnt_month pc
          ON pc.prescription_month = hg.prescription_month
        GROUP BY hg.prescription_month, pc.prod_cnt
      ) t
    ),

    -- CSO별 월별
    'by_cso_month', (
      SELECT json_agg(row_to_json(t) ORDER BY t.cso_name, t.prescription_month)
      FROM (
        SELECT
          hg.cso_norm          AS cso_name,
          hg.prescription_month,
          COUNT(DISTINCT hg.hospital_name)::int AS hosp_cnt,
          COALESCE(MAX(cp.prod_cnt), 0)::int    AS prod_cnt,
          SUM(hg.pa)::bigint                    AS presc_amt,
          SUM(hg.sa)::bigint                    AS sett_amt
        FROM h hg
        LEFT JOIN cp ON cp.cso_norm = hg.cso_norm
                    AND cp.prescription_month = hg.prescription_month
        GROUP BY hg.cso_norm, hg.prescription_month
      ) t
    ),

    -- CSO별 합계
    'by_cso_total', (
      SELECT json_agg(row_to_json(t) ORDER BY t.presc_amt DESC)
      FROM (
        SELECT cso_norm AS cso_name,
          COUNT(DISTINCT hospital_name)::int AS hosp_cnt,
          SUM(pa)::bigint AS presc_amt,
          SUM(sa)::bigint AS sett_amt
        FROM h
        GROUP BY 1
      ) t
    ),

    -- 상위 50 병원 월별 (INNER JOIN으로 대체)
    'by_hosp_month', (
      SELECT json_agg(row_to_json(t) ORDER BY t.hospital_name, t.prescription_month)
      FROM (
        SELECT
          hg.hospital_name,
          CASE WHEN BOOL_OR(hg.is_clinic) THEN '의원' ELSE '병원' END AS category,
          hg.prescription_month,
          SUM(hg.pa)::bigint AS presc_amt,
          SUM(hg.sa)::bigint AS sett_amt
        FROM h hg
        INNER JOIN top50_hosps ON top50_hosps.hospital_name = hg.hospital_name
        GROUP BY hg.hospital_name, hg.prescription_month
      ) t
    ),

    -- 제품별 월별
    'by_prod_month', (
      SELECT json_agg(row_to_json(t) ORDER BY t.product_name, t.prescription_month)
      FROM (
        SELECT product_name, prescription_month, SUM(pa)::bigint AS presc_amt
        FROM p
        GROUP BY 1, 2
      ) t
    ),

    -- 전체 합계
    'grand_totals', (
      SELECT json_build_object(
        'hosp_cnt',  COUNT(DISTINCT hospital_name)::int,
        'presc_amt', SUM(pa)::bigint,
        'sett_amt',  SUM(sa)::bigint
      )
      FROM h
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;
