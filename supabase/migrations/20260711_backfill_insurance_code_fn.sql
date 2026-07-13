-- 실적 테이블 insurance_code 백필용 set-based RPC (Phase 2)
--   품목명→보험코드 맵(jsonb)을 받아 한 번의 UPDATE FROM 으로 채운다.
--   (품목명 인덱스 없이도 해시조인 1패스 — 품목별 반복 UPDATE의 타임아웃 회피)
-- Supabase SQL Editor에서 실행하세요
CREATE OR REPLACE FUNCTION backfill_insurance_code(p_table text, p_map jsonb)
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
  SET LOCAL statement_timeout = 0;   -- 대량 UPDATE 중단 방지
  EXECUTE format(
    'UPDATE %I t SET insurance_code = p.code
       FROM (SELECT key AS name, value AS code FROM jsonb_each_text($1)) p
      WHERE t.product_name = p.name AND t.insurance_code IS NULL',
    p_table
  ) USING p_map;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
