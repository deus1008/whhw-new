-- 제품 마스터: 생동(생물학적동등성)여부 + DMF원료 사용여부
--   nullable — null=미확인, true=예, false=아니오 (자동매칭은 true만 설정, 나머지는 미확인 유지)
-- Supabase SQL Editor에서 실행하세요
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bioequiv boolean;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_dmf     boolean;
