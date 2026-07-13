-- upcoming_products: 개발 히스토리 첨부 이미지 목록 (storage 경로 배열)
-- Supabase SQL Editor에서 실행하세요
ALTER TABLE upcoming_products
  ADD COLUMN IF NOT EXISTS history_images jsonb NOT NULL DEFAULT '[]'::jsonb;
