import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import MeetingsClient from '@/components/MeetingsClient';
import { getMeetings, getUserAccessLevels } from './actions';
import { profileIsAdmin } from '@/lib/roles';
import type { TaskSecurity } from './types';

export const revalidate = 0;

export default async function MeetingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('status, role, roles').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin = profileIsAdmin(profile);
  const [meetings, userLevels] = await Promise.all([
    getMeetings(),
    isAdmin ? Promise.resolve(['공개', '내부', '기밀'] as TaskSecurity[]) : getUserAccessLevels(user.id),
  ]);

  // 서버에서 접근권한 체크: 접근 불가 Task는 제목·내용을 마스킹
  const safeMeetings = meetings.map(m => {
    const sl = m.security_level ?? '공개';
    const accessible = isAdmin || userLevels.includes(sl as TaskSecurity);
    if (accessible) return { ...m, accessible: true };
    return { ...m, title: '', content: '', todos: [], accessible: false };
  });

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1000px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          Task
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        <p style={{
          textAlign: 'center', fontSize: '0.75rem',
          color: 'rgba(251,191,36,0.7)',
          background: 'rgba(251,191,36,0.07)',
          border: '1px solid rgba(251,191,36,0.18)',
          borderRadius: '8px', padding: '0.5rem 1rem',
          marginBottom: '1.25rem',
        }}>
          🔒 회의내용은 사용자 업무참조에만 활용하고, 내/외부 유출은 금지합니다.
        </p>

        <MeetingsClient meetings={safeMeetings} isAdmin={isAdmin} />
      </div>
    </>
  );
}
