-- ============================================================
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_commsett_company_month
  ON commission_settlements(company_id, prescription_month);

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
  SET LOCAL work_mem = '64MB';

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
    -- 1회 테이블 스캔: 85k 행
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
  -- 병원별 사전 집계: 85k → ~21k 행 (hospital × month × is_clinic × cso)
  -- COUNT(DISTINCT) 연산을 이 작은 집합에서 수행해 속도 향상
  h AS MATERIALIZED (
    SELECT
      prescription_month,
      hospital_name,
      is_clinic,
      cso_norm,
      SUM(prescription_amount)::bigint AS pa,
      SUM(settlement_amount)::bigint   AS sa
    FROM filtered
    WHERE hospital_name IS NOT NULL
    GROUP BY 1, 2, 3, 4
  ),
  -- 제품별 사전 집계: by_prod_month 용
  p AS MATERIALIZED (
    SELECT
      prescription_month,
      product_name,
      is_clinic,
      SUM(prescription_amount)::bigint AS pa
    FROM filtered
    WHERE product_name IS NOT NULL
    GROUP BY 1, 2, 3
  ),
  -- CSO별 × 월별 품목 수: by_cso_month prod_cnt 용
  cp AS MATERIALIZED (
    SELECT
      cso_norm,
      prescription_month,
      COUNT(DISTINCT product_name)::int AS prod_cnt
    FROM filtered
    WHERE product_name IS NOT NULL
    GROUP BY 1, 2
  )
  SELECT json_build_object(
    'recent_months', to_json(v_recent_months),

    -- 월별 × 의원/병원: h(21k)에서 COUNT DISTINCT (85k 대비 ~4배 빠름)
    'by_month_type', (
      SELECT json_agg(row_to_json(t) ORDER BY t.prescription_month, t.is_clinic)
      FROM (
        SELECT
          hg.prescription_month,
          hg.is_clinic,
          COUNT(DISTINCT hg.hospital_name)::int AS hosp_cnt,
          ( SELECT COUNT(*)::int FROM p
            WHERE p.prescription_month = hg.prescription_month
              AND p.is_clinic = hg.is_clinic ) AS prod_cnt,
          SUM(hg.pa)::bigint AS presc_amt,
          SUM(hg.sa)::bigint AS sett_amt
        FROM h hg
        GROUP BY hg.prescription_month, hg.is_clinic
      ) t
    ),

    -- 월별 합계: 동일 방식
    'by_month_total', (
      SELECT json_agg(row_to_json(t) ORDER BY t.prescription_month)
      FROM (
        SELECT
          hg.prescription_month,
          COUNT(DISTINCT hg.hospital_name)::int AS hosp_cnt,
          ( SELECT COUNT(DISTINCT p.product_name)::int FROM p
            WHERE p.prescription_month = hg.prescription_month ) AS prod_cnt,
          SUM(hg.pa)::bigint AS presc_amt,
          SUM(hg.sa)::bigint AS sett_amt
        FROM h hg
        GROUP BY hg.prescription_month
      ) t
    ),

    -- CSO별 월별: 처방처수(DISTINCT hospital) + 처방품목수(cp) + 처방액/정산액
    'by_cso_month', (
      SELECT json_agg(row_to_json(t) ORDER BY t.cso_name, t.prescription_month)
      FROM (
        SELECT
          hg.cso_norm AS cso_name,
          hg.prescription_month,
          COUNT(DISTINCT hg.hospital_name)::int      AS hosp_cnt,
          COALESCE(MAX(cp.prod_cnt), 0)::int         AS prod_cnt,
          SUM(hg.pa)::bigint                         AS presc_amt,
          SUM(hg.sa)::bigint                         AS sett_amt
        FROM h hg
        LEFT JOIN cp ON cp.cso_norm = hg.cso_norm
                    AND cp.prescription_month = hg.prescription_month
        GROUP BY hg.cso_norm, hg.prescription_month
      ) t
    ),

    -- CSO별 합계: h(21k)에서 COUNT DISTINCT
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

    -- 상위 50 병원 월별: h에서 SUM (DISTINCT 없음)
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
        WHERE hg.hospital_name IN (
          SELECT hospital_name FROM h
          GROUP BY hospital_name
          ORDER BY SUM(pa) DESC
          LIMIT 50
        )
        GROUP BY hg.hospital_name, hg.prescription_month
      ) t
    ),

    -- 제품별 월별: p에서 SUM (DISTINCT 없음)
    'by_prod_month', (
      SELECT json_agg(row_to_json(t) ORDER BY t.product_name, t.prescription_month)
      FROM (
        SELECT product_name, prescription_month,
          SUM(pa)::bigint AS presc_amt
        FROM p
        GROUP BY 1, 2
      ) t
    ),

    -- 전체 합계: h(21k)에서 COUNT DISTINCT
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
