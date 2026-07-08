-- trend_prescriptions 고아 데이터 정리
-- documents(EDI 폴더)에 더 이상 존재하지 않는 source_file의 처방 데이터를 삭제합니다.
DELETE FROM public.trend_prescriptions
WHERE source_file IS NOT NULL
  AND source_file NOT IN (
    SELECT filename FROM public.documents WHERE category = 'EDI'
  );
