import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_EMAIL } from '@/lib/constants';
import LogoutButton from '@/components/LogoutButton';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error('[dashboard:getUser error]', userError);
  }

  if (!user) {
    redirect('/login');
  }

  const isAdmin = user!.email === ADMIN_EMAIL;

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full px-4" style={{ maxWidth: '460px' }}>
        <p
          className="domain"
          style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: 'clamp(1.6rem, 5vw, 2.4rem)' }}
        >
          WHHW.co.kr
        </p>
        <div className="auth-card">
          <h1 className="auth-title">대시보드</h1>
          <div className="auth-success" style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              ✓ 로그인 상태
            </p>
            <p style={{ fontSize: '0.88rem', wordBreak: 'break-all' }}>
              <strong>{user!.email}</strong> 로 로그인됨
            </p>
          </div>

          {isAdmin && (
            <div style={{ marginBottom: '1.2rem', textAlign: 'center' }}>
              <Link
                href="/admin"
                style={{
                  display: 'inline-block',
                  padding: '0.45rem 1.1rem',
                  borderRadius: '8px',
                  background: 'rgba(162,89,255,0.12)',
                  border: '1px solid rgba(162,89,255,0.28)',
                  color: '#c084fc',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'opacity 0.2s',
                }}
              >
                관리자 페이지 →
              </Link>
            </div>
          )}

          <LogoutButton />
        </div>
      </div>
    </>
  );
}
