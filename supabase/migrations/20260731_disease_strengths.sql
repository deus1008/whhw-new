-- 질환학습 4단계 함량 사전계산(materialize): 성분별 함량 목록을 저장해
-- 조회 없이도 트리 드릴다운에 함량이 바로 표시되도록 한다. 주간 cron 으로 갱신.
CREATE TABLE IF NOT EXISTS public.disease_drug_strengths (
  disease_group   text NOT NULL,
  sub_category    text NOT NULL,
  ingredient_name text NOT NULL,
  strengths       jsonb NOT NULL DEFAULT '[]',   -- 정렬된 함량 문자열 배열 (예: ["1.25mg","2.5mg","5mg"])
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (disease_group, sub_category, ingredient_name)
);
ALTER TABLE public.disease_drug_strengths ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON public.disease_drug_strengths;
CREATE POLICY "service_all" ON public.disease_drug_strengths FOR ALL USING (true);
