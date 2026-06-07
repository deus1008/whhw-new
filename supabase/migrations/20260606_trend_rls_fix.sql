-- trend_prescriptions RLS 정책을 신규 역할명으로 업데이트
-- 기존 정책 삭제 후 재생성

DROP POLICY IF EXISTS "trend_uploader_insert" ON trend_prescriptions;
DROP POLICY IF EXISTS "trend_admin_delete"    ON trend_prescriptions;

-- service_role 전용 insert/delete 정책 (코드에서는 service role key 사용)
CREATE POLICY "trend_service_all" ON trend_prescriptions FOR ALL USING (true);
