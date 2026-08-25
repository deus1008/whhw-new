-- UBIST 통합: 진료과 데이터를 ubist_data 단일 테이블로 일원화.
--   조합파일(한 행에 종별+진료과) 업로드 시 두 차원 모두 ubist_data에 적재 → 모든 페이지가 동일 소스 사용.
--   전환: 다처방성분 RPC를 ubist_data(specialty)로 전환, 임시 ubist_specialty 정리.

-- 1) 다처방성분 RPC를 통합 ubist_data 기반으로(진료과 있는 행만, 성분 정규화).
CREATE OR REPLACE FUNCTION public.get_rx_trend(
  p_period text, p_prev text, p_specialty text, p_limit int
) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT norm_ingredient(ingredient_name) AS ing, period, manufacturer, product_name,
           COALESCE(prescription_amount, 0) AS amt
    FROM public.ubist_data
    WHERE period IN (p_period, p_prev)
      AND specialty IS NOT NULL
      AND (p_specialty IS NULL OR specialty = p_specialty)
      AND ingredient_name IS NOT NULL AND ingredient_name <> ''
  ),
  cur  AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_period GROUP BY ing),
  prv  AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_prev   GROUP BY ing),
  aju  AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_period AND manufacturer = '아주약품' GROUP BY ing),
  ajut AS (SELECT DISTINCT ON (ing) ing, product_name FROM base WHERE period = p_period AND manufacturer = '아주약품' ORDER BY ing, amt DESC),
  refk AS (SELECT DISTINCT brand_key(item_name) bk FROM public.drug_reference WHERE item_name IS NOT NULL),
  refb AS (SELECT b.ing, b.product_name, b.amt FROM base b WHERE b.period = p_period AND brand_key(b.product_name) IN (SELECT bk FROM refk WHERE bk <> '')),
  ref  AS (SELECT ing, SUM(amt) tot FROM refb GROUP BY ing),
  reft AS (SELECT DISTINCT ON (ing) ing, product_name FROM refb ORDER BY ing, amt DESC),
  top  AS (SELECT ing, tot FROM cur ORDER BY tot DESC LIMIT p_limit)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ingredient', t.ing, 'cur', t.tot, 'prev', COALESCE(p.tot, 0),
    'aju', COALESCE(a.tot, 0), 'aju_product', at.product_name,
    'ref', COALESCE(r.tot, 0), 'ref_product', rt.product_name
  ) ORDER BY t.tot DESC), '[]'::jsonb)
  FROM top t
  LEFT JOIN prv p ON p.ing = t.ing
  LEFT JOIN aju a ON a.ing = t.ing
  LEFT JOIN ajut at ON at.ing = t.ing
  LEFT JOIN ref r ON r.ing = t.ing
  LEFT JOIN reft rt ON rt.ing = t.ing;
$$;
ALTER FUNCTION public.get_rx_trend(text, text, text, int) SET statement_timeout = '55s';

CREATE OR REPLACE FUNCTION public.get_rx_trend_meta() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'periods',     (SELECT COALESCE(jsonb_agg(DISTINCT period ORDER BY period DESC), '[]') FROM public.ubist_data WHERE specialty IS NOT NULL AND period IS NOT NULL),
    'specialties', (SELECT COALESCE(jsonb_agg(DISTINCT specialty ORDER BY specialty), '[]') FROM public.ubist_data WHERE specialty IS NOT NULL)
  );
$$;

-- 2) 전년동월 비교용으로 임시 진료과 데이터 중 2025-07만 통합 ubist_data로 이관(2026-07은 조합파일 재업로드로 대체).
INSERT INTO public.ubist_data (source_file, period, ingredient_name, product_name, manufacturer, specialty, prescription_amount, atc_code)
SELECT source_file, period, ingredient, product_name, manufacturer, specialty, prescription_amount, atc
FROM public.ubist_specialty WHERE period = '2025-07';

-- 3) 옛 '종별-only' 행 제거(2025-07·2026-07) — 진료과/조합 데이터로 대체되어 이중집계 방지.
--    (해당 2개월 종별 분석은 종별+진료과 조합파일 업로드 시 복원됨)
DELETE FROM public.ubist_data
WHERE specialty IS NULL AND period IN ('2025-07', '2026-07');

-- 4) 임시 테이블 폐기.
DROP TABLE IF EXISTS public.ubist_specialty;
