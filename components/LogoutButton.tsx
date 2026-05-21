'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLogout() {
    setLoading(true);
    setErrorMsg('');

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('[signOut error]', error);
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      router.push('/login');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[signOut unexpected]', err);
      setErrorMsg(msg);
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <button
        onClick={handleLogout}
        disabled={loading}
        style={{
          padding: '0.35rem 0.9rem',
          borderRadius: '7px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text-muted)',
          fontSize: '0.75rem',
          fontWeight: 500,
          cursor: 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? '처리 중…' : '로그아웃'}
      </button>
    );
  }

  return (
    <>
      {errorMsg && (
        <div className="auth-error" style={{ marginBottom: '1rem' }}>{errorMsg}</div>
      )}
      <button className="auth-btn" onClick={handleLogout} disabled={loading}>
        {loading ? (
          <><span className="spinner" />처리 중…</>
        ) : '로그아웃'}
      </button>
    </>
  );
}
