-- marketing_schedules 에 visit_record_id 컬럼 추가
-- 영업활동 방문기록 ↔ 주요일정 자동 동기화를 위한 연결 키
ALTER TABLE marketing_schedules
  ADD COLUMN IF NOT EXISTS visit_record_id uuid
    REFERENCES visit_records(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_marketing_schedules_visit_record
  ON marketing_schedules(visit_record_id)
  WHERE visit_record_id IS NOT NULL;
