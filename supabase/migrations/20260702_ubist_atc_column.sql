-- ubist_data 에 ATC 코드 컬럼 추가 (Ubist D1 포맷 파서 업데이트 대응)
ALTER TABLE ubist_data ADD COLUMN IF NOT EXISTS atc_code text;
CREATE INDEX IF NOT EXISTS idx_ubist_atc ON ubist_data (atc_code);
