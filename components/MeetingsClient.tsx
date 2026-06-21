'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createMeeting, deleteMeeting } from '@/app/meetings/actions';
import { CATEGORIES, type MeetingRow } from '@/app/meetings/types';

function fmtDate(s: string) {
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CAT_STYLE: Record<string, { color: string; bg: string }> = {
  '마케팅관련': { color: '#f9a8d4', bg: 'rgba(236,72,153,0.13)' },
  '영업관련':   { color: '#6ee7b7', bg: 'rgba(16,185,129,0.13)' },
  '정책관련':   { color: '#93c5fd', bg: 'rgba(59,130,246,0.13)' },
  '공급관련':   { color: '#fcd34d', bg: 'rgba(245,158,11,0.13)' },
  '기타':       { color: '#c4b5fd', bg: 'rgba(139,92,246,0.13)' },
};
function cs(cat: string) { return CAT_STYLE[cat] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.13)' }; }

export default function MeetingsClient({ meetings: initial }: { meetings: MeetingRow[] }) {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingRow[]>(initial);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', category: CATEGORIES[0] as string, meeting_date: todayStr() });
  const [err, setErr] = useState('');
  const [isPending, startTransition] = useTransition();

  const cats = ['전체', ...CATEGORIES];
  const filtered = activeCategory === '전체' ? meetings : meetings.filter(m => m.category === activeCategory);

  function openModal() {
    setForm({ title: '', category: CATEGORIES[0], meeting_date: todayStr() });
    setErr('');
    setModal(true);
  }

  function handleCreate() {
    if (!form.title.trim()) { setErr('제목을 입력하세요.'); return; }
    setErr('');
    startTransition(async () => {
      const res = await createMeeting(form);
      if (res.error) { setErr(res.error); return; }
      setModal(false);
      router.push(`/meetings/${res.id}`);
    });
  }

  function handleDelete(id: string) {
    if (!confirm('이 회의록을 삭제할까요?')) return;
    startTransition(async () => {
      const res = await deleteMeeting(id);
      if (res.error) { alert(res.error); return; }
      setMeetings(prev => prev.filter(m => m.id !== id));
    });
  }

  return (
    <>
      {/* 분류 탭 + 새 회의록 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {cats.map(cat => {
            const count = cat === '전체' ? meetings.length : meetings.filter(m => m.category === cat).length;
            const active = activeCategory === cat;
            const style = cat !== '전체' ? cs(cat) : null;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: active
                    ? (style ? `1px solid ${style.color}88` : '1px solid rgba(255,255,255,0.3)')
                    : '1px solid rgba(255,255,255,0.1)',
                  background: active
                    ? (style ? style.bg : 'rgba(255,255,255,0.08)')
                    : 'rgba(255,255,255,0.03)',
                  color: active
                    ? (style ? style.color : '#e2e8f0')
                    : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.12s',
                }}
              >
                {cat}
                <span style={{ marginLeft: '0.3rem', opacity: 0.65, fontSize: '0.72rem' }}>{count}</span>
              </button>
            );
          })}
        </div>
        <button onClick={openModal} style={BTN_PRIMARY}>+ 새 회의록</button>
      </div>

      {/* 게시판 테이블 */}
      <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden' }}>
        {/* 헤더 행 */}
        <div style={HEADER_ROW}>
          <span style={{ ...COL_DATE, textAlign: 'center', color: 'rgba(255,255,255,0.35)' }}>회의일</span>
          <span style={{ ...COL_CAT,  textAlign: 'center', color: 'rgba(255,255,255,0.35)' }}>분류</span>
          <span style={{ ...COL_TITLE, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>제목</span>
          <span style={{ ...COL_TODO, textAlign: 'center', color: 'rgba(255,255,255,0.35)' }}>할일</span>
          <span style={{ ...COL_ACT,  textAlign: 'right',  color: 'rgba(255,255,255,0.35)' }}>관리</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: '3rem 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.88rem' }}>
            {activeCategory === '전체' ? '회의록이 없습니다.' : `${activeCategory} 회의록이 없습니다.`}
          </div>
        )}

        {filtered.map((m, i) => {
          const todos = m.todos ?? [];
          const pending = todos.filter(t => !t.done).length;
          return (
            <MeetingRow
              key={m.id}
              meeting={m}
              pending={pending}
              total={todos.length}
              isEven={i % 2 === 0}
              onDelete={() => handleDelete(m.id)}
            />
          );
        })}
      </div>

      {/* 생성 모달 */}
      {modal && (
        <div style={OVERLAY} onClick={() => setModal(false)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: '0 0 1.2rem' }}>새 회의록</h2>

            <label style={LABEL}>회의 제목</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="예) 6월 정기 마케팅 회의"
              autoFocus
              style={INPUT}
            />

            <label style={LABEL}>분류</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={INPUT}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={LABEL}>회의일</label>
            <input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} style={INPUT} />

            {err && <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.8rem' }}>{err}</p>}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={BTN_CANCEL} disabled={isPending}>취소</button>
              <button onClick={handleCreate} style={BTN_PRIMARY} disabled={isPending}>
                {isPending ? '생성 중…' : '회의록 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MeetingRow({ meeting, pending, total, isEven, onDelete }: {
  meeting: MeetingRow; pending: number; total: number; isEven: boolean; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const style = cs(meeting.category);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '0.65rem 1rem',
        background: hover ? 'rgba(255,255,255,0.05)' : isEven ? 'rgba(255,255,255,0.018)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      <span style={{ ...COL_DATE, color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', textAlign: 'center' }}>
        {fmtDate(meeting.meeting_date)}
      </span>
      <span style={{ ...COL_CAT, display: 'flex', justifyContent: 'center' }}>
        <span style={{ padding: '0.15rem 0.55rem', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600, color: style.color, background: style.bg, whiteSpace: 'nowrap' }}>
          {meeting.category}
        </span>
      </span>
      <a href={`/meetings/${meeting.id}`} style={{ ...COL_TITLE, color: '#e2e8f0', textDecoration: 'none', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meeting.title}
      </a>
      <span style={{ ...COL_TODO, textAlign: 'center' }}>
        {total > 0 ? (
          <span style={{
            fontSize: '0.72rem', fontWeight: 700,
            color: pending > 0 ? '#fbbf24' : '#4ade80',
            background: pending > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)',
            padding: '0.1rem 0.45rem', borderRadius: '100px',
          }}>
            {pending > 0 ? `${pending}/${total}` : `✓${total}`}
          </span>
        ) : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.78rem' }}>—</span>}
      </span>
      <span style={{ ...COL_ACT, display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
        <a href={`/meetings/${meeting.id}`} style={BTN_SM}>열람</a>
        <button onClick={onDelete} style={BTN_SM_DEL}>삭제</button>
      </span>
    </div>
  );
}

/* ── 레이아웃 ── */
const HEADER_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '0.5rem 1rem',
  background: 'rgba(255,255,255,0.04)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
};
const COL_DATE:  React.CSSProperties = { width: '5.5rem', flexShrink: 0 };
const COL_CAT:   React.CSSProperties = { width: '7rem',  flexShrink: 0 };
const COL_TITLE: React.CSSProperties = { flex: 1, minWidth: 0, maxWidth: '35%', paddingRight: '0.75rem' };
const COL_TODO:  React.CSSProperties = { width: '5rem',  flexShrink: 0, marginLeft: 'auto' };
const COL_ACT:   React.CSSProperties = { width: '6.5rem', flexShrink: 0 };

/* ── 공통 스타일 ── */
const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: '1rem',
};
const MODAL: React.CSSProperties = {
  background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px',
  padding: '1.5rem', width: '100%', maxWidth: '420px',
};
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.35rem', fontWeight: 600,
};
const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#fff', fontSize: '0.88rem',
  outline: 'none', marginBottom: '1rem', fontFamily: 'inherit',
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.48rem 1rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
  background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', fontFamily: 'inherit',
};
const BTN_CANCEL: React.CSSProperties = {
  padding: '0.48rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit',
};
const BTN_SM: React.CSSProperties = {
  padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.28)', color: '#a5b4fc',
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
};
const BTN_SM_DEL: React.CSSProperties = {
  padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', color: '#f87171',
};
