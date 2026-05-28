-- ================================================================
-- 발매예정품목 테이블 재생성 (기존 테이블 삭제 후 재생성)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ================================================================

-- 기존 테이블 삭제 (데이터 없으므로 안전)
DROP TABLE IF EXISTS upcoming_products CASCADE;
DROP FUNCTION IF EXISTS update_upcoming_products_updated_at CASCADE;

-- 새 테이블 생성
CREATE TABLE upcoming_products (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ingredient      text        NOT NULL,                         -- 성분명 (필수)
  product_name    text,                                         -- 품목명
  approval_dates  jsonb       NOT NULL DEFAULT '[]'::jsonb,    -- 허가(예정)일 이력 [{date, note}]
  launch_dates    jsonb       NOT NULL DEFAULT '[]'::jsonb,    -- 발매(예정)일 이력 [{date, note}]
  product_type    text        NOT NULL DEFAULT '자사',          -- 자사 / 위탁
  contractor      text,                                         -- 위탁사 (위탁일 때)
  indication      text,                                         -- 적응증/효능효과
  expected_price  text,                                         -- (예상)약가
  status          text,                                         -- 진행상태
  memo            text,
  is_priority     boolean     NOT NULL DEFAULT false,           -- 우선관리 표시
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX upcoming_products_user_idx   ON upcoming_products (user_id);
CREATE INDEX upcoming_products_status_idx ON upcoming_products (status);

-- RLS 활성화
ALTER TABLE upcoming_products ENABLE ROW LEVEL SECURITY;

-- 승인된 멤버 전체 조회
CREATE POLICY "approved_view_products"
  ON upcoming_products FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'));

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
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'));

-- 관리자만 삭제
CREATE POLICY "admin_delete_products"
  ON upcoming_products FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_upcoming_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER upcoming_products_updated_at
  BEFORE UPDATE ON upcoming_products
  FOR EACH ROW EXECUTE FUNCTION update_upcoming_products_updated_at();
