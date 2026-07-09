-- ============================================================
-- hospital_clinic_map: 병의원 분류 마스터 테이블
-- commission_settlements 기반으로 초기 구축 후 INSERT 시 자동 갱신
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- 1) 테이블 생성
CREATE TABLE IF NOT EXISTS hospital_clinic_map (
  company_id    uuid        NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
  hospital_name text        NOT NULL,
  is_clinic     boolean     NOT NULL DEFAULT FALSE,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, hospital_name)
);

CREATE INDEX IF NOT EXISTS idx_hcm_company ON hospital_clinic_map(company_id);

ALTER TABLE hospital_clinic_map ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_clinic_map' AND policyname='hcm_select') THEN
    CREATE POLICY "hcm_select" ON hospital_clinic_map
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='hospital_clinic_map' AND policyname='hcm_service_all') THEN
    CREATE POLICY "hcm_service_all" ON hospital_clinic_map
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 2) 트리거 함수: commission_settlements INSERT 후 영향받은 company_id만 갱신
CREATE OR REPLACE FUNCTION refresh_hospital_clinic_map()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- new_rows (transition table): 방금 INSERT된 행들
  -- 해당 company_id 전체를 commission_settlements에서 재집계해서 upsert
  INSERT INTO hospital_clinic_map (company_id, hospital_name, is_clinic, updated_at)
  SELECT
    cs.company_id,
    cs.hospital_name,
    BOOL_OR(
      COALESCE(cs.hospital_category, cs.hospital_type, '') = '의원'
      OR COALESCE(cs.hospital_category, cs.hospital_type, '') LIKE '%의원'
    ) AS is_clinic,
    now()
  FROM commission_settlements cs
  WHERE cs.company_id IN (
    SELECT DISTINCT company_id FROM new_rows WHERE company_id IS NOT NULL
  )
    AND cs.hospital_name IS NOT NULL
  GROUP BY cs.company_id, cs.hospital_name
  ON CONFLICT (company_id, hospital_name)
    DO UPDATE SET
      is_clinic  = EXCLUDED.is_clinic,
      updated_at = EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;


-- 3) 트리거 등록 (statement-level: 대량 INSERT도 1회 실행)
DROP TRIGGER IF EXISTS trg_refresh_hospital_clinic_map ON commission_settlements;
CREATE TRIGGER trg_refresh_hospital_clinic_map
  AFTER INSERT ON commission_settlements
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_hospital_clinic_map();


-- 4) 기존 commission_settlements 데이터로 초기 구축
INSERT INTO hospital_clinic_map (company_id, hospital_name, is_clinic, updated_at)
SELECT
  company_id,
  hospital_name,
  BOOL_OR(
    COALESCE(hospital_category, hospital_type, '') = '의원'
    OR COALESCE(hospital_category, hospital_type, '') LIKE '%의원'
  ) AS is_clinic,
  now()
FROM commission_settlements
WHERE company_id IS NOT NULL
  AND hospital_name IS NOT NULL
GROUP BY company_id, hospital_name
ON CONFLICT (company_id, hospital_name)
  DO UPDATE SET
    is_clinic  = EXCLUDED.is_clinic,
    updated_at = EXCLUDED.updated_at;


-- 5) get_edi_summary: hosp_class CTE 대신 hospital_clinic_map 직접 조인
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
      COALESCE(hcm.is_clinic, FALSE) AS is_clinic
    FROM trend_prescriptions tp
    LEFT JOIN hospital_clinic_map hcm
      ON hcm.company_id = p_company_id
     AND hcm.hospital_name = tp.hospital_name
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

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_trend_presc_company_month
  ON trend_prescriptions(company_id, prescription_month);
