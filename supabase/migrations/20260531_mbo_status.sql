-- 현수준 상태 테이블 (user × period 당 1개)
CREATE TABLE IF NOT EXISTS mbo_status (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  year         int  NOT NULL,
  month        int,                          -- NULL = 연간
  status_color text NOT NULL DEFAULT 'blue', -- 'blue' | 'yellow' | 'red'
  created_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- NULL month를 포함한 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_mbo_status_unique
  ON mbo_status(user_id, year, COALESCE(month, -1));

ALTER TABLE mbo_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mbo_status_admin_all" ON mbo_status FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "mbo_status_member_select" ON mbo_status FOR SELECT
  USING (user_id = auth.uid());
