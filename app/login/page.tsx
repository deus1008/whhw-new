'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_EMAIL } from '@/lib/constants';

type Status = 'idle' | 'loading' | 'error';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus]     = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionChecking, setSessionChecking] = useState(true);

  const router = useRouter();

  // 페이지 로드 시 현재 세션 확인 — 이미 로그인이면 status에 따라 분기
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession()
      .then(async ({ data, error }) => {
        if (error) {
          console.error('[getSession error]', error);
        }
        if (data.session) {
          const user = data.session.user;
          if (user.email === ADMIN_EMAIL) {
            router.replace('/admin');
            return;
          }
          const { data: profile } = await supabase
            .from('profiles')
            .select('status')
            .eq('id', user.id)
            .single();
          if (profile?.status === 'approved') {
            router.replace('/dashboard');
          } else {
            router.replace('/pending');
          }
        }
      })
      .catch((err: unknown) => {
        console.error('[getSession unexpected]', err);
      })
      .finally(() => setSessionChecking(false));
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.error('[signInWithPassword error]', error);
        setStatus('error');
        setErrorMsg(error.message);
        return;
      }

      console.log('[signIn success]', data);
      const user = data.user!;
      if (user.email === ADMIN_EMAIL) {
        router.push('/admin');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .single();
      if (profile?.status === 'approved') {
        router.push('/dashboard');
      } else {
        router.push('/pending');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[signIn unexpected]', err);
      setStatus('error');
      setErrorMsg(msg);
    }
  }

  const loading = status === 'loading';

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
          {sessionChecking ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
              세션 확인 중…
            </p>
          ) : (
            <>
              <h1 className="auth-title">로그인</h1>
              <p className="auth-subtitle">이메일과 비밀번호로 로그인하세요.</p>

              <form onSubmit={handleLogin} noValidate>
                {status === 'error' && (
                  <div className="auth-error">{errorMsg}</div>
                )}

                <div className="auth-field">
                  <label className="auth-label" htmlFor="email">이메일</label>
                  <input
                    id="email"
                    type="email"
                    className="auth-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="password">비밀번호</label>
                  <input
                    id="password"
                    type="password"
                    className="auth-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>

                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading ? (
                    <><span className="spinner" />처리 중…</>
                  ) : '로그인'}
                </button>
              </form>

              <div className="auth-divider" />
              <p className="auth-footer">
                계정이 없으신가요?{' '}
                <Link href="/signup" className="auth-link">회원가입</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
