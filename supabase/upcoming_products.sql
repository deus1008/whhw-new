-- ================================================================
-- 발매예정품목 테이블 생성
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ================================================================

CREATE TABLE IF NOT EXISTS upcoming_products (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text        NOT NULL,
  launch_date      date,
  manufacturer     text,
  indication       text,
  insurance_price  text,
  insurance_code   text,
  status           text,
  memo             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS upcoming_products_launch_date_idx ON upcoming_products (launch_date ASC NULLS LAST);

-- RLS 활성화
ALTER TABLE upcoming_products ENABLE ROW LEVEL SECURITY;

-- 승인된 멤버 전체 조회
CREATE POLICY "approved_view_products"
  ON upcoming_products FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
  );

-- 관리자만 등록
CREATE POLICY "admin_insert_products"
  ON upcoming_products FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND status = 'approved')
  );

-- 관리자만 수정
CREATE POLICY "admin_update_products"
  ON upcoming_products FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 관리자만 삭제
CREATE POLICY "admin_delete_products"
  ON upcoming_products FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER upcoming_products_updated_at
  BEFORE UPDATE ON upcoming_products
  FOR EACH ROW EXECUTE FUNCTION update_products_updated_at();
