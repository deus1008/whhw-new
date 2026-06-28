'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createMeeting, deleteMeeting, updateMeeting, clearCategory, renameCategory } from '@/app/meetings/actions';
import { CATEGORIES, STATUSES, PRIORITIES, SECURITY_LEVELS, SECURITY_META, type MeetingRow, type TaskStatus, type TaskPriority, type TaskSecurity } from '@/app/meetings/types';

const DEFAULT_CATS: string[] = [...CATEGORIES];

/* ── 상태 스타일 ─────────────────────────────────────────────────── */
const STATUS_META: Record<TaskStatus, { color: string; bg: string }> = {
  '대기':   { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' },
  '진행중': { color: '#fbbf24', bg: 'rgba(251,191,36,0.14)'  },
  '완료':   { color: '#4ade80', bg: 'rgba(74,222,128,0.14)'  },
};

/* ── 우선순위 스타일 ─────────────────────────────────────────────── */
const PRIORITY_META: Record<TaskPriority, { color: string; bg: string; border: string }> = {
  '중요': { color: '#fb923c', bg: 'rgba(251,146,60,0.13)',  border: '#fb923c' },
  '긴급': { color: '#f87171', bg: 'rgba(248,113,113,0.13)', border: '#f87171' },
  '보통': { color: '#fcd34d', bg: 'rgba(252,211,77,0.13)',  border: '#fbbf24' },
  '낮음': { color: '#94a3b8', bg: 'rgba(148,163,184,0.11)', border: 'rgba(255,255,255,0.1)' },
};

/* ── 분류 스타일 ─────────────────────────────────────────────────── */
const CAT_STYLE: Record<string, { color: string; bg: string }> = {
  '마케팅관련': { color: '#f9a8d4', bg: 'rgba(236,72,153,0.13)' },
  '영업관련':   { color: '#6ee7b7', bg: 'rgba(16,185,129,0.13)' },
  '정책관련':   { color: '#93c5fd', bg: 'rgba(59,130,246,0.13)' },
  '공급관련':   { color: '#fcd34d', bg: 'rgba(245,158,11,0.13)' },
  '기타':       { color: '#c4b5fd', bg: 'rgba(139,92,246,0.13)' },
};
function cs(cat?: string | null) {
  if (!cat) return { color: '#94a3b8', bg: 'rgba(148,163,184,0.13)' };
  return CAT_STYLE[cat] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.13)' };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtShort(s: string) {
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return `${d.getMonth()+1}.${d.getDate()}`;
}

function useIsMobile(bp = 768) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const fn = () => setV(window.innerWidth < bp);
    fn(); window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return v;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { '중요': 0, '긴급': 1, '보통': 2, '낮음': 3 };
function sortTasks(tasks: MeetingRow[]) {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? '보통'], pb = PRIORITY_ORDER[b.priority ?? '보통'];
    if (pa !== pb) return pa - pb;
    if (!a.meeting_date && !b.meeting_date) return 0;
    if (!a.meeting_date) return 1;
    if (!b.meeting_date) return -1;
    return a.meeting_date.localeCompare(b.meeting_date);
  });
}

