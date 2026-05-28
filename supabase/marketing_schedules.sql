-- ================================================================
-- 마케팅 일정 테이블 생성
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ================================================================

CREATE TABLE IF NOT EXISTS marketing_schedules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  start_date  date        NOT NULL,
  end_date    date,
  category    text,
  location    text,
  assignee    text,
  memo        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS marketing_schedules_user_id_idx    ON marketing_schedules (user_id);
CREATE INDEX IF NOT EXISTS marketing_schedules_start_date_idx ON marketing_schedules (start_date DESC);

-- RLS 활성화
ALTER TABLE marketing_schedules ENABLE ROW LEVEL SECURITY;

-- 승인된 멤버 전체 조회
CREATE POLICY "approved_view_all"
  ON marketing_schedules FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
  );

-- 승인된 멤버 본인 등록
CREATE POLICY "approved_insert"
  ON marketing_schedules FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
  );

-- 본인 또는 관리자 수정
CREATE POLICY "own_or_admin_update"
  ON marketing_schedules FOR UPDATE
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 본인 또는 관리자 삭제
CREATE POLICY "own_or_admin_delete"
  ON marketing_schedules FOR DELETE
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_marketing_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER marketing_schedules_updated_at
  BEFORE UPDATE ON marketing_schedules
  FOR EACH ROW EXECUTE FUNCTION update_marketing_updated_at();
