-- 종합병원 필터링 관리장: CSO/딜러가 처방처×품목 영업기회를 문의하고 지역장이 영업가능여부(답변)를 관리.
CREATE TABLE IF NOT EXISTS public.hospital_filtering (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  seq            int,                       -- 순번(원본)
  received_date  date,                      -- 접수일자
  ym             text,                      -- 년월
  manager        text,                      -- 담당자(CSO/딜러측)
  company_name   text,                      -- 업체명(CSO법인)
  dealer_name    text,                      -- 딜러명
  dealer_phone   text,                      -- 딜러연락처
  hospital_code  text,                      -- 처방처코드
  hospital_type  text,                      -- 종별
  hospital_name  text,                      -- 처방처명
  product_name   text,                      -- 품목명
  department     text,                      -- 처방과
  kol            text,                      -- KOL
  dc_timing      text,                      -- DC접수시기
  coding_month   text,                      -- 코딩가능월
  edi_received   text,                      -- EDI수령여부
  mbo            bigint,                     -- MBO
  answer         text,                      -- 답변(영업가능여부: O·X·준비중 등)
  final_result   text,                      -- 최종결과(처방시작월/처방없음 등)
  memo           text,                      -- 비고
  user_id        uuid        REFERENCES public.profiles(id),
  company_id     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hf_company   ON public.hospital_filtering(company_id);
CREATE INDEX IF NOT EXISTS idx_hf_ym        ON public.hospital_filtering(ym);
CREATE INDEX IF NOT EXISTS idx_hf_hospital  ON public.hospital_filtering(hospital_name);
CREATE INDEX IF NOT EXISTS idx_hf_product   ON public.hospital_filtering(product_name);
CREATE INDEX IF NOT EXISTS idx_hf_received  ON public.hospital_filtering(received_date);
CREATE INDEX IF NOT EXISTS idx_hf_user      ON public.hospital_filtering(user_id);

ALTER TABLE public.hospital_filtering ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hf_select" ON public.hospital_filtering
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  );

CREATE POLICY "hf_insert" ON public.hospital_filtering
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "hf_update" ON public.hospital_filtering
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = '관리자')
  );

CREATE POLICY "hf_delete" ON public.hospital_filtering
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = '관리자')
  );
