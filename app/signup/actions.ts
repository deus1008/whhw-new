'use server';

import { createClient as createSvc } from '@supabase/supabase-js';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** 회원가입 직후 profiles.full_name 업데이트 (트리거가 비어 있을 수 있으므로 명시적으로 처리) */
export async function setProfileOnSignup(userId: string, fullName: string): Promise<void> {
  if (!userId || !fullName.trim()) return;
  await svc()
    .from('profiles')
    .update({ full_name: fullName.trim() })
    .eq('id', userId);
}
