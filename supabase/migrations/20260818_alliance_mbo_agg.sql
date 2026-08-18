-- 얼라이언스 MBO 집계 — 월별 롤업(매터리얼라이즈드 뷰) + 이를 읽는 RPC.
--   정산 원장(commission_settlements 58만행)을 매 검색마다 집계하면 느림(≈10s) →
--   월별 사전집계 뷰로 즉시 조회. 뷰는 정산 업로드/일일 cron 시 갱신.

-- 원장 스캔 가속 인덱스(뷰 갱신·기타 쿼리용).
CREATE INDEX IF NOT EXISTS idx_cs_mgr_month ON public.commission_settlements (manager, prescription_month);
CREATE INDEX IF NOT EXISTS idx_cs_company   ON public.commission_settlements (company_id);

-- ① 월 합계(담당자·위탁사·월) — 처방액·정산액(널 엔티티 포함, 총액 정확).
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_alliance_month AS
SELECT manager, company_id, prescription_month AS ym,
       COALESCE(SUM(prescription_amount), 0) AS presc,
       COALESCE(SUM(settlement_amount), 0)   AS settle
FROM public.commission_settlements
WHERE manager IS NOT NULL AND prescription_month IS NOT NULL
GROUP BY manager, company_id, prescription_month;
CREATE INDEX IF NOT EXISTS idx_mv_am_mgr_ym ON public.mv_alliance_month (manager, ym);

-- ② 엔티티별 월 합계(담당자·위탁사·월·종류·엔티티) — 처방처(h)/거래처(c) 처방액.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_alliance_entity_month AS
SELECT manager, company_id, prescription_month AS ym, 'h'::text AS kind,
       hospital_name AS entity, COALESCE(SUM(prescription_amount), 0) AS presc
FROM public.commission_settlements
WHERE manager IS NOT NULL AND prescription_month IS NOT NULL AND hospital_name IS NOT NULL
GROUP BY manager, company_id, prescription_month, hospital_name
UNION ALL
SELECT manager, company_id, prescription_month AS ym, 'c'::text AS kind,
       cso_name AS entity, COALESCE(SUM(prescription_amount), 0) AS presc
FROM public.commission_settlements
WHERE manager IS NOT NULL AND prescription_month IS NOT NULL AND cso_name IS NOT NULL
GROUP BY manager, company_id, prescription_month, cso_name;
CREATE INDEX IF NOT EXISTS idx_mv_aem_mgr_ym  ON public.mv_alliance_entity_month (manager, ym, kind);
CREATE INDEX IF NOT EXISTS idx_mv_aem_kind_ent ON public.mv_alliance_entity_month (kind, entity, ym);

-- 뷰는 RLS를 우회하므로 Data API 노출 차단 — 서버(service_role)만 접근.
REVOKE ALL ON public.mv_alliance_month, public.mv_alliance_entity_month FROM anon, authenticated;
GRANT SELECT ON public.mv_alliance_month, public.mv_alliance_entity_month TO service_role;

-- 갱신 함수(정산 업로드/ cron 에서 호출). service_role 이 소유자 권한으로 refresh 하도록 definer.
CREATE OR REPLACE FUNCTION public.refresh_alliance_rollup() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_alliance_month;
  REFRESH MATERIALIZED VIEW public.mv_alliance_entity_month;
END $$;
REVOKE ALL ON FUNCTION public.refresh_alliance_rollup() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_alliance_rollup() TO service_role;

