-- 필터링 #2 실적 자동표기 + #3 통보/변경 이력 로그
ALTER TABLE public.hospital_filtering
  ADD COLUMN IF NOT EXISTS item_insurance_code text,                       -- 품목 보험코드(9) · EDI 매칭 키
  ADD COLUMN IF NOT EXISTS result_auto        boolean NOT NULL DEFAULT false,  -- 최종결과 자동표기 여부
  ADD COLUMN IF NOT EXISTS notify_target      text,                        -- 통보대상(자유입력)
  ADD COLUMN IF NOT EXISTS notify_reason      text;                        -- 사유

CREATE INDEX IF NOT EXISTS idx_hf_inscode ON public.hospital_filtering(item_insurance_code);
CREATE INDEX IF NOT EXISTS idx_tp_ins_hos ON public.trend_prescriptions(insurance_code, hospital_name);

CREATE TABLE IF NOT EXISTS public.filtering_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filtering_id    uuid REFERENCES public.hospital_filtering(id) ON DELETE CASCADE,
  hospital_name   text,
  product_name    text,
  action          text,          -- '답변변경' 등
  from_answer     text,
  to_answer       text,
  reason          text,
  notify_target   text,
  changed_by      uuid,
  changed_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fl_filtering ON public.filtering_log(filtering_id);
ALTER TABLE public.filtering_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY fl_select ON public.filtering_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
);
