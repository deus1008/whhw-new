-- 필터링 실적 자동확인 배치용: 병원명 단독 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_tp_hospital ON public.trend_prescriptions(hospital_name);
