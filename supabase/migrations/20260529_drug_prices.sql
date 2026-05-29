-- 약가 목록 테이블
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS drug_prices (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  item_name       text        NOT NULL,
  item_code       text,
  ingredient_name text,
  max_price       integer,
  pay_type        text,
  standard        text,
  unit            text,
  effective_date  text,
  manufacturer    text,
  source_file     text,
  created_at      timestamptz DEFAULT now()
);

-- ingredient_name 컬럼 추가 (이미 테이블이 있는 경우)
DO $$ BEGIN
  ALTER TABLE drug_prices ADD COLUMN IF NOT EXISTS ingredient_name text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 품목명 부분일치 검색용 인덱스
CREATE INDEX IF NOT EXISTS idx_drug_prices_item_name
  ON drug_prices (item_name text_pattern_ops);

-- RLS
ALTER TABLE drug_prices ENABLE ROW LEVEL SECURITY;

-- 로그인 사용자 전체 조회 허용
CREATE POLICY "drug_prices_read" ON drug_prices
  FOR SELECT TO authenticated USING (true);

-- 관리자만 쓰기
CREATE POLICY "drug_prices_write" ON drug_prices
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
