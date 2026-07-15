export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { profileIsAdmin } from '@/lib/roles';

/**
 * /disease-learning/admin 하위 전체를 관리자로 제한한다.
 * 하위가 모두 동일 권한(관리자)이라 레이아웃에서 한 번 막는 것으로 충분하다.
 *
 * 주의: 이 가드는 화면 노출을 막을 뿐 보안 경계가 아니다. 실제 경계는 각
 * API 라우트(/api/admin/*)와 서버 액션의 권한 확인이며 그쪽은 그대로 유지한다.
 */
export default async function DiseaseLearningAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, roles, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');
  if (!profileIsAdmin(profile)) redirect('/disease-learning');

  return <>{children}</>;
}