/* ── Task 카드 ───────────────────────────────────────────────────── */
function TaskCard({ task, onDelete, onStatusChange }: {
  task: MeetingRow;
  onDelete: () => void;
  onStatusChange: (s: TaskStatus) => void;
}) {
  const router = useRouter();
  const accessible = task.accessible !== false;

  // 접근 불가 카드
  if (!accessible) {
    const sl = task.security_level ?? '기밀';
    const sm = SECURITY_META[sl as TaskSecurity] ?? SECURITY_META['기밀'];
    return (
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${sm.border}44`, borderLeft: `3px solid ${sm.border}`, borderRadius: '8px', padding: '0.7rem 0.8rem', marginBottom: '0.5rem', opacity: 0.65 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.45rem', borderRadius: '20px', fontWeight: 700, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}66` }}>{sl}</span>
        </div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.25)', marginTop: '0.4rem', fontWeight: 500 }}>🔒 보안 과제 — 열람 권한 없음</div>
      </div>
    );
  }

  const pr = PRIORITY_META[task.priority ?? '보통'];
  const catSt = cs(task.category);
  const todos = task.todos ?? [];
  const done = todos.filter(t => t.done).length;
  const statusIdx = STATUSES.indexOf(task.status ?? '대기');
  const isComplete = task.status === '완료';
  const sl = (task.security_level ?? '공개') as TaskSecurity;
  const sm = SECURITY_META[sl];

  return (
    <div
      onClick={() => router.push(`/meetings/${task.id}`)}
      style={{
        background: isComplete ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `3px solid ${pr.border}`,
        borderRadius: '8px',
        padding: '0.7rem 0.8rem',
        marginBottom: '0.5rem',
        cursor: 'pointer',
        transition: 'background 0.12s',
        opacity: isComplete ? 0.7 : 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = isComplete ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = isComplete ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.035)')}
    >
      {/* 상단: 분류 + 우선순위 + 보안등급 + 삭제 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
        {task.category && (
          <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '20px', fontWeight: 600, background: catSt.bg, color: catSt.color, whiteSpace: 'nowrap' }}>
            {task.category}
          </span>
        )}
        <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '20px', fontWeight: 700, background: pr.bg, color: pr.color }}>
          {task.priority ?? '보통'}
        </span>
        {sl !== '공개' && (
          <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '20px', fontWeight: 700, background: sm.bg, color: sm.color, border: `1px solid ${sm.border}55` }}>
            🔒 {sl}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.18)', fontSize: '0.78rem', padding: 0, lineHeight: 1, flexShrink: 0 }}
        >✕</button>
      </div>

      {/* 제목 */}
      <div style={{ fontWeight: 600, fontSize: '0.84rem', color: isComplete ? 'rgba(255,255,255,0.45)' : '#e2e8f0', marginBottom: '0.35rem', lineHeight: 1.4, textDecoration: isComplete ? 'line-through' : 'none' }}>
        {task.title}
      </div>

      {/* 마감일 + 체크리스트 */}
      {(task.meeting_date || todos.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.69rem', color: 'rgba(255,255,255,0.3)', marginBottom: '0.45rem' }}>
          {task.meeting_date && <span>📅 {fmtShort(task.meeting_date)}</span>}
          {todos.length > 0 && (
            <span style={{ color: done === todos.length ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>
              ✓ {done}/{todos.length}
            </span>
          )}
        </div>
      )}

      {/* 상태 이동 버튼 */}
      <div style={{ display: 'flex', gap: '0.3rem' }} onClick={e => e.stopPropagation()}>
        {statusIdx > 0 && (
          <button onClick={() => onStatusChange(STATUSES[statusIdx - 1])}
            style={{ fontSize: '0.62rem', padding: '0.14rem 0.48rem', borderRadius: '4px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit', lineHeight: 1.4 }}>
            ← {STATUSES[statusIdx - 1]}
          </button>
        )}
        {statusIdx < STATUSES.length - 1 && (
          <button onClick={() => onStatusChange(STATUSES[statusIdx + 1])}
            style={{ marginLeft: 'auto', fontSize: '0.62rem', padding: '0.14rem 0.48rem', borderRadius: '4px', cursor: 'pointer', background: STATUS_META[STATUSES[statusIdx + 1]].bg, border: `1px solid ${STATUS_META[STATUSES[statusIdx + 1]].color}55`, color: STATUS_META[STATUSES[statusIdx + 1]].color, fontFamily: 'inherit', lineHeight: 1.4 }}>
            {STATUSES[statusIdx + 1]} →
          </button>
        )}
      </div>
    </div>
  );
}

/* ── 칸반 컬럼 ───────────────────────────────────────────────────── */
function KanbanColumn({ status, tasks, onDelete, onStatusChange }: {
  status: TaskStatus;
  tasks: MeetingRow[];
  onDelete: (id: string) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
}) {
  const meta = STATUS_META[status];
  return (
    <div style={{ flex: '1 1 0', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', paddingBottom: '0.5rem', marginBottom: '0.65rem', borderBottom: `2px solid ${meta.color}44` }}>
        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: meta.color }}>{status}</span>
        <span style={{ fontSize: '0.7rem', padding: '0.08rem 0.42rem', borderRadius: '20px', background: meta.bg, color: meta.color, fontWeight: 700 }}>{tasks.length}</span>
      </div>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task}
          onDelete={() => onDelete(task.id)}
          onStatusChange={s => onStatusChange(task.id, s)}
        />
      ))}
      {tasks.length === 0 && (
        <div style={{ padding: '2rem 0', textAlign: 'center', color: 'rgba(255,255,255,0.12)', fontSize: '0.75rem' }}>비어있음</div>
      )}
    </div>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────────────── */
