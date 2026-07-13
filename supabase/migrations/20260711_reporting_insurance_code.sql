-- ============================================================
-- 실적 테이블에 보험코드(9자리) 컬럼 추가 (Phase 2)
--   원본 파일의 코드 컬럼을 파서가 캡처해 저장 → 제품 마스터(products)와
--   보험코드로 연결·집계 가능. 이름 매칭(5~6%) 대신 원본 코드 사용.
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

ALTER TABLE trend_prescriptions    ADD COLUMN IF NOT EXISTS insurance_code text;
ALTER TABLE commission_settlements ADD COLUMN IF NOT EXISTS insurance_code text;
ALTER TABLE ubist_data             ADD COLUMN IF NOT EXISTS insurance_code text;

CREATE INDEX IF NOT EXISTS idx_trend_presc_inscode ON trend_prescriptions(insurance_code);
CREATE INDEX IF NOT EXISTS idx_commsett_inscode    ON commission_settlements(insurance_code);
CREATE INDEX IF NOT EXISTS idx_ubist_inscode       ON ubist_data(insurance_code);
