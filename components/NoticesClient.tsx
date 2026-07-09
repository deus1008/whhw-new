'use client';

import { useState, useTransition } from 'react';
import { createNotice, updateNotice, deleteNotice } from '@/app/notices/actions';
import type { Notice } from '@/app/notices/page';

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const EMPTY = { title: '', content: '', is_pinned: false };

export default function NoticesClient({
  notices: initial,
  isAdmin,
}: {
  notices: Notice[];
  isAdmin: boolean;
}) {
  const [notices, setNotices] = useState<Notice[]>(initial);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; notice?: Notice } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setForm(EMPTY);
    setErr('');
    setModal({ mode: 'create' });
  }

  function openEdit(n: Notice) {
    setForm({ title: n.title, content: n.content, is_pinned: n.is_pinned });
    setErr('');
    setModal({ mode: 'edit', notice: n });
  }

  function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setErr('제목과 내용을 입력하세요.');
      return;
    }
    setErr('');
    startTransition(async () => {
      if (modal?.mode === 'create') {
        const res = await createNotice(form);
        if (res.error) { setErr(res.error); return; }
        const newItem: Notice = {
          id: res.id!,
          title: form.title,
          content: form.content,
          is_pinned: form.is_pinned,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setNotices(prev => {
          const next = [newItem, ...prev];
          return next.sort((a, b) => (+b.is_pinned - +a.is_pinned) || (b.created_at > a.created_at ? 1 : -1));
        });
      } else if (modal?.notice) {
        const res = await updateNotice(modal.notice.id, form);
        if (res.error) { setErr(res.error); return; }
        setNotices(prev => {
          const next = prev.map(n =>
            n.id === modal.notice!.id
              ? { ...n, title: form.title, content: form.content, is_pinned: form.is_pinned, updated_at: new Date().toISOString() }
              : n
          );
          return next.sort((a, b) => (+b.is_pinned - +a.is_pinned) || (b.created_at > a.created_at ? 1 : -1));
        });
      }
      setModal(null);
    });
  }

  function handleDelete(id: string) {
    if (!confirm('공지사항을 삭제할까요?')) return;
    startTransition(async () => {
      const res = await deleteNotice(id);
      if (res.error) { alert(res.error); return; }
      setNotices(prev => prev.filter(n => n.id !== id));
    });
  }

  const handleSearch = () => setAppliedQuery(query);

  const aq       = appliedQuery.trim().toLowerCase();
  const filtered = aq
    ? notices.filter(n =>
        n.title.toLowerCase().includes(aq) ||
        n.content.toLowerCase().includes(aq)
      )
    : notices;

  const pinned  = filtered.filter(n => n.is_pinned);
  const regular = filtered.filter(n => !n.is_pinned);
  const total   = notices.length;

  return (
    <>
      {/* 검색 + 관리자 작성 버튼 */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{
            position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
            fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
          }}>🔍</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="제목 또는 내용 검색"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: '2.2rem', paddingRight: query ? '2rem' : '0.8rem',
              paddingTop: '0.5rem', paddingBottom: '0.5rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setAppliedQuery(''); }}
              style={{
                position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
                cursor: 'pointer', fontSize: '0.85rem', padding: '2px 4px',
              }}
            >✕</button>
          )}
        </div>
        <button onClick={handleSearch} style={{ ...BTN_PRIMARY, flexShrink: 0 }}>검색</button>
        {isAdmin && (
          <button onClick={openCreate} style={{ ...BTN_PRIMARY, flexShrink: 0 }}>+ 공지 작성</button>
        )}
      </div>

      {/* 검색 결과 카운트 */}
      {aq && (
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.5rem' }}>
          &quot;{appliedQuery}&quot; 검색 결과 {filtered.length}건 / 전체 {total}건
        </div>
      )}

      {/* 카드 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {notices.length === 0 && (
          <div style={{ padding: '3rem 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.88rem' }}>
            등록된 공지사항이 없습니다.
          </div>
        )}
        {aq && filtered.length === 0 && notices.length > 0 && (
          <div style={{ padding: '2.5rem 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.88rem' }}>
            검색 결과가 없습니다.
          </div>
        )}

        {pinned.map(n => (
          <NoticeCard
            key={n.id}
            notice={n}
            isAdmin={isAdmin}
            onEdit={openEdit}
            onDelete={handleDelete}
            pinned
          />
        ))}

        {regular.map((n, i) => (
          <NoticeCard
            key={n.id}
            notice={n}
            no={total - pinned.length - i}
            isAdmin={isAdmin}
            onEdit={openEdit}
            onDelete={handleDelete}
            pinned={false}
          />
        ))}
      </div>

      {/* 모달 */}
      {modal && (
        <div style={OVERLAY} onClick={() => setModal(null)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: '0 0 1.2rem' }}>
              {modal.mode === 'create' ? '공지 작성' : '공지 수정'}
            </h2>

            <label style={LABEL}>제목</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="공지 제목"
              style={INPUT}
            />

            <label style={LABEL}>내용 (마크다운 지원)</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="공지 내용을 입력하세요. 마크다운 문법을 사용할 수 있습니다."
              rows={12}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1.2rem' }}>
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))}
                style={{ accentColor: '#fbbf24', width: '1rem', height: '1rem' }}
              />
              <span style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.7)' }}>📌 중요 공지로 고정</span>
            </label>

            {err && <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.8rem' }}>{err}</p>}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={BTN_CANCEL} disabled={isPending}>취소</button>
              <button onClick={handleSave} style={BTN_PRIMARY} disabled={isPending}>
                {isPending ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NoticeCard({
  notice,
  no,
  isAdmin,
  onEdit,
  onDelete,
  pinned,
}: {
  notice: Notice;
  no?: number;
  isAdmin: boolean;
  onEdit: (n: Notice) => void;
  onDelete: (id: string) => void;
  pinned: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: '10px',
        border: pinned
          ? '1px solid rgba(251,191,36,0.3)'
          : '1px solid rgba(255,255,255,0.08)',
        background: hover
          ? (pinned ? 'rgba(251,191,36,0.07)' : 'rgba(255,255,255,0.05)')
          : (pinned ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)'),
        padding: '0.65rem 0.45rem',
        transition: 'background 0.12s',
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
      }}
    >
      {/* 번호 */}
      <span style={{
        fontSize: '0.72rem', color: 'rgba(255,255,255,0.28)',
        flexShrink: 0, width: '2.2rem', textAlign: 'center',
      }}>
        {pinned ? '📌' : (no !== undefined ? no : '')}
      </span>

      {/* 제목 (flex 1, 말줄임) */}
      <a
        href={`/notices/${notice.id}`}
        style={{
          flex: 1,
          minWidth: 0,
          color: pinned ? '#fde68a' : '#e2e8f0',
          textDecoration: 'none',
          fontWeight: pinned ? 600 : 400,
          fontSize: '0.88rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'left',
        }}
      >
        {notice.title}
      </a>

      {/* 날짜 */}
      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
        {fmtDate(notice.created_at)}
      </span>

      {/* 관리 버튼 */}
      {isAdmin && (
        <span style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          <button onClick={() => onEdit(notice)} style={BTN_SM_EDIT}>수정</button>
          <button onClick={() => onDelete(notice.id)} style={BTN_SM_DEL}>삭제</button>
        </span>
      )}
    </div>
  );
}

/* ── 공통 스타일 ── */
const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: '1rem',
};

const MODAL: React.CSSProperties = {
  background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px',
  padding: '1.5rem', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto',
};

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.35rem', fontWeight: 600,
};

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#fff', fontSize: '0.88rem',
  outline: 'none', marginBottom: '1rem',
};

const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.5rem 1.1rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
  background: 'rgba(96,165,250,0.18)', border: '1px solid rgba(96,165,250,0.4)', color: '#93c5fd',
};

const BTN_CANCEL: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.82rem', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)',
};

const BTN_SM_EDIT: React.CSSProperties = {
  padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
  background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', color: '#93c5fd',
};

const BTN_SM_DEL: React.CSSProperties = {
  padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171',
};
