-- hospital_clinic_map 갱신 트리거를 "증분"으로 수정 (대량 누적 시 INSERT 타임아웃 방지).
--   기존: INSERT 마다 해당 회사의 commission_settlements 전체를 재집계(GROUP BY) → 테이블이
--        커지면서 소량 INSERT도 statement timeout(57014) → 정산 파일 적재 실패(processing 멈춤).
--   변경: 방금 INSERT된 행(new_rows transition table)만 집계 → 전체 재스캔 회피. is_clinic 은
--        병원명 단위로 일관되므로 신규 배치 값으로 upsert 해도 정확.
CREATE OR REPLACE FUNCTION refresh_hospital_clinic_map()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO hospital_clinic_map (company_id, hospital_name, is_clinic, updated_at)
  SELECT
    company_id,
    hospital_name,
    BOOL_OR(
      COALESCE(hospital_category, hospital_type, '') = '의원'
      OR COALESCE(hospital_category, hospital_type, '') LIKE '%의원'
    ) AS is_clinic,
    now()
  FROM new_rows
  WHERE company_id IS NOT NULL
    AND hospital_name IS NOT NULL
  GROUP BY company_id, hospital_name
  ON CONFLICT (company_id, hospital_name)
    DO UPDATE SET
      is_clinic  = EXCLUDED.is_clinic,
      updated_at = EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;
