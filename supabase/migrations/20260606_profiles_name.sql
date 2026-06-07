-- profiles 테이블에 이름 컬럼 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
