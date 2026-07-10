-- ============================================================
-- EDI hospital_type 직접 사용 전환
--   1) hospital_clinic_map 에 hospital_type 컬럼 추가 (정산 기반 마스터)
--      → 트리거로 자동 갱신, syncEdiToDb 업로드 시 이 값을 EDI 행에 채움
--   2) get_edi_summary 가 trend_prescriptions.hospital_type 을 직접 사용하도록 변경
--      (기존 hospital_clinic_map LEFT JOIN 제거 → 조인 없이 더 단순/빠름)
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- ── 0) 백필 가속 인덱스 (먼저 생성) ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trend_presc_hospital_name
  ON trend_prescriptions(hospital_name);

-- ── 1) hospital_clinic_map.hospital_type 컬럼 ───────────────────────────────
ALTER TABLE hospital_clinic_map ADD COLUMN IF NOT EXISTS hospital_type text;

-- 기존 정산 데이터로 hospital_type 최빈값 채움
UPDATE hospital_clinic_map hcm
SET hospital_type = src.htype
FROM (
  SELECT company_id, hospital_name,
    MODE() WITHIN GROUP (ORDER BY hospital_type) AS htype
  FROM commission_settlements
  WHERE hospital_name IS NOT NULL
    AND COALESCE(hospital_type, '') <> ''
  GROUP BY company_id, hospital_name
) src
WHERE hcm.company_id = src.company_id
  AND hcm.hospital_name = src.hospital_name;

-- ── 2) 트리거 함수: is_clinic + hospital_type 동시 갱신 ─────────────────────
CREATE OR REPLACE FUNCTION refresh_hospital_clinic_map()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO hospital_clinic_map (company_id, hospital_name, is_clinic, hospital_type, updated_at)
  SELECT
    cs.company_id,
    cs.hospital_name,
    BOOL_OR(
      COALESCE(cs.hospital_category, cs.hospital_type, '') = '의원'
      OR COALESCE(cs.hospital_category, cs.hospital_type, '') LIKE '%의원'
    ) AS is_clinic,
    MODE() WITHIN GROUP (ORDER BY NULLIF(TRIM(COALESCE(cs.hospital_type, '')), '')) AS hospital_type,
    now()
  FROM commission_settlements cs
  WHERE cs.company_id IN (
    SELECT DISTINCT company_id FROM new_rows WHERE company_id IS NOT NULL
  )
    AND cs.hospital_name IS NOT NULL
  GROUP BY cs.company_id, cs.hospital_name
  ON CONFLICT (company_id, hospital_name)
    DO UPDATE SET
      is_clinic     = EXCLUDED.is_clinic,
      hospital_type = COALESCE(EXCLUDED.hospital_type, hospital_clinic_map.hospital_type),
      updated_at    = EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;

-- ── 2) trend_prescriptions.hospital_type 백필 (자체 재현용, 멱등) ────────────
-- 2a) 정산 hospital_type 최빈값을 같은 hospital_name EDI 행에 채움
WITH type_map AS (
  SELECT company_id, hospital_name,
    MODE() WITHIN GROUP (ORDER BY hospital_type) AS htype
  FROM commission_settlements
  WHERE hospital_name IS NOT NULL
    AND COALESCE(hospital_type, '') <> ''
  GROUP BY company_id, hospital_name
)
UPDATE trend_prescriptions tp
SET hospital_type = tm.htype
FROM type_map tm
WHERE tp.company_id IS NOT DISTINCT FROM tm.company_id
  AND tp.hospital_name = tm.hospital_name
  AND tp.hospital_type IS NULL;

-- 2b) 정산에 없는 병원: 이름 접미사 기반 추정 (구체적 접미사 우선)
UPDATE trend_prescriptions
SET hospital_type = CASE
  WHEN hospital_name LIKE '%치과의원'   THEN '치과의원'
  WHEN hospital_name LIKE '%한의원'     THEN '한의원'
  WHEN hospital_name LIKE '%요양병원'   THEN '요양병원'
  WHEN hospital_name LIKE '%한방병원'   THEN '한방병원'
  WHEN hospital_name LIKE '%치과병원'   THEN '치과병원'
  WHEN hospital_name LIKE '%정신병원'   THEN '정신병원'
  WHEN hospital_name LIKE '%종합병원'   THEN '종합병원'
  WHEN hospital_name LIKE '%보건의료원' THEN '보건의료원'
  WHEN hospital_name LIKE '%보건진료소' THEN '보건진료소'
  WHEN hospital_name LIKE '%보건지소'   THEN '보건지소'
  WHEN hospital_name LIKE '%보건소'     THEN '보건소'
  WHEN hospital_name LIKE '%약국'       THEN '약국'
  WHEN hospital_name LIKE '%의원'       THEN '의원'
  WHEN hospital_name LIKE '%병원'       THEN '병원'
  ELSE NULL END
WHERE hospital_type IS NULL AND hospital_name IS NOT NULL;

-- ── 3) get_edi_summary: trend_prescriptions.hospital_type 직접 사용 ─────────
CREATE OR REPLACE FUNCTION get_edi_summary(
  p_company_id UUID,
  p_months TEXT[]
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
      tp.prescription_month,
      tp.hospital_name,
      tp.product_name,
      tp.prescription_amount,
      COALESCE(NULLIF(TRIM(COALESCE(tp.cso_name, '')), ''), '미지정') AS cso_label,
      -- 의원 분류: hospital_type 이 '…의원'(의원·치과의원·한의원 등)이면 clinic
      COALESCE(tp.hospital_type LIKE '%의원', FALSE) AS is_clinic
    FROM trend_prescriptions tp
    WHERE tp.company_id = p_company_id
      AND tp.prescription_month = ANY(p_months)
      AND tp.prescription_month IS NOT NULL
  )
  SELECT json_build_object(

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
