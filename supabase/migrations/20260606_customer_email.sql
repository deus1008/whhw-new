-- customer_status 테이블에 이메일 컬럼 추가 (memo 컬럼은 실제 메모용으로 유지)
ALTER TABLE public.customer_status
  ADD COLUMN IF NOT EXISTS manager_email text;

COMMENT ON COLUMN public.customer_status.manager_email IS '업체담당자 이메일';
COMMENT ON COLUMN public.customer_status.memo           IS '기타 비고';
