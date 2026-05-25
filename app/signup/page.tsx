'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function SignupPage() {
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [status, setStatus]     = useState<Status>('idle');
  const [message, setMessage]   = useState('');

  function validate(): string | null {
    if (password.length < 8) return '비밀번호는 최소 8자 이상이어야 합니다.';
    if (password !== confirm)  return '비밀번호가 일치하지 않습니다.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      setStatus('error');
      setMessage(validationError);
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error) {
        console.error('[signUp error]', error);
        setStatus('error');
        setMessage(error.message);
        return;
      }

      console.log('[signUp success]', data);
      setStatus('success');

      // identities가 빈 배열이면 이미 가입된 이메일 (Supabase "fake" 성공 응답)
      if (data.user?.identities?.length === 0) {
        setStatus('error');
        setMessage('이미 가입된 이메일 주소입니다.');
        return;
      }

      setMessage(
        data.session
          ? '회원가입이 완료됐습니다.'
          : '이메일 인증 링크를 발송했습니다.\n받은 편지함을 확인해 인증을 완료하세요.',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[signUp unexpected]', err);
      setStatus('error');
      setMessage(msg);
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
          판매대행사업
        </p>

        <div className="auth-card">
          <h1 className="auth-title">회원가입</h1>
          <p className="auth-subtitle">이메일과 비밀번호로 계정을 만드세요.</p>

          {status === 'success' ? (
            <div className="auth-success">
              <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                ✓ 회원가입 성공
              </p>
              <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {status === 'error' && (
                <div className="auth-error">{message}</div>
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
                <label className="auth-label" htmlFor="password">
                  비밀번호{' '}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>
                    (최소 8자)
                  </span>
                </label>
                <input
                  id="password"
                  type="password"
                  className="auth-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="confirm">비밀번호 확인</label>
                <input
                  id="confirm"
                  type="password"
                  className="auth-input"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner" />
                    처리 중…
                  </>
                ) : (
                  '회원가입'
                )}
              </button>
            </form>
          )}
          <div className="auth-divider" />
          <p className="auth-footer">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="auth-link">로그인</Link>
          </p>
        </div>
      </div>
    </>
  );
}
