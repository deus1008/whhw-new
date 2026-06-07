-- ============================================================
-- 역할 시스템 마이그레이션
-- Supabase SQL Editor에서 한 번 실행하세요.
-- ============================================================

-- 1. role 컬럼의 CHECK 제약 제거 (구버전 값만 허용하던 제약)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_fkey;

-- 타입이 enum이면 text로 변경
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
    AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE profiles ALTER COLUMN role TYPE text USING role::text;
  END IF;
END $$;

-- 2. 기존 역할값 신규 이름으로 마이그레이션
UPDATE profiles SET role = '관리자' WHERE role = 'admin';
UPDATE profiles SET role = '영업관리' WHERE role = 'uploader';
UPDATE profiles SET role = '지역장'  WHERE role = 'member';
-- 위에 해당하지 않는 알 수 없는 값은 지역장으로
UPDATE profiles
SET role = '지역장'
WHERE role NOT IN ('관리자','지역장','사업부장','사업총괄','PM','마케팅총괄','영업관리','영업관리총괄','옵저버');

-- 3. roles 배열 컬럼 추가 (다중 역할 지원)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS roles text[] DEFAULT ARRAY['지역장']::text[];

-- 4. roles 배열 = 현재 role 값으로 초기화
UPDATE profiles
SET roles = ARRAY[role]::text[]
WHERE role IS NOT NULL
  AND (roles IS NULL OR roles = '{}' OR roles = ARRAY['지역장']::text[]);

-- 5. 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_roles ON profiles USING GIN(roles);
