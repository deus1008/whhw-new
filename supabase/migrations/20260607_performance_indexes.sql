-- ======================================================
-- 성능 인덱스 마이그레이션 (2026-06-07)
-- 자주 조회되는 컬럼에 B-tree 인덱스 추가
-- ======================================================

-- commission_settlements
CREATE INDEX IF NOT EXISTS idx_cs_settlement_month
  ON public.commission_settlements(settlement_month);

CREATE INDEX IF NOT EXISTS idx_cs_prescription_month
  ON public.commission_settlements(prescription_month);

CREATE INDEX IF NOT EXISTS idx_cs_cso_name
  ON public.commission_settlements(cso_name);

CREATE INDEX IF NOT EXISTS idx_cs_hospital_name
  ON public.commission_settlements(hospital_name);

CREATE INDEX IF NOT EXISTS idx_cs_hosp_cat
  ON public.commission_settlements(hospital_category);

CREATE INDEX IF NOT EXISTS idx_cs_hosp_type
  ON public.commission_settlements(hospital_type);

-- commission_settlements: 복합 인덱스 (settlement 페이지 정렬 쿼리용)
CREATE INDEX IF NOT EXISTS idx_cs_month_cso
  ON public.commission_settlements(settlement_month DESC, cso_name);

-- trend_prescriptions
CREATE INDEX IF NOT EXISTS idx_tp_prescription_month
  ON public.trend_prescriptions(prescription_month);

CREATE INDEX IF NOT EXISTS idx_tp_hospital_name
  ON public.trend_prescriptions(hospital_name);

-- customer_status
CREATE INDEX IF NOT EXISTS idx_cust_created_at
  ON public.customer_status(created_at);

CREATE INDEX IF NOT EXISTS idx_cust_source_file
  ON public.customer_status(source_file);

-- visit_records
CREATE INDEX IF NOT EXISTS idx_vr_visited_at
  ON public.visit_records(visited_at);

CREATE INDEX IF NOT EXISTS idx_vr_user_id
  ON public.visit_records(user_id);

-- visit_records: 복합 인덱스 (사용자별 방문일 조회)
CREATE INDEX IF NOT EXISTS idx_vr_user_visited
  ON public.visit_records(user_id, visited_at);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_status
  ON public.profiles(status);
