-- 얼라이언스 MBO 처방 지표 소스를 EDI(trend_prescriptions)로 전환.
--   기존: 처방액·처방처·CSO 를 commission_settlements(정산, 2025-05 처방분부터)에서 산출 →
--         2025-03/04 처방 기저가 없어 4월·미도래월 목표가 0.
--   변경: 처방(액/처방처/CSO/성장율)은 trend_prescriptions(EDI, 2025-03~)에서,
--         수수료 정산액만 commission_settlements 유지. 뷰 스키마 불변 → RPC·앱 코드 무변경.
--   trend_prescriptions.prescription_month 는 'YYYYMM' → 'YYYY-MM' 정규화. 담당자=sales_rep.

-- 기존 롤업 체인 제거(파생 뷰까지 CASCADE).
DROP MATERIALIZED VIEW IF EXISTS public.mv_alliance_month CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_alliance_entity_month CASCADE;

-- ① 월 합계 — 처방액=EDI, 정산액=정산원장(월·담당자·위탁사 FULL OUTER JOIN).
CREATE MATERIALIZED VIEW public.mv_alliance_month AS
WITH p AS (
  SELECT sales_rep AS manager, company_id,
         substr(prescription_month,1,4) || '-' || substr(prescription_month,5,2) AS ym,
         SUM(prescription_amount) AS presc
  FROM public.trend_prescriptions
  WHERE sales_rep IS NOT NULL AND prescription_month IS NOT NULL AND length(prescription_month) = 6
  GROUP BY 1, 2, 3
),
s AS (
  SELECT manager, company_id, prescription_month AS ym, SUM(settlement_amount) AS settle
  FROM public.commission_settlements
  WHERE manager IS NOT NULL AND prescription_month IS NOT NULL
  GROUP BY 1, 2, 3
)
SELECT COALESCE(p.manager, s.manager)         AS manager,
       COALESCE(p.company_id, s.company_id)   AS company_id,
       COALESCE(p.ym, s.ym)                   AS ym,
       COALESCE(p.presc, 0)                   AS presc,
       COALESCE(s.settle, 0)                  AS settle
FROM p FULL OUTER JOIN s
  ON s.manager = p.manager AND s.company_id IS NOT DISTINCT FROM p.company_id AND s.ym = p.ym;
CREATE INDEX idx_mv_am_mgr_ym ON public.mv_alliance_month (manager, ym);

-- ② 엔티티별 월 합계 — 처방처(h)/거래처(c) 처방액, EDI 기반.
CREATE MATERIALIZED VIEW public.mv_alliance_entity_month AS
SELECT sales_rep AS manager, company_id,
       substr(prescription_month,1,4) || '-' || substr(prescription_month,5,2) AS ym,
       'h'::text AS kind, hospital_name AS entity, SUM(prescription_amount) AS presc
FROM public.trend_prescriptions
WHERE sales_rep IS NOT NULL AND prescription_month IS NOT NULL AND length(prescription_month) = 6 AND hospital_name IS NOT NULL
GROUP BY 1, 2, 3, 5
UNION ALL
SELECT sales_rep AS manager, company_id,
       substr(prescription_month,1,4) || '-' || substr(prescription_month,5,2) AS ym,
       'c'::text AS kind, cso_name AS entity, SUM(prescription_amount) AS presc
FROM public.trend_prescriptions
WHERE sales_rep IS NOT NULL AND prescription_month IS NOT NULL AND length(prescription_month) = 6 AND cso_name IS NOT NULL
GROUP BY 1, 2, 3, 5;
CREATE INDEX idx_mv_aem_mgr_ym   ON public.mv_alliance_entity_month (manager, ym, kind);
CREATE INDEX idx_mv_aem_kind_ent ON public.mv_alliance_entity_month (kind, entity, ym);

REVOKE ALL ON public.mv_alliance_month, public.mv_alliance_entity_month FROM anon, authenticated;
GRANT SELECT ON public.mv_alliance_month, public.mv_alliance_entity_month TO service_role;

-- ③ 전체 스코프(6인 합산) 파생 뷰 재생성(정의 불변).
CREATE MATERIALIZED VIEW public.mv_alliance_all_month AS
SELECT company_id, ym, SUM(presc) AS presc, SUM(settle) AS settle
FROM public.mv_alliance_month
WHERE manager IN ('박동수','임경봉','김윤성','김양희','이정원','이훈섭')
GROUP BY company_id, ym;
CREATE INDEX idx_mv_aam_ym ON public.mv_alliance_all_month (ym);

