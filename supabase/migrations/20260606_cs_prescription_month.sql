-- commission_settlements 테이블에 prescription_month 컬럼 추가
-- 파일명에서 추출한 처방월 (YYYY-MM)
ALTER TABLE public.commission_settlements
  ADD COLUMN IF NOT EXISTS prescription_month text;
