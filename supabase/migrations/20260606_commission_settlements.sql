-- 수수료정산 상세 데이터 테이블
CREATE TABLE IF NOT EXISTS public.commission_settlements (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file         text        NOT NULL,          -- 업로드 파일명
  settlement_month    text,                          -- 정산월 (YYYY-MM)
  manager             text,                          -- 내부담당자
  cso_name            text,                          -- 담당CSO
  hospital_name       text,                          -- 처방처명
  product_name        text,                          -- 품목명
  approved_qty        integer,                       -- 승인수량
  unit_price          numeric,                       -- T당 단가
  prescription_amount numeric,                       -- 처방금액
  hospital_type       text,                          -- 종별구분
  commission_rate     numeric,                       -- 합산수수료 (%)
  settlement_amount   numeric,                       -- 정산액
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_month    ON public.commission_settlements(settlement_month);
CREATE INDEX IF NOT EXISTS idx_cs_source   ON public.commission_settlements(source_file);
CREATE INDEX IF NOT EXISTS idx_cs_manager  ON public.commission_settlements(manager);
CREATE INDEX IF NOT EXISTS idx_cs_cso      ON public.commission_settlements(cso_name);

ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_select" ON public.commission_settlements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  );

CREATE POLICY "cs_service_all" ON public.commission_settlements
  FOR ALL USING (true) WITH CHECK (true);
