-- target_value, actual_value 컬럼을 text로 변경 (텍스트 목표값 지원)
ALTER TABLE mbo_targets
  ALTER COLUMN target_value TYPE text USING target_value::text,
  ALTER COLUMN actual_value TYPE text USING actual_value::text;

ALTER TABLE mbo_targets
  ALTER COLUMN target_value SET DEFAULT '',
  ALTER COLUMN actual_value SET DEFAULT '';
