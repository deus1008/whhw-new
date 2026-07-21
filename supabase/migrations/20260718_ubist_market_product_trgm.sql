-- SF 성분 검색에서 제품명(한글 브랜드) 부분일치를 빠르게 하기 위한 트라이그램 인덱스.
-- product_name ILIKE '%q%' 는 일반 btree 로 가속되지 않으므로 pg_trgm GIN 을 쓴다.
create extension if not exists pg_trgm;
create index if not exists ubist_market_product_trgm
  on ubist_market using gin (product_name gin_trgm_ops);
