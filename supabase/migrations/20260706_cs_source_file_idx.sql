-- commission_settlements source_file 커서 페이지네이션 성능 인덱스
-- WHERE source_file = ? ORDER BY id 쿼리 최적화 (풀 스캔 → 인덱스 스캔)
CREATE INDEX IF NOT EXISTS idx_cs_source_file_id
  ON public.commission_settlements(source_file, id);
