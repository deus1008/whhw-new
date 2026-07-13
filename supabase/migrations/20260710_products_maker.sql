-- upcoming_products: 제조사(maker) 컬럼 추가 (+ 개발 히스토리 history 함께, 멱등)
-- manufacturer 컬럼은 '판매사' 용도로 사용 중이므로 제조사는 별도 컬럼 신설
-- Supabase SQL Editor에서 실행하세요
ALTER TABLE upcoming_products ADD COLUMN IF NOT EXISTS history text;
ALTER TABLE upcoming_products ADD COLUMN IF NOT EXISTS maker   text;
