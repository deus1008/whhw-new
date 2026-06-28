'use client';

import { useState, useTransition } from 'react';
import { updateMeeting, addTodoToCalendar } from '@/app/meetings/actions';
import { CATEGORIES, STATUSES, PRIORITIES, type MeetingRow, type Todo, type TaskStatus, type TaskPriority } from '@/app/meetings/types';

function fmtDate(s: string) {
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDue(s: string) {
  const [, m, d] = s.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}
function genId() { return Math.random().toString(36).slice(2, 11); }

const CAT_STYLE: Record<string, { color: string; bg: string }> = {
  '마케팅관련': { color: '#f9a8d4', bg: 'rgba(236,72,153,0.13)' },
  '영업관련':   { color: '#6ee7b7', bg: 'rgba(16,185,129,0.13)' },
  '정책관련':   { color: '#93c5fd', bg: 'rgba(59,130,246,0.13)' },
  '공급관련':   { color: '#fcd34d', bg: 'rgba(245,158,11,0.13)' },
  '기타':       { color: '#c4b5fd', bg: 'rgba(139,92,246,0.13)' },
};
function cs(cat: string) { return CAT_STYLE[cat] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.13)' }; }

const STATUS_META: Record<TaskStatus, { color: string; bg: string }> = {
  '대기':   { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' },
  '진행중': { color: '#fbbf24', bg: 'rgba(251,191,36,0.14)'  },
  '완료':   { color: '#4ade80', bg: 'rgba(74,222,128,0.14)'  },
};
const PRIORITY_META: Record<TaskPriority, { color: string; bg: string }> = {
  '긴급': { color: '#f87171', bg: 'rgba(248,113,113,0.13)' },
  '보통': { color: '#fcd34d', bg: 'rgba(252,211,77,0.13)'  },
  '낮음': { color: '#94a3b8', bg: 'rgba(148,163,184,0.11)' },
};

export default function MeetingDetailClient({ meeting: initial }: { meeting: MeetingRow }) {
  const [meeting, setMeeting]   = useState<MeetingRow>(initial);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft]       = useState({
    title: initial.title, category: initial.category,
    content: initial.content, meeting_date: initial.meeting_date,
  });
  const [todoInput, setTodoInput]   = useState('');
  const [dueDate, setDueDate]       = useState('');
  const [saveMsg, setSaveMsg]       = useState('');
  const [calMsg, setCalMsg]         = useState('');
  const [isPending, startTransition]             = useTransition();
  const [todosPending, startTodoTransition]       = useTransition();
  const [metaPending, startMetaTransition]        = useTransition();

  const style = cs(meeting.category);

  function flash() { setSaveMsg('저장됨'); setTimeout(() => setSaveMsg(''), 2000); }

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

  function handleStatusChange(status: TaskStatus) {
    setMeeting(m => ({ ...m, status }));
    startMetaTransition(async () => {
      await updateMeeting(meeting.id, { status });
      flash();
    });
  }

  function handlePriorityChange(priority: TaskPriority) {
    setMeeting(m => ({ ...m, priority }));
    startMetaTransition(async () => {
      await updateMeeting(meeting.id, { priority });
      flash();
    });
  }

  function saveTodos(todos: Todo[]) {
    startTodoTransition(async () => { await updateMeeting(meeting.id, { todos }); flash(); });
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
    const todo: Todo = { id: genId(), text: todoInput.trim(), done: false, due_date: dueDate || undefined };
    const todos = [...meeting.todos, todo];
    setMeeting(m => ({ ...m, todos }));
    setTodoInput(''); setDueDate('');
    saveTodos(todos);
    addTodoToCalendar({ todoText: todo.text, meetingTitle: meeting.title, meetingDate: meeting.meeting_date, dueDate: todo.due_date })
      .then(res => {
        setCalMsg(res.error ? '📅 일정 등록 실패' : '📅 주요일정 등록됨');
        setTimeout(() => setCalMsg(''), 2500);
      });
  }

  const pendingCount = meeting.todos.filter(t => !t.done).length;
  const sortedTodos  = [...meeting.todos].sort((a, b) => +a.done - +b.done);

  return (
    <div className="auth-card" style={{ padding: '1.75rem' }}>

      {/* ── 메타 헤더 ── */}
      {editMode ? (
        <div style={{ marginBottom: '1.25rem' }}>
          <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            placeholder="과업명" style={{ ...INPUT, fontSize: '1.1rem', fontWeight: 700 }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <span style={{ padding: '0.2rem 0.75rem', borderRadius: '100px', fontSize: '0.73rem', fontWeight: 700, color: style.color, background: style.bg }}>
              {meeting.category}
            </span>
            {meeting.meeting_date && (
              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>📅 {fmtDate(meeting.meeting_date)}</span>
            )}
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.22)' }}>수정: {fmtDate(meeting.updated_at)}</span>
          </div>

          {/* 상태 + 우선순위 빠른 변경 */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginRight: '0.1rem' }}>상태</span>
            {STATUSES.map(s => {
              const m = STATUS_META[s];
              const active = (meeting.status ?? '대기') === s;
              return (
                <button key={s} onClick={() => handleStatusChange(s)} disabled={metaPending}
                  style={{ padding: '0.2rem 0.7rem', borderRadius: '20px', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                    background: active ? m.bg : 'rgba(255,255,255,0.03)',
                    border: active ? `1px solid ${m.color}88` : '1px solid rgba(255,255,255,0.1)',
                    color: active ? m.color : 'rgba(255,255,255,0.32)',
                  }}>{s}</button>
              );
            })}
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginLeft: '0.4rem', marginRight: '0.1rem' }}>우선순위</span>
            {PRIORITIES.map(p => {
              const m = PRIORITY_META[p];
              const active = (meeting.priority ?? '보통') === p;
              return (
                <button key={p} onClick={() => handlePriorityChange(p)} disabled={metaPending}
                  style={{ padding: '0.2rem 0.7rem', borderRadius: '20px', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                    background: active ? m.bg : 'rgba(255,255,255,0.03)',
                    border: active ? `1px solid ${m.color}88` : '1px solid rgba(255,255,255,0.1)',
                    color: active ? m.color : 'rgba(255,255,255,0.32)',
                  }}>{p}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 내용/메모 ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
          <span style={SEC_LABEL}>📝 내용 / 메모</span>
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
          <textarea value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
            rows={18} placeholder="내용을 자유롭게 작성하세요."
            style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.88rem', minHeight: '280px', lineHeight: 1.8 }}
          />
        ) : (
          <div style={{ minHeight: '100px', padding: '1rem 1.1rem', background: 'rgba(255,255,255,0.025)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            {meeting.content ? (
              <div style={{ color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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

      {/* ── 체크리스트 ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <span style={SEC_LABEL}>✅ 체크리스트</span>
          {meeting.todos.length > 0 && (
            <span style={{ fontSize: '0.72rem', color: pendingCount > 0 ? '#fbbf24' : '#4ade80' }}>
              {pendingCount > 0 ? `${pendingCount}/${meeting.todos.length} 미완료` : '모두 완료'}
            </span>
          )}
          {todosPending && <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>저장 중…</span>}
        </div>

        {sortedTodos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {sortedTodos.map(todo => (
              <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.8rem', borderRadius: '8px', background: todo.done ? 'rgba(255,255,255,0.02)' : 'rgba(251,191,36,0.05)', border: todo.done ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(251,191,36,0.18)', transition: 'all 0.15s' }}>
                <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)}
                  style={{ accentColor: '#4ade80', width: '1rem', height: '1rem', flexShrink: 0, cursor: 'pointer' }}
                />
                <span style={{ flex: 1, fontSize: '0.85rem', color: todo.done ? 'rgba(255,255,255,0.28)' : '#e2e8f0', textDecoration: todo.done ? 'line-through' : 'none' }}>
                  {todo.text}
                </span>
                {todo.due_date && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, padding: '0.1rem 0.4rem', borderRadius: '100px', color: todo.done ? 'rgba(167,139,250,0.4)' : '#a78bfa', background: todo.done ? 'rgba(167,139,250,0.04)' : 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                    📅 {fmtDue(todo.due_date)}
                  </span>
                )}
                <button onClick={() => deleteTodo(todo.id)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '1rem', padding: '0 0.2rem', lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input value={todoInput} onChange={e => setTodoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTodo(); }}
            placeholder="항목을 입력하고 Enter…"
            style={{ ...INPUT, flex: '1 1 200px', marginBottom: 0, fontSize: '0.83rem' }}
          />
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            title="기한 설정 (선택)" style={{ ...INPUT_SM, flex: '0 0 auto', marginBottom: 0, width: '132px' }}
          />
          <button onClick={addTodo} style={{ ...BTN_SAVE, flexShrink: 0 }}>추가</button>
        </div>
        {calMsg && (
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: calMsg.includes('실패') ? '#f87171' : '#4ade80' }}>{calMsg}</p>
        )}
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
