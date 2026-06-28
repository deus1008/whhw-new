'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createMeeting, deleteMeeting, updateMeeting, clearCategory } from '@/app/meetings/actions';
import { CATEGORIES, type MeetingRow } from '@/app/meetings/types';

const DEFAULT_CATS: string[] = [...CATEGORIES];

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isMobile;
}

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
  const isMobile = useIsMobile();
  const [meetings, setMeetings] = useState<MeetingRow[]>(initial);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', category: DEFAULT_CATS[0], meeting_date: todayStr() });
  const [err, setErr] = useState('');
  const [isPending, startTransition] = useTransition();

  /* ── 동적 분류 목록 ──────────────────────────────────────────── */
  const [localCats, setLocalCats] = useState<string[]>([]);
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  const allCategories = useMemo(() => {
    const fromMeetings = meetings.map(m => m.category).filter((c): c is string => !!c);
    return Array.from(new Set([...DEFAULT_CATS, ...localCats, ...fromMeetings]));
  }, [meetings, localCats]);

  /* ── 모달 새 분류 입력 ───────────────────────────────────────── */
  const [showCustom, setShowCustom] = useState(false);
  const [customCatInput, setCustomCatInput] = useState('');

  function handleModalCatSelect(val: string) {
    if (val === '__new__') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      setForm(f => ({ ...f, category: val }));
    }
  }

  function confirmModalCustom() {
    const v = customCatInput.trim();
    if (!v) return;
    if (!allCategories.includes(v)) setLocalCats(prev => [...prev, v]);
    setForm(f => ({ ...f, category: v }));
    setShowCustom(false);
    setCustomCatInput('');
  }

  const cats = ['전체', ...allCategories];
  const filtered = activeCategory === '전체' ? meetings : meetings.filter(m => m.category === activeCategory);

  function openModal() {
    setForm({ title: '', category: DEFAULT_CATS[0], meeting_date: todayStr() });
    setShowCustom(false);
    setCustomCatInput('');
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

  function handleDeleteCategory(cat: string, count: number) {
    const msg = count > 0
      ? `"${cat}" 분류를 사용하는 회의록 ${count}건의 분류가 제거됩니다. 삭제할까요?`
      : `"${cat}" 분류를 삭제할까요?`;
    if (!confirm(msg)) return;
    setLocalCats(prev => prev.filter(c => c !== cat));
    if (activeCategory === cat) setActiveCategory('전체');
    setHoveredCat(null);
    if (count === 0) return;
    startTransition(async () => {
      const res = await clearCategory(cat);
      if (res.error) { alert(res.error); return; }
      setMeetings(prev => prev.map(m => m.category === cat ? { ...m, category: '' } : m));
    });
  }

  function handleCategoryChange(id: string, cat: string) {
    /* 새 분류면 localCats에 추가 */
    if (!allCategories.includes(cat)) setLocalCats(prev => [...prev, cat]);
    startTransition(async () => {
      const res = await updateMeeting(id, { category: cat });
      if (res.error) { alert(res.error); return; }
      setMeetings(prev => prev.map(m => m.id === id ? { ...m, category: cat } : m));
    });
  }

  return (
    <>
      {/* ── 분류 탭 + 새 회의록 버튼 ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {cats.map(cat => {
            const count = cat === '전체' ? meetings.length : meetings.filter(m => m.category === cat).length;
            const active = activeCategory === cat;
            const style = cat !== '전체' ? cs(cat) : null;
            const isDeletable = cat !== '전체' && !DEFAULT_CATS.includes(cat);
            const isHovered = hoveredCat === cat;
            return (
              <div
                key={cat}
                style={{ position: 'relative', display: 'inline-flex' }}
                onMouseEnter={() => isDeletable && setHoveredCat(cat)}
                onMouseLeave={() => isDeletable && setHoveredCat(null)}
              >
                <button
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
                    paddingRight: isDeletable && isHovered ? '1.4rem' : '0.8rem',
                  }}
                >
                  {cat}
                  <span style={{ marginLeft: '0.3rem', opacity: 0.65, fontSize: '0.72rem' }}>{count}</span>
                </button>
                {isDeletable && isHovered && (
                  <button
                    onClick={() => handleDeleteCategory(cat, count)}
                    title="분류 삭제"
                    style={{
                      position: 'absolute', top: '50%', right: '0.35rem', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', padding: '0 0.1rem',
                      cursor: 'pointer', color: 'rgba(248,113,113,0.9)', fontSize: '0.8rem',
                      lineHeight: 1, fontWeight: 700,
                    }}
                  >×</button>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={openModal} style={BTN_PRIMARY}>+ 새 회의록</button>
      </div>

      {/* ── 게시판 — 데스크톱: 테이블 / 모바일: 카드 ──────────── */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '3rem 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.88rem' }}>
              {activeCategory === '전체' ? '회의록이 없습니다.' : `${activeCategory} 회의록이 없습니다.`}
            </div>
          )}
          {filtered.map(m => {
            const todos = m.todos ?? [];
            const pending = todos.filter(t => !t.done).length;
            return (
              <MeetingCard
                key={m.id}
                meeting={m}
                pending={pending}
                total={todos.length}
                allCategories={allCategories}
                onDelete={() => handleDelete(m.id)}
                onCategoryChange={cat => handleCategoryChange(m.id, cat)}
              />
            );
          })}
        </div>
      ) : (
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden' }}>
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
                allCategories={allCategories}
                onDelete={() => handleDelete(m.id)}
                onCategoryChange={cat => handleCategoryChange(m.id, cat)}
              />
            );
          })}
        </div>
      )}

      {/* ── 생성 모달 ─────────────────────────────────────────── */}
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
            <select
              value={showCustom ? '__new__' : form.category}
              onChange={e => handleModalCatSelect(e.target.value)}
              style={INPUT}
            >
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">＋ 새 분류 추가…</option>
            </select>

            {showCustom && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '-0.75rem', marginBottom: '1rem' }}>
                <input
                  value={customCatInput}
                  onChange={e => setCustomCatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmModalCustom();
                    if (e.key === 'Escape') { setShowCustom(false); setCustomCatInput(''); }
                  }}
                  placeholder="새 분류명 입력 후 Enter"
                  autoFocus
                  style={{ ...INPUT, marginBottom: 0, flex: 1 }}
                />
                <button
                  onClick={confirmModalCustom}
                  style={{ ...BTN_PRIMARY, flexShrink: 0, padding: '0.6rem 0.9rem' }}
                >추가</button>
              </div>
            )}

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

