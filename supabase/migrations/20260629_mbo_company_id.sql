-- mbo_targets, mbo_status에 company_id 추가 (위탁사별 격리)

ALTER TABLE mbo_targets
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES client_companies(id);

CREATE INDEX IF NOT EXISTS idx_mbo_targets_company
  ON mbo_targets(company_id);

ALTER TABLE mbo_status
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES client_companies(id);

-- 기존 unique index 재생성 (company_id 포함)
DROP INDEX IF EXISTS idx_mbo_status_unique;
CREATE UNIQUE INDEX idx_mbo_status_unique
  ON mbo_status(
    user_id,
    year,
    COALESCE(month, -1),
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
