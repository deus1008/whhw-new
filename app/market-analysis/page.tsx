import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import MarketAnalysisClient from '@/components/MarketAnalysisClient';

export default async function MarketAnalysisPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '900px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          시장분석
        </p>
        <div className="page-nav">
          <HomeButton />
          <LogoutButton compact />
        </div>

        <MarketAnalysisClient />
      </div>
    </>
  );
}
