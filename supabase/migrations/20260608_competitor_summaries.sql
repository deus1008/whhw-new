-- 경쟁사 동향 요약 테이블
CREATE TABLE IF NOT EXISTS public.competitor_summaries (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,          -- 예: '대웅바이오'
  period       text,                   -- 예: '2026-05 4주차'
  summary      text NOT NULL,          -- 대시보드 표시용 요약
  source_doc_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.competitor_summaries DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cs_company ON public.competitor_summaries(company_name);
CREATE INDEX IF NOT EXISTS idx_cs_updated ON public.competitor_summaries(updated_at DESC);
