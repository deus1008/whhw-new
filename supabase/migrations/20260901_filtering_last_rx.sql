-- 최근월실적(최근 처방월·금액) 저장
ALTER TABLE public.hospital_filtering
  ADD COLUMN IF NOT EXISTS last_rx_month  date,
  ADD COLUMN IF NOT EXISTS last_rx_amount bigint;
