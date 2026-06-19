'use client';

import { useState, useTransition } from 'react';
import { updateMeeting } from '@/app/meetings/actions';
import { CATEGORIES, type MeetingRow, type Todo } from '@/app/meetings/types';

function fmtDate(s: string) {
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function genId() {
  return Math.random().toString(36).slice(2, 11);
}

const CAT_STYLE: Record<string, { color: string; bg: string }> = {
  '마케팅관련': { color: '#f9a8d4', bg: 'rgba(236,72,153,0.13)' },
  '영업관련':   { color: '#6ee7b7', bg: 'rgba(16,185,129,0.13)' },
  '정책관련':   { color: '#93c5fd', bg: 'rgba(59,130,246,0.13)' },
  '공급관련':   { color: '#fcd34d', bg: 'rgba(245,158,11,0.13)' },
  '기타':       { color: '#c4b5fd', bg: 'rgba(139,92,246,0.13)' },
};
function cs(cat: string) { return CAT_STYLE[cat] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.13)' }; }

export default function MeetingDetailClient({ meeting: initial }: { meeting: MeetingRow }) {
  const [meeting, setMeeting]   = useState<MeetingRow>(initial);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft]       = useState({
    title: initial.title, category: initial.category,
    content: initial.content, meeting_date: initial.meeting_date,
  });
  const [todoInput, setTodoInput] = useState('');
  const [saveMsg, setSaveMsg]     = useState('');
  const [isPending, startTransition]       = useTransition();
  const [todosPending, startTodoTransition] = useTransition();

  const style = cs(meeting.category);

  function startEdit() {
    setDraft({ title: meeting.title, category: meeting.category, content: meeting.content, meeting_date: meeting.meeting_date });
    setEditMode(true);
  }

  function handleSave() {
    startTransition(async () => {
      const res = await updateMeeting(meeting.id, draft);
      if (res.error) { alert(res.error); return; }
      setMeeting(m => ({ ...m, ...draft }));
      setEditMode(false);
      flash();
    });
  }

  function flash() {
    setSaveMsg('저장됨');
    setTimeout(() => setSaveMsg(''), 2000);
  }

  function saveTodos(todos: Todo[]) {
    startTodoTransition(async () => {
      await updateMeeting(meeting.id, { todos });
      flash();
    });
  }

  function toggleTodo(id: string) {
    const todos = meeting.todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    setMeeting(m => ({ ...m, todos }));
    saveTodos(todos);
  }

  function deleteTodo(id: string) {
    const todos = meeting.todos.filter(t => t.id !== id);
    setMeeting(m => ({ ...m, todos }));
    saveTodos(todos);
  }

  function addTodo() {
    if (!todoInput.trim()) return;
    const todo: Todo = { id: genId(), text: todoInput.trim(), done: false };
    const todos = [...meeting.todos, todo];
    setMeeting(m => ({ ...m, todos }));
    setTodoInput('');
    saveTodos(todos);
  }

  const pendingCount = meeting.todos.filter(t => !t.done).length;
  const sortedTodos  = [...meeting.todos].sort((a, b) => +a.done - +b.done);

  return (
    <div className="auth-card" style={{ padding: '1.75rem' }}>

      {/* ── 메타 헤더 ── */}
      {editMode ? (
        <div style={{ marginBottom: '1.25rem' }}>
          <input
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            placeholder="회의 제목"
            style={{ ...INPUT, fontSize: '1.1rem', fontWeight: 700 }}
          />
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} style={{ ...INPUT_SM, flex: 1 }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" value={draft.meeting_date} onChange={e => setDraft(d => ({ ...d, meeting_date: e.target.value }))} style={{ ...INPUT_SM, flex: 1 }} />
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#f1f5f9', margin: '0 0 0.55rem' }}>
            {meeting.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '0.2rem 0.75rem', borderRadius: '100px', fontSize: '0.73rem', fontWeight: 700, color: style.color, background: style.bg }}>
              {meeting.category}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>{fmtDate(meeting.meeting_date)}</span>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.22)' }}>수정: {fmtDate(meeting.updated_at)}</span>
          </div>
        </div>
      )}

      {/* ── 회의 내용 ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
          <span style={SEC_LABEL}>📝 회의 내용</span>
          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            {(saveMsg && !todosPending) && <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>{saveMsg}</span>}
            {editMode ? (
              <>
                <button onClick={() => setEditMode(false)} style={BTN_CANCEL} disabled={isPending}>취소</button>
                <button onClick={handleSave} style={BTN_SAVE} disabled={isPending}>
                  {isPending ? '저장 중…' : '저장'}
                </button>
              </>
            ) : (
              <button onClick={startEdit} style={BTN_EDIT}>✏️ 수정</button>
            )}
          </div>
        </div>

        {editMode ? (
          <textarea
            value={draft.content}
            onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
            rows={18}
            placeholder="회의 내용을 자유롭게 작성하세요."
            style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.88rem', minHeight: '280px', lineHeight: 1.8 }}
          />
        ) : (
          <div style={{
            minHeight: '100px', padding: '1rem 1.1rem',
            background: 'rgba(255,255,255,0.025)', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {meeting.content ? (
              <div style={{
                color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.8,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {meeting.content}
              </div>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem' }}>
                내용이 없습니다. 수정 버튼을 눌러 작성해주세요.
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 할일 ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <span style={SEC_LABEL}>✅ 다음 할일</span>
          {meeting.todos.length > 0 && (
            <span style={{ fontSize: '0.72rem', color: pendingCount > 0 ? '#fbbf24' : '#4ade80' }}>
              {pendingCount > 0 ? `${pendingCount}/${meeting.todos.length} 미완료` : '모두 완료'}
            </span>
          )}
          {todosPending && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>저장 중…</span>}
        </div>

        {/* 할일 목록 */}
        {sortedTodos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {sortedTodos.map(todo => (
              <div key={todo.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.65rem',
                padding: '0.55rem 0.8rem', borderRadius: '8px',
                background: todo.done ? 'rgba(255,255,255,0.02)' : 'rgba(251,191,36,0.05)',
                border: todo.done ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(251,191,36,0.18)',
                transition: 'all 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo.id)}
                  style={{ accentColor: '#4ade80', width: '1rem', height: '1rem', flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{
                  flex: 1, fontSize: '0.85rem',
                  color: todo.done ? 'rgba(255,255,255,0.28)' : '#e2e8f0',
                  textDecoration: todo.done ? 'line-through' : 'none',
                }}>
                  {todo.text}
                </span>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '1rem', padding: '0 0.2rem', lineHeight: 1, flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 할일 입력 */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={todoInput}
            onChange={e => setTodoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTodo(); }}
            placeholder="다음 할일을 입력하고 Enter…"
            style={{ ...INPUT, flex: 1, marginBottom: 0, fontSize: '0.83rem' }}
          />
          <button onClick={addTodo} style={{ ...BTN_SAVE, flexShrink: 0 }}>추가</button>
        </div>
      </div>
    </div>
  );
}

/* ── 스타일 상수 ── */
const SEC_LABEL: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em', textTransform: 'uppercase',
};
const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px', padding: '0.6rem 0.8rem', color: '#fff', fontSize: '0.88rem',
  outline: 'none', marginBottom: '0.75rem', fontFamily: 'inherit',
};
const INPUT_SM: React.CSSProperties = {
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px', padding: '0.48rem 0.75rem', color: '#fff', fontSize: '0.83rem',
  outline: 'none', marginBottom: '0.75rem', fontFamily: 'inherit',
};
const BTN_SAVE: React.CSSProperties = {
  padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
  background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', fontFamily: 'inherit',
};
const BTN_CANCEL: React.CSSProperties = {
  padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit',
};
const BTN_EDIT: React.CSSProperties = {
  padding: '0.28rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit',
};
