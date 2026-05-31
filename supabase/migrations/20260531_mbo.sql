-- MBO (목표관리) 테이블
CREATE TABLE IF NOT EXISTS mbo_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,          -- 지역장 user ID
  year         int  NOT NULL,          -- 연도 (예: 2026)
  month        int,                    -- NULL=연간목표, 1~12=월별목표
  item_name    text NOT NULL,          -- 목표 항목명 (자유 입력)
  target_value numeric NOT NULL DEFAULT 0,   -- 목표값
  actual_value numeric NOT NULL DEFAULT 0,   -- 실적값
  unit         text NOT NULL DEFAULT '',     -- 단위 (건, 원, % 등)
  note         text,                         -- 실적 비고
  sort_order   int  NOT NULL DEFAULT 0,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbo_targets_user_year_month
  ON mbo_targets(user_id, year, month);

-- RLS
ALTER TABLE mbo_targets ENABLE ROW LEVEL SECURITY;

-- 관리자: 전체 읽기/쓰기
CREATE POLICY "mbo_admin_all" ON mbo_targets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 멤버: 본인 데이터 조회만
CREATE POLICY "mbo_member_select" ON mbo_targets
  FOR SELECT
  USING (user_id = auth.uid());

-- 멤버: 본인 실적(actual_value, note) 업데이트
CREATE POLICY "mbo_member_update_actual" ON mbo_targets
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