/* ── 테이블 행 ─────────────────────────────────────────────────── */
function MeetingRow({ meeting, pending, total, isEven, allCategories, onDelete, onCategoryChange }: {
  meeting: MeetingRow; pending: number; total: number; isEven: boolean;
  allCategories: string[];
  onDelete: () => void;
  onCategoryChange: (cat: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [editingCat, setEditingCat] = useState(false);
  const [customCat, setCustomCat] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const style = cs(meeting.category);

  function handleCatChange(val: string) {
    if (val === '__new__') {
      setShowCatInput(true);
    } else {
      onCategoryChange(val);
      setEditingCat(false);
    }
  }

  function confirmCat() {
    const v = customCat.trim();
    if (!v) return;
    onCategoryChange(v);
    setCustomCat('');
    setShowCatInput(false);
    setEditingCat(false);
  }

  function cancelCatEdit() {
    setEditingCat(false);
    setShowCatInput(false);
    setCustomCat('');
  }

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

      {/* 분류 — 클릭하면 인라인 편집 */}
      <span style={{ ...COL_CAT, display: 'flex', justifyContent: 'center' }}>
        {editingCat ? (
          showCatInput ? (
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <input
                value={customCat}
                onChange={e => setCustomCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmCat(); if (e.key === 'Escape') cancelCatEdit(); }}
                placeholder="새 분류명"
                autoFocus
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '0.15rem 0.4rem', color: '#fff', fontSize: '0.7rem', width: '72px', outline: 'none', fontFamily: 'inherit' }}
              />
              <button onClick={confirmCat}    style={CAT_MICRO_BTN}>✓</button>
              <button onClick={cancelCatEdit} style={CAT_MICRO_BTN}>×</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <select
                value={meeting.category}
                onChange={e => handleCatChange(e.target.value)}
                autoFocus
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '0.15rem 0.3rem', color: '#fff', fontSize: '0.7rem', outline: 'none', fontFamily: 'inherit' }}
              >
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">＋ 새 분류…</option>
              </select>
              <button onClick={cancelCatEdit} style={CAT_MICRO_BTN}>×</button>
            </div>
          )
        ) : (
          <button
            onClick={() => setEditingCat(true)}
            title="분류 수정"
            style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ padding: '0.15rem 0.55rem', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600, color: style.color, background: style.bg, whiteSpace: 'nowrap' }}>
              {meeting.category}
            </span>
            <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', lineHeight: 1 }}>✎</span>
          </button>
        )}
      </span>

      <a href={`/meetings/${meeting.id}`} style={{ ...COL_TITLE, color: '#e2e8f0', textDecoration: 'none', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meeting.title}
      </a>
      <span style={{ ...COL_TODO, textAlign: 'center' }}>
        {total > 0 ? (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: pending > 0 ? '#fbbf24' : '#4ade80', background: pending > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)', padding: '0.1rem 0.45rem', borderRadius: '100px' }}>
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

/* ── 모바일 카드 ────────────────────────────────────────────────── */
function MeetingCard({ meeting, pending, total, allCategories, onDelete, onCategoryChange }: {
  meeting: MeetingRow; pending: number; total: number;
  allCategories: string[];
  onDelete: () => void;
  onCategoryChange: (cat: string) => void;
}) {
  const style = cs(meeting.category);
  const [editingCat, setEditingCat] = useState(false);
  const [customCat, setCustomCat] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);

  function handleCatChange(val: string) {
    if (val === '__new__') {
      setShowCatInput(true);
    } else {
      onCategoryChange(val);
      setEditingCat(false);
    }
  }

  function confirmCat() {
    const v = customCat.trim();
    if (!v) return;
    onCategoryChange(v);
    setCustomCat('');
    setShowCatInput(false);
    setEditingCat(false);
  }

  function cancelCatEdit() {
    setEditingCat(false);
    setShowCatInput(false);
    setCustomCat('');
  }

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.9rem 1rem', background: 'rgba(255,255,255,0.03)' }}>
      {/* 상단: 날짜 + 분류 + 할일 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{fmtDate(meeting.meeting_date)}</span>

        {/* 분류 인라인 편집 */}
        {editingCat ? (
          showCatInput ? (
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <input
                value={customCat}
                onChange={e => setCustomCat(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmCat(); if (e.key === 'Escape') cancelCatEdit(); }}
                placeholder="새 분류명"
                autoFocus
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '0.2rem 0.5rem', color: '#fff', fontSize: '0.72rem', width: '90px', outline: 'none', fontFamily: 'inherit' }}
              />
              <button onClick={confirmCat}    style={CAT_MICRO_BTN}>✓</button>
              <button onClick={cancelCatEdit} style={CAT_MICRO_BTN}>×</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <select
                value={meeting.category}
                onChange={e => handleCatChange(e.target.value)}
                autoFocus
                style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '0.2rem 0.4rem', color: '#fff', fontSize: '0.72rem', outline: 'none', fontFamily: 'inherit' }}
              >
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">＋ 새 분류…</option>
              </select>
              <button onClick={cancelCatEdit} style={CAT_MICRO_BTN}>×</button>
            </div>
          )
        ) : (
          <button
            onClick={() => setEditingCat(true)}
            title="분류 수정"
            style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span style={{ padding: '0.12rem 0.5rem', borderRadius: '100px', fontSize: '0.68rem', fontWeight: 600, color: style.color, background: style.bg, whiteSpace: 'nowrap' }}>
              {meeting.category}
            </span>
            <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)' }}>✎</span>
          </button>
        )}

        {total > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, color: pending > 0 ? '#fbbf24' : '#4ade80', background: pending > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)', padding: '0.1rem 0.4rem', borderRadius: '100px' }}>
            {pending > 0 ? `할일 ${pending}/${total}` : `✓${total}`}
          </span>
        )}
      </div>

      {/* 제목 */}
      <a href={`/meetings/${meeting.id}`} style={{ display: 'block', fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', textDecoration: 'none', marginBottom: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meeting.title}
      </a>

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <a href={`/meetings/${meeting.id}`} style={{ ...BTN_SM, flex: 1, justifyContent: 'center', padding: '0.45rem 0' }}>
          열람
        </a>
        <button onClick={onDelete} style={{ ...BTN_SM_DEL, flex: 1, padding: '0.45rem 0' }}>
          삭제
        </button>
      </div>
    </div>
  );
}

/* ── 레이아웃 ── */
const HEADER_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '0.5rem 1rem',
  background: 'rgba(255,255,255,0.04)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em',
};
const COL_DATE:  React.CSSProperties = { width: '5.5rem', flexShrink: 0 };
const COL_CAT:   React.CSSProperties = { width: '8rem',  flexShrink: 0 };
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
const CAT_MICRO_BTN: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '4px', color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem',
  cursor: 'pointer', padding: '0.1rem 0.3rem', fontFamily: 'inherit', lineHeight: 1.4,
};
