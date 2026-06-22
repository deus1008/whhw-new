-- 생물학적동등성 인정품목 테이블
CREATE TABLE IF NOT EXISTS drug_bioequiv (
  id              bigserial    PRIMARY KEY,
  source_file     text         NOT NULL,
  item_name       text         NOT NULL,       -- 품목명
  company_name    text,                        -- 업체명
  ingredient_name text,                        -- 성분명
  notice_date     text,                        -- 고시일자
  dosage_form     text,                        -- 제형
  created_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bioequiv_item        ON drug_bioequiv (item_name);
CREATE INDEX IF NOT EXISTS idx_bioequiv_ingredient  ON drug_bioequiv (ingredient_name);
CREATE INDEX IF NOT EXISTS idx_bioequiv_source      ON drug_bioequiv (source_file);

ALTER TABLE drug_bioequiv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bioequiv_approved_select" ON drug_bioequiv FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'
  ));

CREATE POLICY "bioequiv_admin_insert" ON drug_bioequiv FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','관리자') AND status = 'approved'
  ));

CREATE POLICY "bioequiv_admin_delete" ON drug_bioequiv FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')
  ));
