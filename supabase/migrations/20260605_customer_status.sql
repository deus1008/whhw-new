-- 거래처현황 테이블
CREATE TABLE IF NOT EXISTS customer_status (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file   text        NOT NULL,       -- 업로드 파일명
  customer_code text,                       -- 거래처코드/요양기관번호
  customer_name text        NOT NULL,       -- 거래처명
  customer_type text,                       -- 종별구분 (병원/의원/약국 등)
  region        text,                       -- 시도
  sub_region    text,                       -- 시군구
  address       text,                       -- 주소
  phone         text,                       -- 전화번호
  manager       text,                       -- 담당지역장
  cso           text,                       -- 담당CSO
  memo          text,                       -- 비고
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_name   ON customer_status(customer_name);
CREATE INDEX IF NOT EXISTS idx_customer_code   ON customer_status(customer_code);
CREATE INDEX IF NOT EXISTS idx_customer_region ON customer_status(region);
CREATE INDEX IF NOT EXISTS idx_customer_manager ON customer_status(manager);
CREATE INDEX IF NOT EXISTS idx_customer_source ON customer_status(source_file);

ALTER TABLE customer_status ENABLE ROW LEVEL SECURITY;

-- 승인된 멤버 전체 조회
CREATE POLICY "customer_approved_select" ON customer_status FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'));

-- 관리자/업로더만 수정
CREATE POLICY "customer_uploader_insert" ON customer_status FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','uploader') AND status = 'approved'
  ));

CREATE POLICY "customer_admin_delete" ON customer_status FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