-- 집계 RPC — 롤업 뷰를 읽어 12개월 원자료 반환(출력 스키마 불변).
CREATE OR REPLACE FUNCTION public.get_alliance_mbo_agg(
  p_managers text[],
  p_company  uuid,
  p_cur_yms  text[],
  p_prev_yms text[]
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH months AS (
    SELECT i, p_cur_yms[i] AS cur_ym, p_prev_yms[i] AS prev_ym
    FROM generate_subscripts(p_cur_yms, 1) AS i
  ),
  tot AS (
    SELECT ym, SUM(presc) AS presc, SUM(settle) AS settle
    FROM mv_alliance_month
    WHERE manager = ANY(p_managers)
      AND (p_company IS NULL OR company_id = p_company)
      AND ym = ANY(p_cur_yms || p_prev_yms)
    GROUP BY ym
  ),
  ent AS (
    SELECT ym, kind, entity, SUM(presc) AS presc
    FROM mv_alliance_entity_month
    WHERE manager = ANY(p_managers)
      AND (p_company IS NULL OR company_id = p_company)
      AND ym = ANY(p_cur_yms || p_prev_yms)
    GROUP BY ym, kind, entity
  ),
  cnt AS (
    SELECT ym,
           COUNT(*) FILTER (WHERE kind = 'h') AS hosp_cnt,
           COUNT(*) FILTER (WHERE kind = 'c') AS cso_cnt
    FROM ent GROUP BY ym
  ),
  ss AS (
    SELECT m.i, c.kind, SUM(c.presc) AS cur, SUM(p.presc) AS prev
    FROM months m
    JOIN ent c ON c.ym = m.cur_ym
    JOIN ent p ON p.ym = m.prev_ym AND p.kind = c.kind AND p.entity = c.entity
    GROUP BY m.i, c.kind
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'i', m.i, 'cur_ym', m.cur_ym, 'prev_ym', m.prev_ym,
    'presc',    COALESCE(ct.presc, 0),    'settle',    COALESCE(ct.settle, 0),
    'hosp_cnt', COALESCE(cc.hosp_cnt, 0), 'cso_cnt',   COALESCE(cc.cso_cnt, 0),
    'prev_presc',    COALESCE(pt.presc, 0),    'prev_settle',    COALESCE(pt.settle, 0),
    'prev_hosp_cnt', COALESCE(pc.hosp_cnt, 0), 'prev_cso_cnt',   COALESCE(pc.cso_cnt, 0),
    'ss_cso_cur',  COALESCE(ssc.cur, 0),  'ss_cso_prev',  COALESCE(ssc.prev, 0),
    'ss_hosp_cur', COALESCE(ssh.cur, 0),  'ss_hosp_prev', COALESCE(ssh.prev, 0)
  ) ORDER BY m.i), '[]'::jsonb)
  FROM months m
  LEFT JOIN tot ct  ON ct.ym = m.cur_ym
  LEFT JOIN tot pt  ON pt.ym = m.prev_ym
  LEFT JOIN cnt cc  ON cc.ym = m.cur_ym
  LEFT JOIN cnt pc  ON pc.ym = m.prev_ym
  LEFT JOIN ss  ssc ON ssc.i = m.i AND ssc.kind = 'c'
  LEFT JOIN ss  ssh ON ssh.i = m.i AND ssh.kind = 'h';
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 전체 스코프(6인 합산) 전용 사전집계 — 개인별 뷰에서 파생(담당자 차원 제거).
--   6인 이름 변경 시 아래 목록 + lib/mbo/alliance.ts ALLIANCE_REPS 동시 수정.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_alliance_all_month AS
SELECT company_id, ym, SUM(presc) AS presc, SUM(settle) AS settle
FROM public.mv_alliance_month
WHERE manager IN ('박동수','임경봉','김윤성','김양희','이정원','이훈섭')
GROUP BY company_id, ym;
CREATE INDEX IF NOT EXISTS idx_mv_aam_ym ON public.mv_alliance_all_month (ym);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_alliance_all_entity_month AS
SELECT company_id, ym, kind, entity, SUM(presc) AS presc
FROM public.mv_alliance_entity_month
WHERE manager IN ('박동수','임경봉','김윤성','김양희','이정원','이훈섭')
GROUP BY company_id, ym, kind, entity;
CREATE INDEX IF NOT EXISTS idx_mv_aaem_ym      ON public.mv_alliance_all_entity_month (ym, kind);
CREATE INDEX IF NOT EXISTS idx_mv_aaem_kind_ent ON public.mv_alliance_all_entity_month (kind, entity, ym);

