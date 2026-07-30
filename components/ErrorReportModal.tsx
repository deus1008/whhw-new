'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { submitErrorReport, getMyErrorReports, type ErrorReport } from '@/app/errors/actions';

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  '접수':  { color: '#f87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  label: '접수' },
  '처리중': { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', label: '처리중' },
  '완료':  { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)', label: '완료' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ErrorReportModal({ onClose, onSeen }: { onClose: () => void; onSeen?: () => void }) {
  const [pending, setPending] = useState(false);
  const [, startTrans] = useTransition();
  const [error,   setError]   = useState('');
  const [justSent, setJustSent] = useState(false);
  const [myReports, setMyReports] = useState<ErrorReport[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);

  const refresh = useCallback(async (markSeen: boolean) => {
    const list = await getMyErrorReports();   // 조회 = 읽음 처리
    setMyReports(list);
    setLoadingList(false);
    if (markSeen) onSeen?.();
  }, [onSeen]);

  useEffect(() => { refresh(true); }, [refresh]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setError('');
    setPending(true);
    startTrans(async () => {
      const res = await submitErrorReport(fd);
      setPending(false);
      if (res.error) { setError(res.error); return; }
      formRef.current?.reset();
      setJustSent(true);
      setTimeout(() => setJustSent(false), 2500);
      await refresh(false);
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.8rem',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '9px', color: 'var(--text-primary)', fontSize: '0.88rem',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#0f172a', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '18px',
        width: '100%', maxWidth: '600px', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1.4rem 1.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: '1.4rem' }}>🐛</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>오류 신고</h3>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>내 신고 내역과 관리자 조치결과를 확인하고, 새 오류를 신고합니다</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', padding: '0.3rem 0.5rem', borderRadius: '6px',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
        </div>

        {/* 스크롤 본문 */}
        <div style={{ overflowY: 'auto', padding: '1.2rem 1.6rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

          {/* ── 내 신고 내역 ── */}
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              📋 내 신고 내역 {myReports.length > 0 && <span style={{ color: '#a5b4fc' }}>({myReports.length})</span>}
            </div>
            {loadingList ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>불러오는 중…</p>
            ) : myReports.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)' }}>아직 신고한 내역이 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {myReports.map(r => {
                  const m = STATUS_META[r.status] ?? STATUS_META['접수'];
                  return (
                    <div key={r.id} style={{ border: `1px solid ${m.border}`, borderLeft: `3px solid ${m.color}`,
                      borderRadius: '10px', background: 'rgba(255,255,255,0.03)', padding: '0.8rem 0.9rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{ padding: '0.14rem 0.55rem', borderRadius: '100px', fontSize: '0.68rem', fontWeight: 700,
                          background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>{m.label}</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{r.title}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{fmtDate(r.created_at)}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.content}</div>

                      {r.admin_comment ? (
                        <div style={{ marginTop: '0.7rem', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.22)',
                          borderRadius: '8px', padding: '0.65rem 0.8rem' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4ade80', marginBottom: '0.3rem' }}>✔ 관리자 조치결과</div>
                          <div style={{ fontSize: '0.83rem', color: '#86efac', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{r.admin_comment}</div>
                        </div>
                      ) : (
                        <div style={{ marginTop: '0.55rem', fontSize: '0.74rem', color: 'rgba(255,255,255,0.3)' }}>⏳ 관리자 확인 중입니다.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 새 오류 신고 ── */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1.2rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.7rem' }}>➕ 새 오류 신고</div>
            {justSent && (
              <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#4ade80' }}>✅ 전송 완료 — 관리자가 확인 후 조치하면 위 내역에 표시됩니다.</p>
            )}
            <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  제목 <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input name="title" placeholder="예: 수수료 시뮬레이션 결과가 표시되지 않음" style={inputStyle} required />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  오류 내용 <span style={{ color: '#f87171' }}>*</span>
                </label>
                <textarea name="content" rows={4}
                  placeholder={'어떤 페이지에서 어떤 상황에 발생했는지 적어주세요.\n예) 페이지: 수수료 시뮬레이션 / 증상: 검색 후 결과 비어 있음'}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} required />
              </div>
              {error && <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: 0 }}>⚠ {error}</p>}
              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={onClose} style={{
                  padding: '0.55rem 1.2rem', borderRadius: '8px', fontSize: '0.85rem',
                  border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>닫기</button>
                <button type="submit" disabled={pending} style={{
                  padding: '0.55rem 1.4rem', borderRadius: '8px', fontSize: '0.85rem',
                  border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.18)',
                  color: '#fca5a5', cursor: pending ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {pending ? '전송 중…' : '🐛 신고하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
