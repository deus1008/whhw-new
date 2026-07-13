-- 실적 테이블 insurance_code 백필용 배치 RPC (Phase 2)
--   대용량(UBIST 137만) 대응: 맵을 관계 조인하지 않고,
--   insurance_code IS NULL(btree 인덱스)로 대상 행을 먼저 찾은 뒤
--   행별 jsonb 조회($1 ? / $1 ->>)로 코드를 채운다 → 표/맵 크기 무관하게 빠름.
--   API statement_timeout(≈8s) 회피 위해 p_limit 행씩 반복 호출(0 반환까지).
-- Supabase SQL Editor에서 실행하세요
CREATE OR REPLACE FUNCTION backfill_insurance_code(p_table text, p_map jsonb, p_limit int DEFAULT 20000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  n integer;
BEGIN
  IF p_table NOT IN ('trend_prescriptions','commission_settlements','ubist_data') THEN
    RAISE EXCEPTION 'not allowed: %', p_table;
  END IF;
  EXECUTE format(
    'WITH b AS MATERIALIZED (
        SELECT t.ctid AS cid, t.product_name AS pn
          FROM %I t
         WHERE t.insurance_code IS NULL
           AND ($1 ? t.product_name)
         LIMIT $2
     )
     UPDATE %I t SET insurance_code = ($1 ->> b.pn)
       FROM b WHERE t.ctid = b.cid',
    p_table, p_table
  ) USING p_map, p_limit;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
