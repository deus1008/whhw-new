import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import MeetingDetailClient from '@/components/MeetingDetailClient';
import { getMeeting, getUserAccessLevels } from '../actions';
import { profileIsAdmin } from '@/lib/roles';
import type { TaskSecurity } from '../types';

export const revalidate = 0;

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('status, role, roles').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const meeting = await getMeeting(id);
  if (!meeting) notFound();

  const isAdmin = profileIsAdmin(profile);
  const sl = (meeting.security_level ?? '공개') as TaskSecurity;

  if (!isAdmin && sl !== '공개') {
    const userLevels = await getUserAccessLevels(user.id);
    if (!userLevels.includes(sl)) {
      // 접근 불가 → 목록으로 리다이렉트
      redirect('/meetings?denied=1');
    }
  }

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '900px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <a
            href="/meetings"
            style={{
              fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', textDecoration: 'none',
              padding: '0.3rem 0.75rem', borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
            }}
          >
            ← Task 목록
          </a>
          <LogoutButton compact />
        </div>

        <MeetingDetailClient meeting={meeting} isAdmin={isAdmin} />
      </div>
    </>
  );
}
