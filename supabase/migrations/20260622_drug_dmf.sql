-- 원료 DMF(Drug Master File) 테이블
CREATE TABLE IF NOT EXISTS drug_dmf (
  id                   bigserial    PRIMARY KEY,
  source_file          text         NOT NULL,
  ingredient_name      text         NOT NULL,  -- 성분명
  company_name         text,                   -- 국내 등록업체
  manufacturer_name    text,                   -- 제조업체명
  manufacturer_address text,                   -- 제조소 주소
  country              text,                   -- 제조국
  registration_date    text,                   -- 등록일
  dmf_number           text,                   -- DMF 허가번호
  created_at           timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dmf_ingredient  ON drug_dmf (ingredient_name);
CREATE INDEX IF NOT EXISTS idx_dmf_company     ON drug_dmf (company_name);
CREATE INDEX IF NOT EXISTS idx_dmf_source      ON drug_dmf (source_file);
CREATE INDEX IF NOT EXISTS idx_dmf_number      ON drug_dmf (dmf_number);

ALTER TABLE drug_dmf ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dmf_approved_select" ON drug_dmf FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'
  ));

CREATE POLICY "dmf_admin_insert" ON drug_dmf FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','관리자') AND status = 'approved'
  ));

CREATE POLICY "dmf_admin_delete" ON drug_dmf FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')
  ));
