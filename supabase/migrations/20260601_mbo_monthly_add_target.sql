-- 월별 목표값 컬럼 추가
ALTER TABLE mbo_monthly_actuals
  ADD COLUMN IF NOT EXISTS target_value text NOT NULL DEFAULT '';
