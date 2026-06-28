import { createClient } from './supabase/server';
import { profileIsAdmin } from './roles';

export type SessionProfile = {
  id: string;
  company_id: string | null;
  isAdmin: boolean;
};

/** 현재 로그인 사용자의 프로필을 반환합니다. 미승인/미인증이면 null. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, roles, company_id, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') return null;

  return {
    id: user.id,
    company_id: (profile.company_id as string) ?? null,
    isAdmin: profileIsAdmin(profile),
  };
}