REVOKE ALL ON public.mv_alliance_all_month, public.mv_alliance_all_entity_month FROM anon, authenticated;
GRANT SELECT ON public.mv_alliance_all_month, public.mv_alliance_all_entity_month TO service_role;

-- 갱신 함수 — 개인별 뷰 먼저, 그다음 파생 전체 뷰(의존순서).
CREATE OR REPLACE FUNCTION public.refresh_alliance_rollup() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_alliance_month;
  REFRESH MATERIALIZED VIEW public.mv_alliance_entity_month;
  REFRESH MATERIALIZED VIEW public.mv_alliance_all_month;
  REFRESH MATERIALIZED VIEW public.mv_alliance_all_entity_month;
END $$;

-- 전체 스코프 집계 RPC — 사전집계 뷰를 읽어 12개월 원자료 반환.
CREATE OR REPLACE FUNCTION public.get_alliance_mbo_agg_all(
  p_company  uuid,
  p_cur_yms  text[],
  p_prev_yms text[]
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH months AS (
    SELECT i, p_cur_yms[i] AS cur_ym, p_prev_yms[i] AS prev_ym
    FROM generate_subscripts(p_cur_yms, 1) AS i
  ),
  tot AS (
    SELECT ym, SUM(presc) AS presc, SUM(settle) AS settle
    FROM mv_alliance_all_month
    WHERE (p_company IS NULL OR company_id = p_company)
      AND ym = ANY(p_cur_yms || p_prev_yms)
    GROUP BY ym
  ),
  ent AS (
    SELECT ym, kind, entity, SUM(presc) AS presc
    FROM mv_alliance_all_entity_month
    WHERE (p_company IS NULL OR company_id = p_company)
      AND ym = ANY(p_cur_yms || p_prev_yms)
    GROUP BY ym, kind, entity
  ),
  cnt AS (
    SELECT ym,
           COUNT(*) FILTER (WHERE kind = 'h') AS hosp_cnt,
           COUNT(*) FILTER (WHERE kind = 'c') AS cso_cnt
    FROM ent GROUP BY ym
  ),
  ss AS (
    SELECT m.i, c.kind, SUM(c.presc) AS cur, SUM(p.presc) AS prev
    FROM months m
    JOIN ent c ON c.ym = m.cur_ym
    JOIN ent p ON p.ym = m.prev_ym AND p.kind = c.kind AND p.entity = c.entity
    GROUP BY m.i, c.kind
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'i', m.i, 'cur_ym', m.cur_ym, 'prev_ym', m.prev_ym,
    'presc',    COALESCE(ct.presc, 0),    'settle',    COALESCE(ct.settle, 0),
    'hosp_cnt', COALESCE(cc.hosp_cnt, 0), 'cso_cnt',   COALESCE(cc.cso_cnt, 0),
    'prev_presc',    COALESCE(pt.presc, 0),    'prev_settle',    COALESCE(pt.settle, 0),
    'prev_hosp_cnt', COALESCE(pc.hosp_cnt, 0), 'prev_cso_cnt',   COALESCE(pc.cso_cnt, 0),
    'ss_cso_cur',  COALESCE(ssc.cur, 0),  'ss_cso_prev',  COALESCE(ssc.prev, 0),
    'ss_hosp_cur', COALESCE(ssh.cur, 0),  'ss_hosp_prev', COALESCE(ssh.prev, 0)
  ) ORDER BY m.i), '[]'::jsonb)
  FROM months m
  LEFT JOIN tot ct  ON ct.ym = m.cur_ym
  LEFT JOIN tot pt  ON pt.ym = m.prev_ym
  LEFT JOIN cnt cc  ON cc.ym = m.cur_ym
  LEFT JOIN cnt pc  ON pc.ym = m.prev_ym
  LEFT JOIN ss  ssc ON ssc.i = m.i AND ssc.kind = 'c'
  LEFT JOIN ss  ssh ON ssh.i = m.i AND ssh.kind = 'h';
$$;