CREATE MATERIALIZED VIEW public.mv_alliance_all_entity_month AS
SELECT company_id, ym, kind, entity, SUM(presc) AS presc
FROM public.mv_alliance_entity_month
WHERE manager IN ('박동수','임경봉','김윤성','김양희','이정원','이훈섭')
GROUP BY company_id, ym, kind, entity;
CREATE INDEX idx_mv_aaem_ym      ON public.mv_alliance_all_entity_month (ym, kind);
CREATE INDEX idx_mv_aaem_kind_ent ON public.mv_alliance_all_entity_month (kind, entity, ym);

REVOKE ALL ON public.mv_alliance_all_month, public.mv_alliance_all_entity_month FROM anon, authenticated;
GRANT SELECT ON public.mv_alliance_all_month, public.mv_alliance_all_entity_month TO service_role;

-- ④ 전체 스코프 월별 KPI 축약 뷰 재생성(정의 불변).
CREATE MATERIALIZED VIEW public.mv_alliance_all_kpi AS
WITH mon AS (
  SELECT company_id, ym, presc, settle FROM public.mv_alliance_all_month
),
cnts AS (
  SELECT company_id, ym,
         COUNT(*) FILTER (WHERE kind = 'h') AS hosp_cnt,
         COUNT(*) FILTER (WHERE kind = 'c') AS cso_cnt
  FROM public.mv_alliance_all_entity_month
  GROUP BY company_id, ym
),
pairs AS (
  SELECT company_id, ym AS cur_ym,
         to_char(to_date(ym || '-01', 'YYYY-MM-DD') - interval '1 year', 'YYYY-MM') AS prev_ym
  FROM mon
),
ss AS (
  SELECT pr.company_id, pr.cur_ym,
         SUM(c.presc) FILTER (WHERE c.kind = 'c') AS ss_cso_cur,
         SUM(p.presc) FILTER (WHERE c.kind = 'c') AS ss_cso_prev,
         SUM(c.presc) FILTER (WHERE c.kind = 'h') AS ss_hosp_cur,
         SUM(p.presc) FILTER (WHERE c.kind = 'h') AS ss_hosp_prev
  FROM pairs pr
  JOIN public.mv_alliance_all_entity_month c
    ON c.company_id = pr.company_id AND c.ym = pr.cur_ym
  JOIN public.mv_alliance_all_entity_month p
    ON p.company_id = pr.company_id AND p.ym = pr.prev_ym AND p.kind = c.kind AND p.entity = c.entity
  GROUP BY pr.company_id, pr.cur_ym
)
SELECT
  pr.company_id, pr.cur_ym AS ym, pr.prev_ym,
  COALESCE(cm.presc, 0)   AS presc,   COALESCE(cm.settle, 0)   AS settle,
  COALESCE(cc.hosp_cnt,0) AS hosp_cnt, COALESCE(cc.cso_cnt, 0) AS cso_cnt,
  COALESCE(pm.presc, 0)   AS prev_presc, COALESCE(pm.settle, 0) AS prev_settle,
  COALESCE(pc.hosp_cnt,0) AS prev_hosp_cnt, COALESCE(pc.cso_cnt,0) AS prev_cso_cnt,
  COALESCE(ss.ss_cso_cur, 0)  AS ss_cso_cur,  COALESCE(ss.ss_cso_prev, 0)  AS ss_cso_prev,
  COALESCE(ss.ss_hosp_cur, 0) AS ss_hosp_cur, COALESCE(ss.ss_hosp_prev, 0) AS ss_hosp_prev
FROM pairs pr
LEFT JOIN mon  cm ON cm.company_id = pr.company_id AND cm.ym = pr.cur_ym
LEFT JOIN mon  pm ON pm.company_id = pr.company_id AND pm.ym = pr.prev_ym
LEFT JOIN cnts cc ON cc.company_id = pr.company_id AND cc.ym = pr.cur_ym
LEFT JOIN cnts pc ON pc.company_id = pr.company_id AND pc.ym = pr.prev_ym
LEFT JOIN ss       ON ss.company_id = pr.company_id AND ss.cur_ym = pr.cur_ym;
CREATE INDEX idx_mv_aak_ym ON public.mv_alliance_all_kpi (ym);

REVOKE ALL ON public.mv_alliance_all_kpi FROM anon, authenticated;
GRANT SELECT ON public.mv_alliance_all_kpi TO service_role;
