-- 월별 실적 테이블
CREATE TABLE IF NOT EXISTS mbo_monthly_actuals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id    uuid NOT NULL REFERENCES mbo_targets(id) ON DELETE CASCADE,
  month        int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  actual_value text NOT NULL DEFAULT '',
  note         text,
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_id, month)
);

CREATE INDEX IF NOT EXISTS idx_mbo_monthly_target ON mbo_monthly_actuals(target_id);

ALTER TABLE mbo_monthly_actuals ENABLE ROW LEVEL SECURITY;

-- 관리자: 전체
CREATE POLICY "mbo_monthly_admin_all" ON mbo_monthly_actuals FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 멤버: 본인 target의 데이터 조회
CREATE POLICY "mbo_monthly_member_select" ON mbo_monthly_actuals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM mbo_targets t
    WHERE t.id = target_id AND t.user_id = auth.uid()
  ));

-- 멤버: 본인 target의 데이터 수정
CREATE POLICY "mbo_monthly_member_update" ON mbo_monthly_actuals FOR ALL
  USING (EXISTS (
    SELECT 1 FROM mbo_targets t
    WHERE t.id = target_id AND t.user_id = auth.uid()
  ));
