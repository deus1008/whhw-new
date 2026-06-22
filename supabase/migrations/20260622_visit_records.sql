-- 영업 방문 기록 테이블
CREATE TABLE IF NOT EXISTS visit_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visited_at     date        NOT NULL,
  customer_name  text        NOT NULL,
  customer_type  text        NOT NULL CHECK (customer_type IN ('CSO법인', '딜러')),
  contact_name   text,
  purpose        text,
  products       text,
  content        text        NOT NULL,
  next_action    text,
  follow_up_date date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_records_user_id    ON visit_records (user_id);
CREATE INDEX IF NOT EXISTS idx_visit_records_visited_at ON visit_records (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_records_customer   ON visit_records (customer_name);

ALTER TABLE visit_records ENABLE ROW LEVEL SECURITY;

-- 본인 레코드 전체 CRUD
CREATE POLICY "visit_records_own_crud" ON visit_records FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 관리자·임원 전체 조회
CREATE POLICY "visit_records_admin_select" ON visit_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('관리자', '사업총괄', '영업관리총괄')
      AND status = 'approved'
  ));

-- 관리자 삭제 권한
CREATE POLICY "visit_records_admin_delete" ON visit_records FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('관리자', '사업총괄', '영업관리총괄')
  ));

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_visit_records_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER visit_records_updated_at
  BEFORE UPDATE ON visit_records
  FOR EACH ROW EXECUTE FUNCTION update_visit_records_updated_at();
