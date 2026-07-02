-- ATC 분류 계층 테이블 (HIRA 약제급여목록 연동)
CREATE TABLE IF NOT EXISTS atc_codes (
  code        text PRIMARY KEY,         -- A, C09, C09A, C09AA, C09AA01
  level       integer NOT NULL,          -- 1~5
  name_ko     text,                      -- 한글 약효군명 (HIRA)
  name_en     text,                      -- WHO 영문명
  parent_code text REFERENCES atc_codes(code) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_atc_level  ON atc_codes (level);
CREATE INDEX IF NOT EXISTS idx_atc_parent ON atc_codes (parent_code);

ALTER TABLE atc_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atc_read" ON atc_codes FOR SELECT USING (true);
CREATE POLICY "atc_write" ON atc_codes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')));
