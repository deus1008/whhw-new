-- 질환과(진료과)별 다처방 성분 리스트 — ubist_data 기반 집계 RPC.
--   전년동월 vs 당월 처방액·증감율, 아주약품 자사(처방액·M/S·대표품목), 대조약(처방액·M/S·품목).

-- 진료과(UBIST 진료과 데이터 업로드용) 컬럼 + 집계 인덱스.
ALTER TABLE public.ubist_data ADD COLUMN IF NOT EXISTS specialty text;
CREATE INDEX IF NOT EXISTS idx_ubist_period      ON public.ubist_data (period);
CREATE INDEX IF NOT EXISTS idx_ubist_period_mfr  ON public.ubist_data (period, manufacturer);

-- 성분명 정규화: [코드] 제거 + 첫 숫자(용량)부터 제거 + 소문자.
CREATE OR REPLACE FUNCTION public.norm_ingredient(s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(lower(regexp_replace(regexp_replace(coalesce(s,''), '\[[^\]]*\]', '', 'g'), '\s*[0-9].*$', '')));
$$;

-- 제품 브랜드키: '(' 앞부분에서 첫 숫자부터 제거 + 공백 제거(대조약 매칭용).
CREATE OR REPLACE FUNCTION public.brand_key(s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(split_part(coalesce(s,''), '(', 1), '[0-9].*$', ''), '\s', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.get_rx_trend(
  p_period    text,
  p_prev      text,
  p_hospital  text,     -- 종별(null=전체)
  p_specialty text,     -- 진료과(null=전체)
  p_company   uuid,
  p_limit     int
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT norm_ingredient(ingredient_name) AS ing,
           period, manufacturer, product_name,
           COALESCE(prescription_amount, 0) AS amt
    FROM public.ubist_data
    WHERE period IN (p_period, p_prev)
      AND (p_hospital  IS NULL OR hospital_type = p_hospital)
      AND (p_specialty IS NULL OR specialty     = p_specialty)
      AND (p_company   IS NULL OR company_id     = p_company)
      AND ingredient_name IS NOT NULL
  ),
  cur  AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_period GROUP BY ing),
  prv  AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_prev   GROUP BY ing),
  aju  AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_period AND manufacturer = '아주약품' GROUP BY ing),
  ajut AS (SELECT DISTINCT ON (ing) ing, product_name FROM base
           WHERE period = p_period AND manufacturer = '아주약품' ORDER BY ing, amt DESC),
  refk AS (SELECT DISTINCT brand_key(item_name) bk FROM public.drug_reference WHERE item_name IS NOT NULL),
  refb AS (SELECT b.ing, b.product_name, b.amt FROM base b
           WHERE b.period = p_period AND brand_key(b.product_name) IN (SELECT bk FROM refk WHERE bk <> '')),
  ref  AS (SELECT ing, SUM(amt) tot FROM refb GROUP BY ing),
  reft AS (SELECT DISTINCT ON (ing) ing, product_name FROM refb ORDER BY ing, amt DESC),
  top  AS (SELECT ing, tot FROM cur ORDER BY tot DESC LIMIT p_limit)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ingredient',   t.ing,
    'cur',          t.tot,
    'prev',         COALESCE(p.tot, 0),
    'aju',          COALESCE(a.tot, 0),
    'aju_product',  at.product_name,
    'ref',          COALESCE(r.tot, 0),
    'ref_product',  rt.product_name
  ) ORDER BY t.tot DESC), '[]'::jsonb)
  FROM top t
  LEFT JOIN prv  p  ON p.ing  = t.ing
  LEFT JOIN aju  a  ON a.ing  = t.ing
  LEFT JOIN ajut at ON at.ing = t.ing
  LEFT JOIN ref  r  ON r.ing  = t.ing
  LEFT JOIN reft rt ON rt.ing = t.ing;
$$;
ALTER FUNCTION public.get_rx_trend(text, text, text, text, uuid, int) SET statement_timeout = '55s';

-- 사용 가능한 월·종별·진료과 목록(필터 UI용).
CREATE OR REPLACE FUNCTION public.get_rx_trend_meta(p_company uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'periods',    (SELECT COALESCE(jsonb_agg(DISTINCT period ORDER BY period DESC), '[]') FROM public.ubist_data WHERE period IS NOT NULL AND (p_company IS NULL OR company_id = p_company)),
    'hospitals',  (SELECT COALESCE(jsonb_agg(DISTINCT hospital_type), '[]') FROM public.ubist_data WHERE hospital_type IS NOT NULL AND (p_company IS NULL OR company_id = p_company)),
    'specialties',(SELECT COALESCE(jsonb_agg(DISTINCT specialty ORDER BY specialty), '[]') FROM public.ubist_data WHERE specialty IS NOT NULL AND (p_company IS NULL OR company_id = p_company))
  );
$$;
