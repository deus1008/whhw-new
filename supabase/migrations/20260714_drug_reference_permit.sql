-- 식약처/HIRA 공식 API 기반 참조데이터 확장
--   1) 생동(drug_bioequiv): 코드레벨 매칭용 item_seq + 함량 보강
--   2) 대조약(drug_reference) 신규
--   3) 허가(drug_permit) 신규 (목록 + 상세 필드)
--   4) products 마스터: 대조약/허가/제조원/포장/위탁 연동 컬럼
-- 적재는 공식 API가 기본(source_file='API:*'), 파일 업로드는 보조.

-- 1) 생동 ─────────────────────────────────────────────
ALTER TABLE drug_bioequiv ADD COLUMN IF NOT EXISTS item_seq text;
ALTER TABLE drug_bioequiv ADD COLUMN IF NOT EXISTS ingredient_qty text;
CREATE INDEX IF NOT EXISTS idx_drug_bioequiv_item_seq ON drug_bioequiv(item_seq);

-- 2) 대조약 (MdcCompDrugInfoService04) ─────────────────
CREATE TABLE IF NOT EXISTS drug_reference (
  id              bigserial PRIMARY KEY,
  item_seq        text,           -- ITEM_SEQ (품목일련번호)
  item_name       text NOT NULL,  -- ITEM_NAME (제품명)
  company_name    text,           -- ENTP_NAME (업체명)
  ingredient_name text,           -- INGR_NAME (성분명)
  dosage_form     text,           -- SHAPE_CODE_NAME (제형)
  notice_date     text,           -- BIOEQ_NOTICE_DATE (공고일자)
  source_file     text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drug_reference_item_seq  ON drug_reference(item_seq);
CREATE INDEX IF NOT EXISTS idx_drug_reference_item_name ON drug_reference(item_name);
ALTER TABLE drug_reference ENABLE ROW LEVEL SECURITY;

-- 3) 허가 (DrugPrdtPrmsnInfoService07) ─────────────────
--    목록: getDrugPrdtPrmsnInq07 / 상세: getDrugPrdtPrmsnDtlInq06
CREATE TABLE IF NOT EXISTS drug_permit (
  item_seq          text PRIMARY KEY,  -- ITEM_SEQ
  item_name         text,              -- ITEM_NAME
  company_name      text,              -- ENTP_NAME (허가업체=판매사)
  permit_date       text,              -- ITEM_PERMIT_DATE (허가일자)
  permit_no         text,              -- PRDUCT_PRMISN_NO (품목허가번호)
  std_code          text,              -- PRDLST_STDR_CODE (품목기준코드)
  edi_code          text,              -- EDI_CODE (보험코드, 복수 콤마)
  ingredient_name   text,              -- ITEM_INGR_NAME (주성분)
  induty            text,              -- INDUTY (업종)
  product_type      text,              -- PRDUCT_TYPE
  permit_kind       text,              -- PERMIT_KIND_CODE
  cancel_name       text,              -- CANCEL_NAME (정상/취소/취하)
  -- 상세(getDrugPrdtPrmsnDtlInq06) — 온디맨드로 보강
  etc_otc           text,              -- ETC_OTC_CODE (전문/일반)
  maker             text,              -- CNSGN_MANUF (제조원/위탁제조업체)
  is_consignment    boolean,           -- 위탁생산 여부(제조원≠허가업체)
  package_unit      text,              -- PACK_UNIT (포장단위)
  storage_method    text,              -- STORAGE_METHOD (저장방법)
  valid_term        text,              -- VALID_TERM (유효기간)
  atc_code          text,              -- ATC_CODE
  detail_fetched_at timestamptz,
  source_file       text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drug_permit_edi_code  ON drug_permit(edi_code);
CREATE INDEX IF NOT EXISTS idx_drug_permit_item_name ON drug_permit(item_name);
ALTER TABLE drug_permit ENABLE ROW LEVEL SECURITY;

-- 4) products 마스터 연동 컬럼 ─────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_reference_drug boolean;  -- 대조약 여부(null=미확인)
ALTER TABLE products ADD COLUMN IF NOT EXISTS maker             text;     -- 제조원(위탁제조사)
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_consignment    boolean;  -- 위탁생산 여부
ALTER TABLE products ADD COLUMN IF NOT EXISTS permit_no         text;     -- 품목허가번호
ALTER TABLE products ADD COLUMN IF NOT EXISTS permit_date       text;     -- 허가일자
ALTER TABLE products ADD COLUMN IF NOT EXISTS std_code          text;     -- 품목기준코드
ALTER TABLE products ADD COLUMN IF NOT EXISTS package_unit      text;     -- 포장단위
