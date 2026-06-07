-- 신규거래처계약 테이블
CREATE TABLE IF NOT EXISTS public.new_contracts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  manager          text        NOT NULL,           -- 담당자
  company_name     text        NOT NULL,           -- 업체명
  contract_start   date        NOT NULL,           -- 계약시작일
  contract_end     date,                           -- 계약종료일
  auto_renewal     boolean     NOT NULL DEFAULT true, -- 자동갱신 여부
  evidence         text,                           -- 증빙자료
  details          text,                           -- 세부내역
  expected_month   text,                           -- 처방 예상월
  expected_amount  text,                           -- 처방 예상액
  hospitals        text,                           -- 주요 병원 및 품목
  contact_name     text,                           -- 연락처 담당자명
  contact_phone    text,                           -- 연락처 전화번호
  contact_email    text,                           -- 연락처 이메일
  memo             text,                           -- 비고
  user_id          uuid        REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nc_company   ON public.new_contracts(company_name);
CREATE INDEX IF NOT EXISTS idx_nc_manager   ON public.new_contracts(manager);
CREATE INDEX IF NOT EXISTS idx_nc_start     ON public.new_contracts(contract_start);
CREATE INDEX IF NOT EXISTS idx_nc_user      ON public.new_contracts(user_id);

ALTER TABLE public.new_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nc_select" ON public.new_contracts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  );

CREATE POLICY "nc_insert" ON public.new_contracts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "nc_update" ON public.new_contracts
  FOR UPDATE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = '관리자')
  );

CREATE POLICY "nc_delete" ON public.new_contracts
  FOR DELETE USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = '관리자')
  );