export default function MeetingsClient({ meetings: initial, isAdmin = false }: { meetings: MeetingRow[]; isAdmin?: boolean }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [meetings, setMeetings] = useState<MeetingRow[]>(initial);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<{ title: string; category: string; meeting_date: string; priority: TaskPriority; security_level: TaskSecurity }>({
    title: '', category: DEFAULT_CATS[0], meeting_date: '', priority: '보통', security_level: '공개',
  });
  const [err, setErr] = useState('');
  const [isPending, startTransition] = useTransition();

  /* ── 분류 목록 관리 ──────────────────────────────────────────── */
  const [managedCats, setManagedCatsRaw] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [...DEFAULT_CATS];
    try {
      const saved = localStorage.getItem('whhw_task_cats');
      if (saved) return JSON.parse(saved) as string[];
    } catch {}
    return [...DEFAULT_CATS];
  });
  function setManagedCats(fn: string[] | ((prev: string[]) => string[])) {
    setManagedCatsRaw(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      try { localStorage.setItem('whhw_task_cats', JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const [hoveredCat, setHoveredCat]   = useState<string | null>(null);
  const [editingCat, setEditingCat]   = useState<string | null>(null);
  const [editValue, setEditValue]     = useState('');
  const [showCustom, setShowCustom]   = useState(false);
  const [customCatInput, setCustomCatInput] = useState('');

  const allCategories = useMemo(() => {
    const fromMeetings = meetings.map(m => m.category).filter((c): c is string => !!c);
    return Array.from(new Set([...managedCats, ...fromMeetings]));
  }, [meetings, managedCats]);

  const cats = ['전체', ...allCategories.filter(cat => meetings.some(m => m.category === cat))];
  const q = searchQuery.trim().toLowerCase();
  const filtered = (activeCategory === '전체' ? meetings : meetings.filter(m => m.category === activeCategory))
    .filter(m => !q || m.title.toLowerCase().includes(q) || (m.category ?? '').toLowerCase().includes(q));

  const byStatus: Record<TaskStatus, MeetingRow[]> = {
    '대기':   sortTasks(filtered.filter(m => (m.status ?? '대기') === '대기')),
    '진행중': sortTasks(filtered.filter(m => (m.status ?? '대기') === '진행중')),
    '완료':   sortTasks(filtered.filter(m => (m.status ?? '대기') === '완료')),
  };

  function openModal() {
    setForm({ title: '', category: DEFAULT_CATS[0], meeting_date: '', priority: '보통', security_level: '공개' });
    setShowCustom(false); setCustomCatInput(''); setErr(''); setModal(true);
  }

  function handleModalCatSelect(val: string) {
    if (val === '__new__') setShowCustom(true);
    else { setShowCustom(false); setForm(f => ({ ...f, category: val })); }
  }

  function confirmModalCustom() {
    const v = customCatInput.trim();
    if (!v) return;
    if (!allCategories.includes(v)) setManagedCats(prev => [...prev, v]);
    setForm(f => ({ ...f, category: v }));
    setShowCustom(false); setCustomCatInput('');
  }

  function handleCreate() {
    if (!form.title.trim()) { setErr('과업명을 입력하세요.'); return; }
    setErr('');
    startTransition(async () => {
      const res = await createMeeting({ ...form, status: '대기' });
      if (res.error) { setErr(res.error); return; }
      setModal(false);
      router.push(`/meetings/${res.id}`);
    });
  }

  function handleDelete(id: string) {
    if (!confirm('이 Task를 삭제할까요?')) return;
    startTransition(async () => {
      const res = await deleteMeeting(id);
      if (res.error) { alert(res.error); return; }
      setMeetings(prev => prev.filter(m => m.id !== id));
    });
  }

  function handleStatusChange(id: string, status: TaskStatus) {
    setMeetings(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    startTransition(async () => {
      const res = await updateMeeting(id, { status });
      if (res.error) alert(res.error);
    });
  }

  function handleDeleteCategory(cat: string, count: number) {
    const msg = count > 0
      ? `"${cat}" 분류를 사용하는 Task ${count}건의 분류가 제거됩니다. 삭제할까요?`
      : `"${cat}" 분류를 삭제할까요?`;
    if (!confirm(msg)) return;
    setManagedCats(prev => prev.filter(c => c !== cat));
    if (activeCategory === cat) setActiveCategory('전체');
    setHoveredCat(null);
    if (count === 0) return;
    startTransition(async () => {
      const res = await clearCategory(cat);
      if (res.error) { alert(res.error); return; }
      setMeetings(prev => prev.map(m => m.category === cat ? { ...m, category: '' } : m));
    });
  }

  function startEditCat(cat: string) {
    setEditingCat(cat); setEditValue(cat); setHoveredCat(null);
  }

  function confirmEditCat() {
    const newCat = editValue.trim();
    if (!newCat || newCat === editingCat) { setEditingCat(null); return; }
    const oldCat = editingCat!;
    setManagedCats(prev => prev.map(c => c === oldCat ? newCat : c));
    if (activeCategory === oldCat) setActiveCategory(newCat);
    setEditingCat(null);
    startTransition(async () => {
      const res = await renameCategory(oldCat, newCat);
      if (res.error) { alert(res.error); return; }
      setMeetings(prev => prev.map(m => m.category === oldCat ? { ...m, category: newCat } : m));
    });
  }

  return (
    <>
      {/* ── 분류 필터 + 새 Task ───────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {cats.map(cat => {
            const count = cat === '전체' ? meetings.length : meetings.filter(m => m.category === cat).length;
            const active = activeCategory === cat;
            const style = cat !== '전체' ? cs(cat) : null;
            const canManage = cat !== '전체';
            const isHovered = hoveredCat === cat;
            const isEditing = editingCat === cat;

            if (isEditing) return (
              <div key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmEditCat(); if (e.key === 'Escape') setEditingCat(null); }}
                  style={{ padding: '0.25rem 0.6rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: style ? style.bg : 'rgba(255,255,255,0.08)', border: style ? `1px solid ${style.color}88` : '1px solid rgba(255,255,255,0.3)', color: style ? style.color : '#e2e8f0', outline: 'none', fontFamily: 'inherit', width: '7rem' }}
                />
                <button onClick={confirmEditCat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6ee7b7', fontSize: '1rem', padding: 0, lineHeight: 1, fontWeight: 700 }}>✓</button>
                <button onClick={() => setEditingCat(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>✕</button>
              </div>
            );

            return (
              <div key={cat} style={{ position: 'relative', display: 'inline-flex' }}
                onMouseEnter={() => canManage && setHoveredCat(cat)}
                onMouseLeave={() => canManage && setHoveredCat(null)}
              >
                <button onClick={() => setActiveCategory(cat)} style={{
                  padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: active ? (style ? `1px solid ${style.color}88` : '1px solid rgba(255,255,255,0.3)') : '1px solid rgba(255,255,255,0.1)',
                  background: active ? (style ? style.bg : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.03)',
                  color: active ? (style ? style.color : '#e2e8f0') : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.12s', paddingRight: canManage && isHovered ? '2.3rem' : '0.8rem',
                }}>
                  {cat}<span style={{ marginLeft: '0.3rem', opacity: 0.65, fontSize: '0.72rem' }}>{count}</span>
                </button>
                {canManage && isHovered && (
                  <>
                    <button onClick={() => startEditCat(cat)} title="분류명 수정"
                      style={{ position: 'absolute', top: '50%', right: '1.3rem', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'rgba(148,163,184,0.85)', fontSize: '0.72rem', lineHeight: 1 }}>✎</button>
                    <button onClick={() => handleDeleteCategory(cat, count)} title="분류 삭제"
                      style={{ position: 'absolute', top: '50%', right: '0.35rem', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: '0 0.1rem', cursor: 'pointer', color: 'rgba(248,113,113,0.9)', fontSize: '0.8rem', lineHeight: 1, fontWeight: 700 }}>×</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={openModal} style={BTN_PRIMARY}>+ 새 Task</button>
      </div>

      {/* ── 검색 ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: '1.1rem' }}>
        <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.28)', fontSize: '0.85rem', pointerEvents: 'none' }}>🔍</span>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="키워드로 검색…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem 0.8rem 0.5rem 2.1rem', color: '#e2e8f0', fontSize: '0.83rem', outline: 'none', fontFamily: 'inherit' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', padding: 0, lineHeight: 1 }}>✕</button>
        )}
      </div>

      {/* ── 칸반 보드 ─────────────────────────────────────────── */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {STATUSES.map(status => {
            const meta = STATUS_META[status];
            const tasks = byStatus[status];
            return (
              <div key={status}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', paddingBottom: '0.5rem', marginBottom: '0.65rem', borderBottom: `2px solid ${meta.color}44` }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: meta.color }}>{status}</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.08rem 0.42rem', borderRadius: '20px', background: meta.bg, color: meta.color, fontWeight: 700 }}>{tasks.length}</span>
                </div>
                {tasks.map(task => (
                  <TaskCard key={task.id} task={task}
                    onDelete={() => handleDelete(task.id)}
                    onStatusChange={s => handleStatusChange(task.id, s)}
                  />
                ))}
                {tasks.length === 0 && <div style={{ padding: '1.2rem 0', textAlign: 'center', color: 'rgba(255,255,255,0.12)', fontSize: '0.75rem' }}>비어있음</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
          {STATUSES.map(status => (
            <KanbanColumn key={status} status={status} tasks={byStatus[status]}
              onDelete={handleDelete} onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* ── 생성 모달 ─────────────────────────────────────────── */}
      {modal && (
        <div style={OVERLAY} onClick={() => setModal(false)}>
          <div style={MODAL} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: '0 0 1.2rem' }}>새 Task</h2>

            <label style={LABEL}>과업명</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="과업 제목을 입력하세요" autoFocus style={INPUT}
            />

            <label style={LABEL}>분류</label>
            <select value={showCustom ? '__new__' : form.category} onChange={e => handleModalCatSelect(e.target.value)} style={INPUT}>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">＋ 새 분류 추가…</option>
            </select>

            {showCustom && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '-0.75rem', marginBottom: '1rem' }}>
                <input value={customCatInput} onChange={e => setCustomCatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmModalCustom(); if (e.key === 'Escape') { setShowCustom(false); setCustomCatInput(''); } }}
                  placeholder="새 분류명 입력 후 Enter" autoFocus style={{ ...INPUT, marginBottom: 0, flex: 1 }}
                />
                <button onClick={confirmModalCustom} style={{ ...BTN_PRIMARY, flexShrink: 0, padding: '0.6rem 0.9rem' }}>추가</button>
              </div>
            )}

            <label style={LABEL}>우선순위</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {PRIORITIES.map(p => {
                const m = PRIORITY_META[p];
                return (
                  <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                    style={{ flex: 1, padding: '0.45rem 0', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                      background: form.priority === p ? m.bg : 'rgba(255,255,255,0.03)',
                      border: form.priority === p ? `1px solid ${m.color}88` : '1px solid rgba(255,255,255,0.1)',
                      color: form.priority === p ? m.color : 'rgba(255,255,255,0.35)',
                    }}>{p}</button>
                );
              })}
            </div>

            {isAdmin && (
              <>
                <label style={LABEL}>보안등급</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  {SECURITY_LEVELS.map(sl => {
                    const m = SECURITY_META[sl];
                    return (
                      <button key={sl} onClick={() => setForm(f => ({ ...f, security_level: sl }))}
                        style={{ flex: 1, padding: '0.4rem 0', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                          background: form.security_level === sl ? m.bg : 'rgba(255,255,255,0.03)',
                          border: form.security_level === sl ? `1px solid ${m.border}` : '1px solid rgba(255,255,255,0.1)',
                          color: form.security_level === sl ? m.color : 'rgba(255,255,255,0.35)',
                        }}>{sl}</button>
                    );
                  })}
                </div>
              </>
            )}

            <label style={LABEL}>마감일 (선택)</label>
            <input type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} style={INPUT} />

            {err && <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.8rem' }}>{err}</p>}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={BTN_CANCEL} disabled={isPending}>취소</button>
              <button onClick={handleCreate} style={BTN_PRIMARY} disabled={isPending}>
                {isPending ? '생성 중…' : 'Task 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── 공통 스타일 ─────────────────────────────────────────────────── */
const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: '1rem',
};
const MODAL: React.CSSProperties = {
  background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px',
  padding: '1.5rem', width: '100%', maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto',
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
