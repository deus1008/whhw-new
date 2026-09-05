-- Sales Report RPC(get_sales_report_rx) 성능 개선 — CSO/품목 EDI 매칭 미표시(간헐 타임아웃) 해결.
-- 원인: trend_prescriptions(70만행) 전체 GROUP BY가 ~8초 → 페이지 RPC 간헐 타임아웃 → by_cso 빈 결과.
-- 조치: (1) 집계 커버링 인덱스로 index-only 스캔, (2) 함수 statement_timeout 상향(안전망).
--   ※ VACUUM은 트랜잭션 밖에서 별도 실행 필요(아래 주석 참조).

CREATE INDEX IF NOT EXISTS idx_tp_cso_month
  ON public.trend_prescriptions (cso_name, prescription_month) INCLUDE (prescription_amount)
  WHERE cso_name IS NOT NULL AND prescription_month IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tp_prod_month
  ON public.trend_prescriptions (product_name, prescription_month) INCLUDE (prescription_amount)
  WHERE product_name IS NOT NULL AND prescription_month IS NOT NULL;

-- 서비스롤/역할 statement_timeout이 낮아도 이 함수는 완료되도록 상향(안전망)
ALTER FUNCTION public.get_sales_report_rx() SET statement_timeout = '55s';

-- 죽은 튜플 회수(최근 대량 삭제분) — SQL 편집기에서 아래 한 줄을 "별도로" 실행하세요(트랜잭션 밖):
--   VACUUM (ANALYZE) public.trend_prescriptions;
