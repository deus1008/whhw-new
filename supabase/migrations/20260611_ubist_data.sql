-- Ubist 처방 데이터 테이블
CREATE TABLE IF NOT EXISTS ubist_data (
  id                  bigserial    PRIMARY KEY,
  source_file         text         NOT NULL,
  document_id         uuid,
  period              text,             -- YYYY-MM
  ingredient_name     text,             -- 성분명
  product_name        text,             -- 제품명/품목명
  manufacturer        text,             -- 제조사/제약사
  hospital_type       text,             -- 병원구분 (대학병원/종합병원/병원/의원 등)
  region              text,             -- 지역 (시도)
  prescription_amount bigint,           -- 처방금액 (원 단위)
  prescription_count  integer,          -- 처방건수
  created_at          timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ubist_product    ON ubist_data (product_name);
CREATE INDEX IF NOT EXISTS idx_ubist_ingredient ON ubist_data (ingredient_name);
CREATE INDEX IF NOT EXISTS idx_ubist_period     ON ubist_data (period);
CREATE INDEX IF NOT EXISTS idx_ubist_source     ON ubist_data (source_file);

ALTER TABLE ubist_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ubist_approved_select" ON ubist_data FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'
  ));

CREATE POLICY "ubist_admin_insert" ON ubist_data FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','관리자') AND status = 'approved'
  ));

CREATE POLICY "ubist_admin_delete" ON ubist_data FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')
  ));
