-- disease_drugs 에 판매사 컬럼 추가
ALTER TABLE disease_drugs ADD COLUMN IF NOT EXISTS distributor text;
