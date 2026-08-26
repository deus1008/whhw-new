-- 시장분석 검색: ubist_data가 수백만 행이 되며 ILIKE '%q%'(제품명·성분명 부분일치)가
-- 풀스캔→statement timeout으로 실패. pg_trgm GIN 인덱스로 부분일치를 인덱스 처리.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_ubist_product_trgm
  ON public.ubist_data USING gin (product_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ubist_ingredient_trgm
  ON public.ubist_data USING gin (ingredient_name gin_trgm_ops);
