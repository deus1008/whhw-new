-- 최초처방월의 처방금액 저장(EDI 자동표기)
ALTER TABLE public.hospital_filtering ADD COLUMN IF NOT EXISTS first_rx_amount bigint;
