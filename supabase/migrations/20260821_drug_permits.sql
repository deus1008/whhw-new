-- 의약품 허가 원부(식약처 DrugPrdtPrmsnInfoService07) 적재 테이블.
--   제품명 ↔ 한글 주성분 매핑의 authoritative 소스. 승인현황·약물조회 성분 보완에 사용.
CREATE TABLE IF NOT EXISTS public.drug_permits (
  item_seq       text PRIMARY KEY,   -- 품목기준코드
  item_name      text NOT NULL,      -- 제품명
  item_name_norm text,               -- 공백제거 정규화(매칭용)
  entp_name      text,               -- 업체명
  ingredient     text,               -- 한글 주성분(복합제는 콤마 결합, 공백제거)
  main_ingr_raw  text,               -- 원문 MAIN_ITEM_INGR
  etc_otc        text,               -- 전문의약품 / 일반의약품
  permit_date    text,               -- 허가일 YYYY-MM-DD
  cancel_date    text,               -- 취소일 YYYY-MM-DD (없으면 null)
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drug_permits_norm ON public.drug_permits (item_name_norm);
CREATE INDEX IF NOT EXISTS idx_drug_permits_ingr ON public.drug_permits (ingredient);
ALTER TABLE public.drug_permits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drug_permits_service_all" ON public.drug_permits;
CREATE POLICY "drug_permits_service_all" ON public.drug_permits FOR ALL USING (true) WITH CHECK (true);

-- 적재 진행 커서(재개형 동기화용, 단일 행).
CREATE TABLE IF NOT EXISTS public.drug_permit_sync (
  id         int PRIMARY KEY DEFAULT 1,
  cursor     int NOT NULL DEFAULT 1,   -- 다음에 처리할 pageNo
  total      int NOT NULL DEFAULT 0,   -- API totalCount
  synced     int NOT NULL DEFAULT 0,   -- 이번 사이클 누적 처리 수
  done       boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drug_permit_sync_singleton CHECK (id = 1)
);
ALTER TABLE public.drug_permit_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drug_permit_sync_service_all" ON public.drug_permit_sync;
CREATE POLICY "drug_permit_sync_service_all" ON public.drug_permit_sync FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.drug_permit_sync (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
