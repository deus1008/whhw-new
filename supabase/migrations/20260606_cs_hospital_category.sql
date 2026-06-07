-- commission_settlements 테이블에 hospital_category 컬럼 추가
-- X열: 기조실병의원구분 (의원/병원 등 대분류)
ALTER TABLE public.commission_settlements
  ADD COLUMN IF NOT EXISTS hospital_category text;
