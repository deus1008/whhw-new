-- 시장분석 검색 폴백: 부분일치(ILIKE)로 못 찾을 때 트라이그램 word_similarity로
-- 오타·유사어(예: '올피토'→'올피트 정')도 찾는다. GIN trgm 인덱스(<% 연산자) 활용.
CREATE OR REPLACE FUNCTION public.search_ubist_ingredients_fuzzy(p_q text, p_limit int DEFAULT 40)
RETURNS TABLE(ingredient_name text, cnt int)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- 낮춘 임계값(느슨한 유사도) — 인덱스 가속되는 <% 연산자에 적용
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.3', true);
  RETURN QUERY
  WITH hits AS (
    SELECT COALESCE(NULLIF(TRIM(u.ingredient_name), ''), u.product_name) AS ing,
           u.product_name AS prod
    FROM public.ubist_data u
    WHERE p_q <% u.product_name OR p_q <% u.ingredient_name
    LIMIT 5000
  )
  SELECT h.ing, COUNT(DISTINCT h.prod)::int
  FROM hits h
  WHERE h.ing IS NOT NULL
  GROUP BY h.ing
  ORDER BY 2 DESC
  LIMIT p_limit;
END;
$$;
ALTER FUNCTION public.search_ubist_ingredients_fuzzy(text, int) SET statement_timeout = '20s';
