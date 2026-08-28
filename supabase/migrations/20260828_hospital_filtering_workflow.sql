-- 필터링 관리장 워크플로우: 지역장 입력(대기) → 위탁사 답변(답변완료) → 지역장 확인(확인).
ALTER TABLE public.hospital_filtering
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'pending',  -- pending|answered|confirmed
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS answered_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- 기존 데이터: 답변이 있으면 확인완료, 없으면 대기
UPDATE public.hospital_filtering
  SET status = 'confirmed'
  WHERE COALESCE(TRIM(answer), '') <> '';

CREATE INDEX IF NOT EXISTS idx_hf_status  ON public.hospital_filtering(status);
CREATE INDEX IF NOT EXISTS idx_hf_manager ON public.hospital_filtering(manager);
