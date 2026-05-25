-- ================================================================
-- 방문 기록 테이블 생성
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ================================================================

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

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS visit_records_user_id_idx    ON visit_records (user_id);
CREATE INDEX IF NOT EXISTS visit_records_visited_at_idx ON visit_records (visited_at DESC);

-- RLS 활성화
ALTER TABLE visit_records ENABLE ROW LEVEL SECURITY;

-- 본인 레코드 전체 CRUD
CREATE POLICY "members_own_records"
  ON visit_records FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 관리자 전체 조회
CREATE POLICY "admin_view_all"
  ON visit_records FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 자동 갱신 (선택)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER visit_records_updated_at
  BEFORE UPDATE ON visit_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
