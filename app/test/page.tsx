'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Status = 'idle' | 'loading' | 'success' | 'error';

interface Result {
  status: Status;
  session: unknown;
  error: string | null;
}

export default function SupabaseTestPage() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const [result, setResult] = useState<Result>({
    status: 'idle',
    session: null,
    error: null,
  });

  useEffect(() => {
    setResult(prev => ({ ...prev, status: 'loading' }));

    const supabase = createClient();
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          setResult({ status: 'error', session: null, error: error.message });
        } else {
          setResult({ status: 'success', session: data.session, error: null });
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setResult({ status: 'error', session: null, error: msg });
      });
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f1117',
      color: '#e2e8f0',
      fontFamily: 'monospace',
      padding: '2rem',
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem', color: '#94a3b8' }}>
        Supabase 연결 진단
      </h1>

      {/* 환경변수 */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: '#64748b', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          환경변수
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <EnvRow label="NEXT_PUBLIC_SUPABASE_URL" present={hasUrl} />
          <EnvRow label="NEXT_PUBLIC_SUPABASE_ANON_KEY" present={hasKey} />
        </div>
      </section>

      {/* 연결 결과 */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: '#64748b', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          연결 결과
        </h2>

        {result.status === 'idle' || result.status === 'loading' ? (
          <p style={{ color: '#94a3b8', fontSize: '1.1rem' }}>
            {result.status === 'idle' ? '대기 중...' : '연결 시도 중...'}
          </p>
        ) : result.status === 'success' ? (
          <div>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e', marginBottom: '1rem' }}>
              ✓ 연결 성공
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>
              getSession() 응답:
            </p>
            <pre style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '1rem',
              fontSize: '0.85rem',
              color: '#cbd5e1',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {JSON.stringify(result.session, null, 2) ?? 'null (로그인된 세션 없음 — 정상)'}
            </pre>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', marginBottom: '1rem' }}>
              ✗ 연결 실패
            </p>
            <p style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>
              에러 전문:
            </p>
            <pre style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '1rem',
              fontSize: '0.85rem',
              color: '#fca5a5',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {result.error}
            </pre>
          </div>
        )}
      </section>

      {/* 환경변수 누락 경고 */}
      {(!hasUrl || !hasKey) && (
        <section style={{
          backgroundColor: '#422006',
          border: '1px solid #92400e',
          borderRadius: '8px',
          padding: '1rem',
          color: '#fcd34d',
          fontSize: '0.9rem',
          lineHeight: 1.6,
        }}>
          <strong>⚠ 환경변수가 없습니다.</strong><br />
          <code>.env.local</code> 파일에 Supabase URL과 Anon Key를 채워 넣고
          dev 서버를 재시작하세요.
        </section>
      )}
    </div>
  );
}

function EnvRow({ label, present }: { label: string; present: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{
        display: 'inline-block',
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        backgroundColor: present ? '#22c55e' : '#ef4444',
        flexShrink: 0,
      }} />
      <code style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{label}</code>
      <span style={{ color: present ? '#22c55e' : '#ef4444', fontSize: '0.85rem' }}>
        {present ? '있음' : '없음 (비어있음)'}
      </span>
    </div>
  );
}
