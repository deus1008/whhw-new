-- 기존 문서 전체를 아주약품으로 백필
-- (company_id가 NULL인 모든 문서 → 아주약품 UUID)
UPDATE documents
SET company_id = (
  SELECT id FROM client_companies WHERE name = '아주약품' LIMIT 1
)
WHERE company_id IS NULL;
