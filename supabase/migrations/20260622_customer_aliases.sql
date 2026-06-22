-- 거래처 별칭 매핑 테이블
-- visit_records에 자유입력된 거래처명을 customer_status의 정규 거래처로 매핑
CREATE TABLE IF NOT EXISTS customer_aliases (
  id          bigserial   PRIMARY KEY,
  alias       text        NOT NULL,             -- visit_records에 입력된 거래처명 (원문)
  alias_norm  text        NOT NULL UNIQUE,      -- LOWER(TRIM(alias)) — 비교·검색용
  customer_id uuid        NOT NULL REFERENCES customer_status(id) ON DELETE CASCADE,
  note        text,                             -- 매핑 메모
  created_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aliases_customer ON customer_aliases (customer_id);
CREATE INDEX IF NOT EXISTS idx_aliases_norm     ON customer_aliases (alias_norm);

ALTER TABLE customer_aliases ENABLE ROW LEVEL SECURITY;

-- 승인된 사용자 조회
CREATE POLICY "aliases_approved_select" ON customer_aliases FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'
  ));

-- 관리자만 생성
CREATE POLICY "aliases_admin_insert" ON customer_aliases FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('관리자','admin') AND status = 'approved'
  ));

-- 관리자만 삭제
CREATE POLICY "aliases_admin_delete" ON customer_aliases FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('관리자','admin')
  ));
