-- upcoming_products 에 문서 출처 컬럼 추가
-- 허가현황 문서에서 자동 추출된 품목 관리 및 재처리 시 중복 방지
ALTER TABLE upcoming_products
  ADD COLUMN IF NOT EXISTS source_document_id text;

CREATE INDEX IF NOT EXISTS idx_upcoming_products_source_doc
  ON upcoming_products(source_document_id);
