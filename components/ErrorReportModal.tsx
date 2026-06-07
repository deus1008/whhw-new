'use client';

import { useState, useTransition, useRef } from 'react';
import { submitErrorReport } from '@/app/errors/actions';

export default function ErrorReportModal({ onClose }: { onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setError('');

    startTransition(async () => {
      const res = await submitErrorReport(fd);
      if (res.error) { setError(res.error); return; }
      setSuccess(true);
      setTimeout(onClose, 1800);
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.8rem',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '9px', color: 'var(--text-primary)',
    fontSize: '0.88rem', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: '1rem',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(239,68,68,0.25)',
        borderRadius: '18px',
        padding: '2rem',
        width: '100%', maxWidth: '500px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.4rem' }}>
          <span style={{ fontSize: '1.4rem' }}>🐛</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              오류 신고
            </h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              관리자에게 오류 내용이 전달됩니다
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', padding: '0.3rem 0.5rem', borderRadius: '6px',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem',
            }}
          >✕</button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>✅</div>
            <p style={{ color: '#4ade80', fontWeight: 700, fontSize: '1rem' }}>전송 완료!</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.3rem' }}>
              관리자가 확인 후 조치할 예정입니다.
            </p>
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                제목 <span style={{ color: '#f87171' }}>*</span>
              </label>
              <input
                name="title"
                placeholder="예: 수수료 시뮬레이션 결과가 표시되지 않음"
                style={inputStyle}
                required
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                오류 내용 <span style={{ color: '#f87171' }}>*</span>
              </label>
              <textarea
                name="content"
                rows={5}
                placeholder={'어떤 페이지에서 어떤 상황에 발생했는지 상세히 적어주세요.\n\n예)\n- 페이지: 수수료 시뮬레이션\n- 증상: 검색 후 결과가 비어 있음\n- 재현 방법: 암로디핀 검색 시 항상 발생'}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                required
              />
            </div>

            {error && (
              <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: 0 }}>⚠ {error}</p>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={{
                padding: '0.55rem 1.2rem', borderRadius: '8px', fontSize: '0.85rem',
                border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}>취소</button>
              <button type="submit" disabled={pending} style={{
                padding: '0.55rem 1.4rem', borderRadius: '8px', fontSize: '0.85rem',
                border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.18)',
                color: '#fca5a5', cursor: pending ? 'not-allowed' : 'pointer', fontWeight: 700,
              }}>
                {pending ? '전송 중…' : '🐛 신고하기'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
