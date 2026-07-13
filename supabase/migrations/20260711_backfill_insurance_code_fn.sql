-- 실적 테이블 insurance_code 백필용 배치 RPC (Phase 2)
--   API statement_timeout(≈8s)이 함수 호출 문장에 적용되므로, 한 번에
--   p_limit 행씩만 채우고(0을 반환할 때까지 반복 호출) 각 호출을 짧게 유지.
--   insurance_code IS NULL(btree 인덱스)로 남은 대상만 빠르게 찾는다.
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
    'WITH m AS (SELECT key AS name, value AS code FROM jsonb_each_text($1)),
          b AS (
            SELECT t.ctid AS cid, m.code AS code
              FROM %I t
              JOIN m ON m.name = t.product_name
             WHERE t.insurance_code IS NULL
             LIMIT $2
          )
     UPDATE %I t SET insurance_code = b.code
       FROM b WHERE t.ctid = b.cid',
    p_table, p_table
  ) USING p_map, p_limit;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
