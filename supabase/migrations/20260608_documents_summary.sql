-- documents 테이블에 경쟁사 동향 요약 메모 컬럼 추가
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS summary TEXT;
