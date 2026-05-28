-- ================================================================
-- 발매예정품목 테이블 생성
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ================================================================

CREATE TABLE IF NOT EXISTS upcoming_products (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_label      text        NOT NULL,   -- 예) 26년, 27년
  launch_timing   text        NOT NULL,   -- 예) 6월, 7월, 2분기
  product_name    text        NOT NULL,   -- 제품명
  category        text,                   -- 계열
  ingredient      text,                   -- 성분명
  is_priority     boolean     NOT NULL DEFAULT false,  -- 우선관리 표시
  memo            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS upcoming_products_year_idx    ON upcoming_products (year_label);
CREATE INDEX IF NOT EXISTS upcoming_products_user_idx    ON upcoming_products (user_id);

-- RLS 활성화
ALTER TABLE upcoming_products ENABLE ROW LEVEL SECURITY;

-- 승인된 멤버 전체 조회
CREATE POLICY "approved_view_products"
  ON upcoming_products FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
  );

-- 승인된 멤버 등록
CREATE POLICY "approved_insert_products"
  ON upcoming_products FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
  );

-- 승인된 멤버 수정 (전체)
CREATE POLICY "approved_update_products"
  ON upcoming_products FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
  );

-- 관리자만 삭제
CREATE POLICY "admin_delete_products"
  ON upcoming_products FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_upcoming_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER upcoming_products_updated_at
  BEFORE UPDATE ON upcoming_products
  FOR EACH ROW EXECUTE FUNCTION update_upcoming_products_updated_at();
