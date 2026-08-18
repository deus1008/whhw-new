-- 얼라이언스 MBO 집계 RPC — 정산 원장(commission_settlements)을 DB에서 월별로 집계.
--   기존 방식(수십만 행 클라이언트 페치)은 서버액션 타임아웃 유발 → DB 집계로 대체.
--   입력: 담당자 배열 / 위탁사(nullable) / 당기·전년 월 배열(인덱스 정렬, 12쌍).
--   출력: 12개월 각각의 원자료(당기·전년 합계 + 동일거래처·동일처방처 same-store 합).

-- 스캔 가속용 인덱스(58만 행) — 담당자·월, 위탁사.
CREATE INDEX IF NOT EXISTS idx_cs_mgr_month ON public.commission_settlements (manager, prescription_month);
CREATE INDEX IF NOT EXISTS idx_cs_company   ON public.commission_settlements (company_id);

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
  base AS (
    SELECT prescription_month AS ym,
           prescription_amount AS amt,
           settlement_amount   AS settle,
           hospital_name, cso_name
    FROM commission_settlements
    WHERE manager = ANY(p_managers)
      AND (p_company IS NULL OR company_id = p_company)
      AND prescription_month = ANY(p_cur_yms || p_prev_yms)
  ),
  agg AS (
    SELECT ym,
           COALESCE(SUM(amt), 0)         AS presc,
           COALESCE(SUM(settle), 0)      AS settle,
           COUNT(DISTINCT hospital_name) AS hosp_cnt,
           COUNT(DISTINCT cso_name)      AS cso_cnt
    FROM base GROUP BY ym
  ),
  cso_m  AS (SELECT ym, cso_name,      SUM(amt) AS amt FROM base WHERE cso_name      IS NOT NULL GROUP BY ym, cso_name),
  hosp_m AS (SELECT ym, hospital_name, SUM(amt) AS amt FROM base WHERE hospital_name IS NOT NULL GROUP BY ym, hospital_name),
  -- 동일거래처(전·당기 공통 CSO) 합 — 집합 조인 1회(상관 서브쿼리 제거).
  ss_cso AS (
    SELECT m.i, SUM(c.amt) AS cur, SUM(p.amt) AS prev
    FROM months m
    JOIN cso_m c ON c.ym = m.cur_ym
    JOIN cso_m p ON p.ym = m.prev_ym AND p.cso_name = c.cso_name
    GROUP BY m.i
  ),
  ss_hosp AS (
    SELECT m.i, SUM(c.amt) AS cur, SUM(p.amt) AS prev
    FROM months m
    JOIN hosp_m c ON c.ym = m.cur_ym
    JOIN hosp_m p ON p.ym = m.prev_ym AND p.hospital_name = c.hospital_name
    GROUP BY m.i
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'i', m.i, 'cur_ym', m.cur_ym, 'prev_ym', m.prev_ym,
    'presc',    COALESCE(ca.presc, 0),    'settle',    COALESCE(ca.settle, 0),
    'hosp_cnt', COALESCE(ca.hosp_cnt, 0), 'cso_cnt',   COALESCE(ca.cso_cnt, 0),
    'prev_presc',    COALESCE(pa.presc, 0),    'prev_settle',    COALESCE(pa.settle, 0),
    'prev_hosp_cnt', COALESCE(pa.hosp_cnt, 0), 'prev_cso_cnt',   COALESCE(pa.cso_cnt, 0),
    'ss_cso_cur',  COALESCE(sc.cur, 0),  'ss_cso_prev',  COALESCE(sc.prev, 0),
    'ss_hosp_cur', COALESCE(sh.cur, 0),  'ss_hosp_prev', COALESCE(sh.prev, 0)
  ) ORDER BY m.i), '[]'::jsonb)
  FROM months m
  LEFT JOIN agg ca     ON ca.ym = m.cur_ym
  LEFT JOIN agg pa     ON pa.ym = m.prev_ym
  LEFT JOIN ss_cso sc  ON sc.i = m.i
  LEFT JOIN ss_hosp sh ON sh.i = m.i;
$$;

-- 함수 실행 중 statement_timeout 상향(58만 행 집계 대비).
ALTER FUNCTION public.get_alliance_mbo_agg(text[], uuid, text[], text[]) SET statement_timeout = '55s';
