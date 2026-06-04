-- 처방실적 트렌드 데이터 테이블
CREATE TABLE IF NOT EXISTS trend_prescriptions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file         text        NOT NULL,            -- 업로드 파일명
  prescription_month  text,                            -- 처방월 (YYYYMM)
  sales_rep           text,                            -- 내부담당자
  cso_name            text,                            -- 담당CSO
  hospital_name       text,                            -- 처방처명
  product_name        text,                            -- 품목명
  hospital_type       text,                            -- 종별구분
  commission_rate     numeric,                         -- 합산수수료 (%)
  commission_tier     text,                            -- 수수료구간 (예: 10%~20%)
  prescription_amount numeric,                         -- 처방금액
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trend_month   ON trend_prescriptions(prescription_month);
CREATE INDEX IF NOT EXISTS idx_trend_source  ON trend_prescriptions(source_file);
CREATE INDEX IF NOT EXISTS idx_trend_rep     ON trend_prescriptions(sales_rep);
CREATE INDEX IF NOT EXISTS idx_trend_cso     ON trend_prescriptions(cso_name);
CREATE INDEX IF NOT EXISTS idx_trend_product ON trend_prescriptions(product_name);
CREATE INDEX IF NOT EXISTS idx_trend_tier    ON trend_prescriptions(commission_tier);
CREATE INDEX IF NOT EXISTS idx_trend_type    ON trend_prescriptions(hospital_type);

ALTER TABLE trend_prescriptions ENABLE ROW LEVEL SECURITY;

-- 승인된 멤버 조회
CREATE POLICY "trend_approved_select" ON trend_prescriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved'));

-- 관리자/업로더 삽입·삭제
CREATE POLICY "trend_uploader_insert" ON trend_prescriptions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin','uploader') AND status = 'approved'
  ));

CREATE POLICY "trend_admin_delete" ON trend_prescriptions FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
