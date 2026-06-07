-- ============================================================
-- commission_settlements 전체 스키마 최신화 (누락 컬럼 일괄 추가)
-- Supabase SQL Editor 에서 한 번 실행하면 됩니다.
-- ============================================================

-- 1) 테이블이 없으면 전체 생성
CREATE TABLE IF NOT EXISTS public.commission_settlements (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file         text        NOT NULL,
  settlement_month    text,
  prescription_month  text,
  manager             text,
  cso_name            text,
  hospital_name       text,
  product_name        text,
  approved_qty        integer,
  unit_price          numeric,
  prescription_amount numeric,
  hospital_category   text,
  hospital_type       text,
  commission_rate     numeric,
  settlement_amount   numeric,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 2) 기존 테이블에 누락 컬럼 추가 (이미 있으면 무시)
ALTER TABLE public.commission_settlements
  ADD COLUMN IF NOT EXISTS prescription_month  text,
  ADD COLUMN IF NOT EXISTS hospital_category   text;

-- 3) 인덱스
CREATE INDEX IF NOT EXISTS idx_cs_month     ON public.commission_settlements(settlement_month);
CREATE INDEX IF NOT EXISTS idx_cs_presc_m   ON public.commission_settlements(prescription_month);
CREATE INDEX IF NOT EXISTS idx_cs_source    ON public.commission_settlements(source_file);
CREATE INDEX IF NOT EXISTS idx_cs_manager   ON public.commission_settlements(manager);
CREATE INDEX IF NOT EXISTS idx_cs_cso       ON public.commission_settlements(cso_name);
CREATE INDEX IF NOT EXISTS idx_cs_hosp_cat  ON public.commission_settlements(hospital_category);
CREATE INDEX IF NOT EXISTS idx_cs_hosp_type ON public.commission_settlements(hospital_type);

-- 4) RLS
ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='commission_settlements' AND policyname='cs_select'
  ) THEN
    CREATE POLICY "cs_select" ON public.commission_settlements
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='commission_settlements' AND policyname='cs_service_all'
  ) THEN
    CREATE POLICY "cs_service_all" ON public.commission_settlements
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
