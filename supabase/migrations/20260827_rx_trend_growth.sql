-- 다처방성분: 아주약품·대조약의 전년동월 처방액(aju_prev, ref_prev)도 반환 → 성장율 컬럼용.
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
  cur   AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_period GROUP BY ing),
  prv   AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_prev   GROUP BY ing),
  aju   AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_period AND manufacturer = '아주약품' GROUP BY ing),
  ajup  AS (SELECT ing, SUM(amt) tot FROM base WHERE period = p_prev   AND manufacturer = '아주약품' GROUP BY ing),
  ajut  AS (SELECT DISTINCT ON (ing) ing, product_name FROM base WHERE period = p_period AND manufacturer = '아주약품' ORDER BY ing, amt DESC),
  refk  AS (SELECT DISTINCT brand_key(item_name) bk FROM public.drug_reference WHERE item_name IS NOT NULL),
  refb  AS (SELECT b.ing, b.product_name, b.amt FROM base b WHERE b.period = p_period AND brand_key(b.product_name) IN (SELECT bk FROM refk WHERE bk <> '')),
  refbp AS (SELECT b.ing, b.amt FROM base b WHERE b.period = p_prev AND brand_key(b.product_name) IN (SELECT bk FROM refk WHERE bk <> '')),
  ref   AS (SELECT ing, SUM(amt) tot FROM refb  GROUP BY ing),
  refp  AS (SELECT ing, SUM(amt) tot FROM refbp GROUP BY ing),
  reft  AS (SELECT DISTINCT ON (ing) ing, product_name FROM refb ORDER BY ing, amt DESC),
  top   AS (SELECT ing, tot FROM cur ORDER BY tot DESC LIMIT p_limit)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ingredient', t.ing, 'cur', t.tot, 'prev', COALESCE(p.tot, 0),
    'aju', COALESCE(a.tot, 0), 'aju_prev', COALESCE(ap.tot, 0), 'aju_product', at.product_name,
    'ref', COALESCE(r.tot, 0), 'ref_prev', COALESCE(rp.tot, 0), 'ref_product', rt.product_name
  ) ORDER BY t.tot DESC), '[]'::jsonb)
  FROM top t
  LEFT JOIN prv  p  ON p.ing  = t.ing
  LEFT JOIN aju  a  ON a.ing  = t.ing
  LEFT JOIN ajup ap ON ap.ing = t.ing
  LEFT JOIN ajut at ON at.ing = t.ing
  LEFT JOIN ref  r  ON r.ing  = t.ing
  LEFT JOIN refp rp ON rp.ing = t.ing
  LEFT JOIN reft rt ON rt.ing = t.ing;
$$;
ALTER FUNCTION public.get_rx_trend(text, text, text, int) SET statement_timeout = '55s';
