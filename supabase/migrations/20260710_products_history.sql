-- upcoming_products 에 개발 히스토리 메모 컬럼 추가
-- (기존 memo 컬럼은 성분명 용도로 사용 중이므로 별도 컬럼 신설)
-- Supabase SQL Editor에서 실행하세요
ALTER TABLE upcoming_products ADD COLUMN IF NOT EXISTS history text;
