'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import HomeButton from '@/components/HomeButton';
import { setProfileOnSignup } from './actions';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function SignupPage() {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [fullName,    setFullName]    = useState('');
  const [phone,       setPhone]       = useState('');
  const [companyName, setCompanyName] = useState('');

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 3)  return digits;
    if (digits.startsWith('02')) {
      if (digits.length <= 6)  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
      if (digits.length <= 9)  return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    if (digits.length <= 6)  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  function isValidMobilePhone(p: string): boolean {
    const digits = p.replace(/\D/g, '');
    return /^01[016789]\d{7,8}$/.test(digits);
  }
  const [status,      setStatus]      = useState<Status>('idle');
  const [message,     setMessage]     = useState('');

  function validate(): string | null {
    if (!fullName.trim())                        return '성명을 입력해주세요.';
    if (phone.trim() && !isValidMobilePhone(phone)) return '문자 수신이 가능한 휴대폰 번호를 입력해주세요. (예: 010-1234-5678)';
    if (password.length < 8)                     return '비밀번호는 최소 8자 이상이어야 합니다.';
    if (password !== confirm)                     return '비밀번호가 일치하지 않습니다.';
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name:    fullName.trim(),
            phone:        phone.trim()       || null,
            company_name: companyName.trim() || null,
          },
        },
      });

      if (error) {
        console.error('[signUp error]', error);
        setStatus('error');
        setMessage(error.message);
        return;
      }

      // identities가 빈 배열이면 이미 가입된 이메일 (Supabase "fake" 성공 응답)
      if (data.user?.identities?.length === 0) {
        setStatus('error');
        setMessage('이미 가입된 이메일 주소입니다.');
        return;
      }

      // profiles.full_name 즉시 업데이트 (트리거 유무와 무관하게 확실히 저장)
      if (data.user?.id) {
        await setProfileOnSignup(data.user.id, fullName);
      }

      setStatus('success');
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
          style={{ textAlign: 'center', marginBottom: '0.8rem', fontSize: 'clamp(1.6rem, 5vw, 2.4rem)' }}
        >
          판매대행사업
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <HomeButton />
        </div>

        <div className="auth-card">
          <h1 className="auth-title">회원가입</h1>
          <p className="auth-subtitle">아래 정보를 입력해 계정을 신청하세요.</p>

          {status === 'success' ? (
            <div className="auth-success">
              <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                ✓ 가입 신청 완료
              </p>
              <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {status === 'error' && (
                <div className="auth-error">{message}</div>
              )}

              {/* ── 기본 정보 ── */}
              <div className="auth-field">
                <label className="auth-label" htmlFor="fullName">
                  성명 <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  id="fullName"
                  type="text"
                  className="auth-input"
                  placeholder="홍길동"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="name"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="phone">
                  전화번호
                  <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    (문자메시지 수신 가능한 휴대폰 번호)
                  </span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  className="auth-input"
                  placeholder="010-0000-0000"
                  value={phone}
                  onChange={e => setPhone(formatPhone(e.target.value))}
                  disabled={loading}
                  autoComplete="tel"
                  inputMode="numeric"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="companyName">위탁사명</label>
                <input
                  id="companyName"
                  type="text"
                  className="auth-input"
                  placeholder="소속 위탁제약사명"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  disabled={loading}
                />
              </div>

              {/* ── 계정 정보 ── */}
              <div className="auth-field" style={{ marginTop: '0.25rem' }}>
                <label className="auth-label" htmlFor="email">
                  이메일 <span style={{ color: '#f87171' }}>*</span>
                </label>
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
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>(최소 8자)</span>{' '}
                  <span style={{ color: '#f87171' }}>*</span>
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
                <label className="auth-label" htmlFor="confirm">
                  비밀번호 확인 <span style={{ color: '#f87171' }}>*</span>
                </label>
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
                  '가입 신청'
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
