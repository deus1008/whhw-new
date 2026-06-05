-- 역할 구분 업데이트: admin/uploader/member → 8가지 역할로 확장
-- 기존 데이터 마이그레이션 후 컬럼 유형 변경

-- 기존 역할 → 신규 역할 매핑
UPDATE profiles SET role = '관리자'   WHERE role = 'admin';
UPDATE profiles SET role = '영업관리' WHERE role = 'uploader';
UPDATE profiles SET role = '지역장'   WHERE role = 'member';
-- 매핑되지 않은 나머지 → 지역장
UPDATE profiles SET role = '지역장'   WHERE role NOT IN ('관리자','영업관리','지역장','사업부장','사업총괄','PM','마케팅총괄','영업관리총괄');
