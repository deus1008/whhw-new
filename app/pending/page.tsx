import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';

export default async function PendingPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error('[pending:getUser error]', userError);
  }

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user!.id)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[pending:getProfile error]', profileError);
  }

  const status = profile?.status ?? 'pending';

  if (status === 'approved') {
    redirect('/dashboard');
  }

  const isRejected = status === 'rejected';

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
          판매대행사업
        </p>

        <div className="auth-card">
          {isRejected ? (
            <>
              <h1 className="auth-title">접근 거부됨</h1>
              <div className="auth-error" style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>접근이 거부되었습니다.</p>
                <p style={{ fontSize: '0.85rem' }}>관리자에게 문의하세요.</p>
              </div>
            </>
          ) : (
            <>
              <h1 className="auth-title">승인 대기 중</h1>
              <div style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.22)',
                borderRadius: '10px',
                padding: '1.2rem',
                color: '#fde68a',
                marginBottom: '1.5rem',
                lineHeight: 1.6,
              }}>
                <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
                  회원가입이 완료되었습니다.
                </p>
                <p style={{ fontSize: '0.85rem', color: '#fcd34d' }}>
                  관리자 승인을 기다리고 있습니다.
                </p>
              </div>
            </>
          )}

          <p style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            marginBottom: '1.5rem',
            wordBreak: 'break-all',
          }}>
            {user!.email}
          </p>

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
            <HomeButton />
            <LogoutButton />
          </div>
        </div>
      </div>
    </>
  );
}
