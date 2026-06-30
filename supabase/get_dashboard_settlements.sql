-- ============================================================
-- Supabase SQL Editor에서 실행하세요
-- 대시보드 수수료정산 집계 RPC 함수
-- 171,618개 행 페이지네이션 → 단일 집계 쿼리로 교체
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_settlements(
  p_company_id UUID,
  p_since_month TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_recent_months TEXT[];
  v_by_month_type  JSON;
  v_by_month_total JSON;
  v_by_cso_month   JSON;
  v_by_cso_total   JSON;
  v_by_hosp_month  JSON;
  v_by_prod_month  JSON;
  v_grand_totals   JSON;
BEGIN
  -- 최근 3개월 결정 (DB 데이터 기준)
  SELECT ARRAY(
    SELECT DISTINCT prescription_month
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND prescription_month IS NOT NULL
      AND prescription_month >= p_since_month
    ORDER BY prescription_month DESC
    LIMIT 3
  ) INTO v_recent_months;

  -- A: 월별 × 의원/병원 구분 집계
  SELECT json_agg(row_to_json(t) ORDER BY t.prescription_month, t.is_clinic)
  INTO v_by_month_type
  FROM (
    SELECT
      prescription_month,
      (COALESCE(hospital_category, hospital_type, '') = '의원'
       OR COALESCE(hospital_category, hospital_type, '') LIKE '%의원') AS is_clinic,
      COUNT(DISTINCT hospital_name)::int AS hosp_cnt,
      COUNT(DISTINCT product_name)::int  AS prod_cnt,
      SUM(prescription_amount)::bigint   AS presc_amt,
      SUM(settlement_amount)::bigint     AS sett_amt
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND prescription_month IS NOT NULL
      AND prescription_month = ANY(v_recent_months)
    GROUP BY 1, 2
    ORDER BY 1, 2
  ) t;

  -- A2: 월별 전체 합계 (의원/병원 구분 없음)
  SELECT json_agg(row_to_json(t) ORDER BY t.prescription_month)
  INTO v_by_month_total
  FROM (
    SELECT
      prescription_month,
      COUNT(DISTINCT hospital_name)::int AS hosp_cnt,
      COUNT(DISTINCT product_name)::int  AS prod_cnt,
      SUM(prescription_amount)::bigint   AS presc_amt,
      SUM(settlement_amount)::bigint     AS sett_amt
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND prescription_month IS NOT NULL
      AND prescription_month = ANY(v_recent_months)
    GROUP BY 1
    ORDER BY 1
  ) t;

  -- B: CSO × 월별
  SELECT json_agg(row_to_json(t) ORDER BY t.cso_name, t.prescription_month)
  INTO v_by_cso_month
  FROM (
    SELECT
      COALESCE(NULLIF(TRIM(COALESCE(cso_name, '')), ''), '미지정') AS cso_name,
      prescription_month,
      COUNT(DISTINCT hospital_name)::int AS hosp_cnt,
      SUM(prescription_amount)::bigint   AS presc_amt,
      SUM(settlement_amount)::bigint     AS sett_amt
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND prescription_month IS NOT NULL
      AND prescription_month = ANY(v_recent_months)
    GROUP BY 1, 2
    ORDER BY 1, 2
  ) t;

  -- C: CSO 합계 (기간 내 cross-month 고유 병원 수 포함)
  SELECT json_agg(row_to_json(t) ORDER BY t.presc_amt DESC)
  INTO v_by_cso_total
  FROM (
    SELECT
      COALESCE(NULLIF(TRIM(COALESCE(cso_name, '')), ''), '미지정') AS cso_name,
      COUNT(DISTINCT hospital_name)::int AS hosp_cnt,
      SUM(prescription_amount)::bigint   AS presc_amt,
      SUM(settlement_amount)::bigint     AS sett_amt
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND prescription_month IS NOT NULL
      AND prescription_month = ANY(v_recent_months)
    GROUP BY 1
    ORDER BY 3 DESC
  ) t;

  -- D: 거래처(병원) × 월별 (처방액 상위 50개만)
  SELECT json_agg(row_to_json(t) ORDER BY t.hospital_name, t.prescription_month)
  INTO v_by_hosp_month
  FROM (
    SELECT
      h.hospital_name,
      CASE WHEN COALESCE(h.hospital_category, h.hospital_type, '') = '의원'
             OR COALESCE(h.hospital_category, h.hospital_type, '') LIKE '%의원'
           THEN '의원' ELSE '병원' END AS category,
      h.prescription_month,
      SUM(h.prescription_amount)::bigint AS presc_amt,
      SUM(h.settlement_amount)::bigint   AS sett_amt
    FROM commission_settlements h
    JOIN (
      SELECT hospital_name
      FROM commission_settlements
      WHERE company_id = p_company_id
        AND prescription_month = ANY(v_recent_months)
        AND hospital_name IS NOT NULL
      GROUP BY hospital_name
      ORDER BY SUM(prescription_amount) DESC
      LIMIT 50
    ) top ON h.hospital_name = top.hospital_name
    WHERE h.company_id = p_company_id
      AND h.prescription_month IS NOT NULL
      AND h.prescription_month = ANY(v_recent_months)
    GROUP BY 1, 2, 3
    ORDER BY 1, 3
  ) t;

  -- E: 품목 × 월별 (top/bottom 10 품목 산출용)
  SELECT json_agg(row_to_json(t) ORDER BY t.product_name, t.prescription_month)
  INTO v_by_prod_month
  FROM (
    SELECT
      product_name,
      prescription_month,
      SUM(prescription_amount)::bigint AS presc_amt
    FROM commission_settlements
    WHERE company_id = p_company_id
      AND prescription_month IS NOT NULL
      AND prescription_month = ANY(v_recent_months)
      AND product_name IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1, 2
  ) t;

  -- F: 전체 합계 (CSO 합산 행 표시용)
  SELECT json_build_object(
    'hosp_cnt',  COUNT(DISTINCT hospital_name)::int,
    'presc_amt', SUM(prescription_amount)::bigint,
    'sett_amt',  SUM(settlement_amount)::bigint
  )
  INTO v_grand_totals
  FROM commission_settlements
  WHERE company_id = p_company_id
    AND prescription_month IS NOT NULL
    AND prescription_month = ANY(v_recent_months);

  RETURN json_build_object(
    'recent_months',   to_json(v_recent_months),
    'by_month_type',   v_by_month_type,
    'by_month_total',  v_by_month_total,
    'by_cso_month',    v_by_cso_month,
    'by_cso_total',    v_by_cso_total,
    'by_hosp_month',   v_by_hosp_month,
    'by_prod_month',   v_by_prod_month,
    'grand_totals',    v_grand_totals
  );
END;
$$;
