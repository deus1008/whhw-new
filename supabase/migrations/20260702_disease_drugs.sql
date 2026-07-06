-- 질환별 의약품 마스터 테이블
-- 출처: public/data/질환별의약품_DB.xlsx + HIRA API + 식약처 API
CREATE TABLE IF NOT EXISTS disease_drugs (
  id              bigserial    PRIMARY KEY,
  disease_group   text         NOT NULL,   -- 질환군 (순환기계(심혈관질환) 등)
  sub_category    text,                    -- 중분류 (고지혈증 단일제(Statin) 등)
  treatment_class text,                    -- 치료분류
  ingredient_name text,                    -- 성분명
  product_name    text,                    -- 제품명
  manufacturer    text,                    -- 제조사/업체명
  standard        text,                    -- 규격
  pay_type        text,                    -- 급여여부 (급여/비급여/-)
  is_original     boolean      DEFAULT false, -- 오리지널 여부
  mechanism       text,                    -- 작용기전 (기전별분류 시트)
  note            text,                    -- 비고
  -- HIRA 연동 필드
  atc_code        text,                    -- ATC 코드 (HIRA 약제급여목록)
  atc_name        text,                    -- ATC 한글명 (HIRA)
  item_code       text,                    -- 품목기준코드 (HIRA)
  max_price       integer,                 -- 공식 상한가 원 단위 (HIRA)
  -- 식약처 연동 필드
  reference_drug  text,                    -- 대조약명 (식약처 생동성시험 DB)
  permit_kind     text,                    -- 허가종류 (신약/개량신약/허가이후서류제출...)
  approval_date   text,                    -- 허가일자 YYYY-MM-DD (식약처)
  item_seq        text,                    -- 품목일련번호 (식약처, HIRA 연계용)
  -- 메타
  source_file     text,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dd_group     ON disease_drugs (disease_group);
CREATE INDEX IF NOT EXISTS idx_dd_sub       ON disease_drugs (sub_category);
CREATE INDEX IF NOT EXISTS idx_dd_ingr      ON disease_drugs (ingredient_name);
CREATE INDEX IF NOT EXISTS idx_dd_prod      ON disease_drugs (product_name);
CREATE INDEX IF NOT EXISTS idx_dd_atc       ON disease_drugs (atc_code);
CREATE INDEX IF NOT EXISTS idx_dd_is_orig   ON disease_drugs (is_original);

ALTER TABLE disease_drugs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dd_read"  ON disease_drugs;
DROP POLICY IF EXISTS "dd_write" ON disease_drugs;
CREATE POLICY "dd_read" ON disease_drugs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'));
CREATE POLICY "dd_write" ON disease_drugs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')));

-- 질환 정보 부가 설명 테이블 (관리자 직접 입력 가능)
CREATE TABLE IF NOT EXISTS disease_info (
  id              bigserial    PRIMARY KEY,
  disease_group   text         NOT NULL,
  sub_category    text,
  description     text,        -- 질환 설명 (마크다운)
  mechanism_summary text,      -- 작용기전 요약
  created_at      timestamptz  DEFAULT now()
);

ALTER TABLE disease_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "di_read"  ON disease_info;
DROP POLICY IF EXISTS "di_write" ON disease_info;
CREATE POLICY "di_read" ON disease_info FOR SELECT USING (true);
CREATE POLICY "di_write" ON disease_info FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','관리자')));
