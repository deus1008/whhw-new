-- 약가표 코드 → 허가 상세(포장단위·제조원·위탁) 매핑 캐시.
-- drug_permit.edi_code(콤마 복수 9자리)를 코드 단위로 풀어 저장 → /drug-search 조인 고속화.
-- 값은 식약처 허가 상세(getDrugPrdtPrmsnDtlInq06)에서 적재(백그라운드).
CREATE TABLE IF NOT EXISTS permit_pkg (
  code           text PRIMARY KEY,   -- 9자리 보험/EDI 코드 (= drug_prices.item_code)
  item_seq       text,               -- 허가 품목일련번호
  package_unit   text,               -- PACK_UNIT (포장단위)
  maker          text,               -- CNSGN_MANUF (제조원)
  is_consignment boolean,            -- 위탁생산 여부(제조원≠허가업체)
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE permit_pkg ENABLE ROW LEVEL SECURITY;
