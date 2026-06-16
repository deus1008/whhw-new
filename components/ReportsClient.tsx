'use client';

import { useState, useTransition } from 'react';
import type { CSSProperties } from 'react';
import { createReport, updateReport, deleteReport } from '@/app/reports/actions';

type Report = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function preview(content: string, len = 120) {
  return content.replace(/#+\s/g, '').replace(/\*+/g, '').replace(/\n/g, ' ').trim().slice(0, len) + (content.length > len ? '…' : '');
}

// ── 작성/수정 모달 ────────────────────────────────────────────────────────────
function ReportModal({ initial, onClose, onDone }: {
  initial?: Report;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title,   setTitle]   = useState(initial?.title   ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [error,   setError]   = useState<string | null>(null);
  const [isPending, start]    = useTransition();

  const canSave = title.trim().length > 0 && content.trim().length > 0 && !isPending;

  function handleSave() {
    if (!canSave) return;
    setError(null);
    start(async () => {
      const res = initial
        ? await updateReport(initial.id, { title, content })
        : await createReport({ title, content });
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  const iStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem',
    borderRadius: '8px', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
    fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '720px', margin: '1rem', borderRadius: '16px', background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', padding: '1.5rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          {initial ? '리포트 수정' : '새 분석 리포트'}
        </h2>

        {error && (
          <div style={{ padding: '0.7rem 1rem', borderRadius: '8px', marginBottom: '0.9rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.82rem' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ marginBottom: '0.9rem' }}>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 0.3rem', letterSpacing: '0.04em' }}>제목 *</p>
          <input
            type="text"
            placeholder="리포트 제목"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={iStyle}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 0.3rem', letterSpacing: '0.04em' }}>
            내용 * <span style={{ color: 'rgba(255,255,255,0.25)' }}>— Claude 분석 결과를 마크다운 그대로 붙여넣기</span>
          </p>
          <textarea
            placeholder="# 제목&#10;&#10;## 섹션&#10;&#10;Claude에서 분석한 내용을 그대로 붙여넣으세요…"
            value={content}
            onChange={e => setContent(e.target.value)}
            style={{ ...iStyle, flex: 1, minHeight: '320px', resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={isPending} style={{
            padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
          }}>취소</button>
          <button onClick={handleSave} disabled={!canSave} style={{
            padding: '0.55rem 1.3rem', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600,
            background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.4)',
            color: '#60a5fa', cursor: canSave ? 'pointer' : 'not-allowed', opacity: isPending ? 0.7 : 1,
          }}>
            {isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ReportsClient({
  reports,
  isAdmin,
}: {
  reports: Report[];
  isAdmin: boolean;
}) {
  const [modal, setModal] = useState<null | 'create' | Report>(null);
  const [, start] = useTransition();

  function handleDelete(r: Report) {
    if (!confirm(`"${r.title}" 리포트를 삭제하시겠습니까?`)) return;
    start(async () => { await deleteReport(r.id); });
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* 관리자: 새 리포트 버튼 */}
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setModal('create')}
            style={{
              padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600,
              background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)',
              color: '#4ade80', cursor: 'pointer',
            }}
          >+ 새 리포트 작성</button>
        </div>
      )}

      {/* 리포트 없음 */}
      {reports.length === 0 && (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>
          등록된 분석 리포트가 없습니다.
        </div>
      )}

      {/* 리포트 목록 카드 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {reports.map(r => (
          <div
            key={r.id}
            style={{
              borderRadius: '14px', padding: '1.1rem 1.25rem',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              display: 'flex', alignItems: 'center', gap: '1rem',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: '0 0 0.3rem', lineHeight: 1.3 }}>
                {r.title}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', margin: '0 0 0.5rem' }}>
                {fmtDate(r.created_at)}
                {r.updated_at !== r.created_at && ` · 수정됨 ${fmtDate(r.updated_at)}`}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.48)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview(r.content)}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <a
                href={`/reports/${r.id}`}
                style={{
                  padding: '0.4rem 0.8rem', borderRadius: '7px', fontSize: '0.78rem', fontWeight: 600,
                  background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)',
                  color: '#60a5fa', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >열람</a>
              {isAdmin && (
                <>
                  <button
                    onClick={() => setModal(r)}
                    style={{
                      padding: '0.4rem 0.8rem', borderRadius: '7px', fontSize: '0.78rem',
                      background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
                      color: '#fbbf24', cursor: 'pointer',
                    }}
                  >수정</button>
                  <button
                    onClick={() => handleDelete(r)}
                    style={{
                      padding: '0.4rem 0.8rem', borderRadius: '7px', fontSize: '0.78rem',
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                      color: '#f87171', cursor: 'pointer',
                    }}
                  >삭제</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 모달 */}
      {modal && (
        <ReportModal
          initial={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); window.location.reload(); }}
        />
      )}
    </div>
  );
}
