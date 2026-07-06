-- ubist_data에 is_original 컬럼 추가 (Generic 컬럼 파싱 결과 저장)
ALTER TABLE ubist_data ADD COLUMN IF NOT EXISTS is_original boolean;
