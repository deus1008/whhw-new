'use client';

import { useState, useTransition, useRef } from 'react';
import { updateErrorReport, type ErrorReport } from '@/app/errors/actions';

const STATUS_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  '접수':  { color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   label: '접수' },
  '처리중': { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)',  label: '처리중' },
  '완료':  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)',  label: '완료' },
};

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ── 개별 신고 카드 ──────────────────────────────── */
function ReportCard({ report, onUpdated }: { report: ErrorReport; onUpdated: (r: ErrorReport) => void }) {
  const [expanded,   setExpanded]  = useState(false);
  const [editing,    setEditing]   = useState(false);
  const [pending,    startTrans]   = useTransition();
  const [err,        setErr]       = useState('');
  const [emailResult, setEmailResult] = useState<'sent' | 'failed' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const meta = STATUS_META[report.status] ?? STATUS_META['접수'];

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setErr('');
    setEmailResult(null);
    startTrans(async () => {
      const res = await updateErrorReport(fd);
      if (res.error) { setErr(res.error); return; }
      if (fd.get('send_email') === '1') {
        setEmailResult(res.emailSent ? 'sent' : 'failed');
      }
      onUpdated({
        ...report,
        status:        fd.get('status') as ErrorReport['status'],
        admin_comment: (fd.get('admin_comment') as string)?.trim() || null,
        updated_at:    new Date().toISOString(),
      });
      setEditing(false);
    });
  }

  return (
    <div style={{
      background: 'rgba(15,23,42,0.6)',
      border: `1px solid ${meta.border}`,
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: '12px',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* 요약 행 */}
      <div
        style={{ padding: '1rem 1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* 상태 배지 */}
        <span style={{
          flexShrink: 0, marginTop: '0.1rem',
          padding: '0.18rem 0.65rem', borderRadius: '100px',
          fontSize: '0.7rem', fontWeight: 700,
          background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color,
        }}>
          {meta.label}
        </span>

        {/* 제목 + 메타 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            {report.title}
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
            <span>📅 {fmt(report.created_at)}</span>
            {report.reporter_email && <span>✉ {report.reporter_email}</span>}
            {report.admin_comment  && <span style={{ color: '#4ade80' }}>✔ 조치완료</span>}
          </div>
        </div>

        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* 상세 펼침 */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* 오류 내용 */}
          <div>
            <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>오류 내용</div>
            <div style={{
              background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
              padding: '0.75rem 1rem', fontSize: '0.83rem',
              color: 'var(--text-secondary)', lineHeight: 1.65, whiteSpace: 'pre-wrap',
            }}>
              {report.content}
            </div>
          </div>

          {/* 기존 조치결과 (편집 모드가 아닐 때) */}
          {!editing && report.admin_comment && (
            <div>
              <div style={{ fontSize: '0.73rem', fontWeight: 600, color: '#4ade80', marginBottom: '0.4rem' }}>조치 결과</div>
              <div style={{
                background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)',
                borderRadius: '8px', padding: '0.75rem 1rem',
                fontSize: '0.83rem', color: '#86efac', lineHeight: 1.65, whiteSpace: 'pre-wrap',
              }}>
                {report.admin_comment}
              </div>
            </div>
          )}

          {/* 편집 폼 */}
          {editing ? (
            <form ref={formRef} onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <input type="hidden" name="id" value={report.id} />

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['접수','처리중','완료'] as const).map(s => {
                  const sm = STATUS_META[s];
                  return (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                      <input
                        type="radio" name="status" value={s}
                        defaultChecked={report.status === s}
                        style={{ accentColor: sm.color }}
                      />
                      <span style={{
                        padding: '0.2rem 0.7rem', borderRadius: '100px', fontSize: '0.75rem',
                        fontWeight: 600, background: sm.bg, border: `1px solid ${sm.border}`, color: sm.color,
                      }}>{s}</span>
                    </label>
                  );
                })}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  조치 결과 입력
                </label>
                <textarea
                  name="admin_comment"
                  defaultValue={report.admin_comment ?? ''}
                  rows={4}
                  placeholder="조치한 내용을 입력하세요..."
                  style={{
                    width: '100%', padding: '0.6rem 0.8rem', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.85rem',
                    fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6,
                  }}
                />
              </div>

              {err && <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>⚠ {err}</p>}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                {/* 메일 발송 체크박스 */}
                {report.reporter_email && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      name="send_email"
                      value="1"
                      defaultChecked
                      style={{ accentColor: '#818cf8', width: 14, height: 14 }}
                    />
                    조치결과 메일 발송
                    <span style={{ color: '#a5b4fc', fontSize: '0.7rem' }}>({report.reporter_email})</span>
                  </label>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                  <button type="button" onClick={() => setEditing(false)} style={{
                    padding: '0.45rem 1rem', borderRadius: '7px', fontSize: '0.82rem',
                    border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                    color: 'var(--text-muted)', cursor: 'pointer',
                  }}>취소</button>
                  <button type="submit" disabled={pending} style={{
                    padding: '0.45rem 1.2rem', borderRadius: '7px', fontSize: '0.82rem', fontWeight: 700,
                    border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.15)',
                    color: '#4ade80', cursor: pending ? 'not-allowed' : 'pointer',
                  }}>
                    {pending ? '저장 중…' : '✔ 저장'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setEditing(true); setEmailResult(null); }}
                style={{
                  padding: '0.4rem 1rem', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 600,
                  border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)',
                  color: '#a5b4fc', cursor: 'pointer',
                }}
              >
                ✏️ {report.admin_comment ? '조치결과 수정' : '조치결과 입력'}
              </button>
              {emailResult === 'sent' && (
                <span style={{ fontSize: '0.75rem', color: '#4ade80' }}>✉ 메일 발송 완료</span>
              )}
              {emailResult === 'failed' && (
                <span style={{ fontSize: '0.75rem', color: '#fca5a5' }}>⚠ 메일 발송 실패 (API 키 확인)</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────── */
export default function ErrorsClient({ initialReports }: { initialReports: ErrorReport[] }) {
  const [reports,    setReports]    = useState<ErrorReport[]>(initialReports);
  const [statusFilter, setFilter]  = useState<string>('전체');

  function handleUpdated(updated: ErrorReport) {
    setReports(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  const counts = {
    전체: reports.length,
    접수:  reports.filter(r => r.status === '접수').length,
    처리중: reports.filter(r => r.status === '처리중').length,
    완료:  reports.filter(r => r.status === '완료').length,
  };

  const filtered = statusFilter === '전체'
    ? reports
    : reports.filter(r => r.status === statusFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* 요약 통계 */}
      <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
        {(['전체','접수','처리중','완료'] as const).map(s => {
          const sm   = s === '전체' ? { color: '#c4b5fd', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.25)' } : STATUS_META[s];
          const isOn = statusFilter === s;
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              flex: '1 1 100px', padding: '0.8rem 1rem', borderRadius: '12px', cursor: 'pointer',
              background: isOn ? sm.bg : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isOn ? sm.border : 'rgba(255,255,255,0.08)'}`,
              color: isOn ? sm.color : 'var(--text-muted)',
              textAlign: 'left', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: isOn ? sm.color : 'var(--text-secondary)', lineHeight: 1 }}>
                {counts[s]}
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '0.3rem' }}>{s}</div>
            </button>
          );
        })}
      </div>

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          접수된 오류 신고가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {filtered.map(r => (
            <ReportCard key={r.id} report={r} onUpdated={handleUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}
