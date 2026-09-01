-- 성분명 정규화 버그 수정:
-- 기존 '\s*[0-9].*$'는 앞 공백 0개도 허용해, 이름이 숫자로 시작하면(예: '25% ethanol soft extract (3.5→1), celecoxib')
-- 문자열 전체가 삭제되어 성분명이 빈칸으로 표시됨(다처방성분 표 10위 등).
-- '\s+[0-9].*$'로 변경 → 뒤쪽 용량(' 200mg' 등) 제거는 유지하되, 숫자로 시작하는 복합제명은 보존.
-- (functional index 미사용 → REINDEX 불필요)
CREATE OR REPLACE FUNCTION public.norm_ingredient(s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(lower(regexp_replace(regexp_replace(coalesce(s,''), '\[[^\]]*\]', '', 'g'), '\s+[0-9].*$', '')));
$$;
