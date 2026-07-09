-- meetings.meeting_date를 선택 항목으로 변경 (NOT NULL 제약 해제)
ALTER TABLE public.meetings ALTER COLUMN meeting_date DROP NOT NULL;
