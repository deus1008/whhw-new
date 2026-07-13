-- ============================================================
-- 제품 마스터 테이블 (보험코드 9자리 키)
--   - 위탁품목리스트 업로드 시 위탁사별 전체 교체(delete+insert)로 적재
--   - 식약처/심평원 연동 컬럼(item_seq, atc_code 등)은 Phase 3에서 채움
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid,
  insurance_code      text NOT NULL,          -- 9자리 보험코드(청구코드) — 관리 키
  representative_code text,                    -- 13자리 대표코드(원본)
  product_name        text NOT NULL,
  ingredient_name     text,
  manufacturer        text,
  commission_rate     numeric,
  distribution        text,                    -- 유통중 | 유통중단 | 유통예정
  note                text,
  -- 식약처/심평원 연동 (Phase 3)
  item_seq            text,                    -- 품목일련번호(MFDS/HIRA)
  atc_code            text,
  max_price           bigint,
  pay_type            text,
  source_document_id  uuid,
  no                  integer,                 -- 위탁리스트 원본 순번
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 위탁사별 보험코드 유일성 (보험코드가 있는 행에 한함)
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_inscode
  ON products(company_id, insurance_code)
  WHERE insurance_code <> '';

CREATE INDEX IF NOT EXISTS idx_products_company     ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_inscode     ON products(insurance_code);
CREATE INDEX IF NOT EXISTS idx_products_name        ON products(product_name);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 앱은 서비스 롤로만 접근 — anon/authenticated 정책은 두지 않음(서버 전용).
