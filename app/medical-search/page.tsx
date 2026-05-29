import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import MedicalSearchClient from '@/components/MedicalSearchClient';

export default async function MedicalSearchPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  const apiConfigured = !!(process.env.MEDICAL_API_KEY ?? process.env.DRUG_API_KEY);

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '1000px', paddingTop: '2.5rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          판매대행사업
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <Link href="/dashboard" style={navLinkStyle}>← 대시보드</Link>
          <LogoutButton compact />
        </div>

        <MedicalSearchClient apiConfigured={apiConfigured} />
      </div>
    </>
  );
}

const navLinkStyle: React.CSSProperties = {
  padding: '0.35rem 0.9rem',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  color: 'var(--text-muted)',
  fontSize: '0.8rem',
  fontWeight: 500,
  textDecoration: 'none',
};
