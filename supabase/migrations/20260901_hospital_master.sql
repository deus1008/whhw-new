-- 병의원 마스터(심평원 의료기관) — 필터링 처방처 자동완성용
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.hospital_master (
  hospital_code  text PRIMARY KEY,          -- 처방처코드
  hospital_name  text NOT NULL,             -- 처방처명
  business_no    text,                      -- 사업자번호
  sido           text,                      -- 시도
  gugun          text,                      -- 구군
  eupmyeondong   text,                      -- 읍면동
  address        text,                      -- 주소
  hospital_type  text,                      -- 종별
  open_date      date,                      -- 개설일자
  doctor_count   int,                       -- 의사 수
  closed_status  text,                      -- 폐업상태
  closed_month   text,                      -- 폐업월
  beds_upper     int, beds_general int,     -- 일반입원실(상급/일반)
  icu_adult      int, icu_child int, icu_newborn int,  -- 중환자실(성인/소아/신생아)
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hm_name_trgm ON public.hospital_master USING gin (hospital_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hm_type      ON public.hospital_master (hospital_type);

ALTER TABLE public.hospital_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY hm_select ON public.hospital_master FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
);
