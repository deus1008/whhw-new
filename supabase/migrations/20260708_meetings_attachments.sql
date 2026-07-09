-- meetings 테이블에 첨부파일 컬럼 추가
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';
