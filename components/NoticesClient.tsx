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

  const pinned = notices.filter(n => n.is_pinned);
  const regular = notices.filter(n => !n.is_pinned);

  return (
    <>
      {/* 관리자 버튼 */}
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button onClick={openCreate} style={BTN_PRIMARY}>+ 공지 작성</button>
        </div>
      )}

      {notices.length === 0 && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '4rem 0', fontSize: '0.9rem' }}>
          등록된 공지사항이 없습니다.
        </div>
      )}

      {/* 고정 공지 */}
      {pinned.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <div style={SECTION_LABEL}>📌 중요 공지</div>
          {pinned.map(n => <NoticeRow key={n.id} notice={n} isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDelete} />)}
        </section>
      )}

      {/* 일반 공지 */}
      {regular.length > 0 && (
        <section>
          {pinned.length > 0 && <div style={SECTION_LABEL}>공지사항</div>}
          {regular.map(n => <NoticeRow key={n.id} notice={n} isAdmin={isAdmin} onEdit={openEdit} onDelete={handleDelete} />)}
        </section>
      )}

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

function NoticeRow({
  notice,
  isAdmin,
  onEdit,
  onDelete,
}: {
  notice: Notice;
  isAdmin: boolean;
  onEdit: (n: Notice) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.85rem 1rem',
      marginBottom: '0.5rem',
      borderRadius: '10px',
      background: notice.is_pinned ? 'rgba(251,191,36,0.06)' : 'rgba(255,255,255,0.04)',
      border: notice.is_pinned ? '1px solid rgba(251,191,36,0.22)' : '1px solid rgba(255,255,255,0.08)',
    }}>
      {notice.is_pinned && (
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fbbf24', flexShrink: 0 }}>📌</span>
      )}
      <a
        href={`/notices/${notice.id}`}
        style={{ flex: 1, color: '#e2e8f0', textDecoration: 'none', fontWeight: 500, fontSize: '0.92rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {notice.title}
      </a>
      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
        {fmtDate(notice.created_at)}
      </span>
      <a
        href={`/notices/${notice.id}`}
        style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', textDecoration: 'none', flexShrink: 0 }}
      >
        열람 →
      </a>
      {isAdmin && (
        <>
          <button onClick={() => onEdit(notice)} style={BTN_SM_EDIT}>수정</button>
          <button onClick={() => onDelete(notice.id)} style={BTN_SM_DEL}>삭제</button>
        </>
      )}
    </div>
  );
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)',
  letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem', paddingLeft: '0.1rem',
};

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
  padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer',
  background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', color: '#93c5fd',
};

const BTN_SM_DEL: React.CSSProperties = {
  padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer',
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171',
};
