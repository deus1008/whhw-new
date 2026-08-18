-- 얼라이언스 MBO 자동화 — 지표별 평균 성장율 저장.
--   목표[월] = 전년 동월 실적 × (1 + growth_pct/100). 실적은 조회 시 DB에서 실시간 산출.
CREATE TABLE IF NOT EXISTS public.mbo_alliance_growth (
  member_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fy_year    int  NOT NULL,
  indicator  text NOT NULL,   -- prescription|settlement|new_contract|hospital_cnt|cso_cnt
  growth_pct numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, fy_year, indicator)
);
ALTER TABLE public.mbo_alliance_growth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mag_service_all" ON public.mbo_alliance_growth;
CREATE POLICY "mag_service_all" ON public.mbo_alliance_growth FOR ALL USING (true) WITH CHECK (true);
