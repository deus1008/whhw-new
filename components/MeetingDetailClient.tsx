'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { updateMeeting, addTodoToCalendar } from '@/app/meetings/actions';
import {
  STATUSES, PRIORITIES, SECURITY_LEVELS, SECURITY_META,
  type MeetingRow, type Attachment, type Todo, type TaskStatus, type TaskPriority, type TaskSecurity,
} from '@/app/meetings/types';

function fmtDate(s: string) {
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDue(s: string) {
  const [, m, d] = s.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}
function fmtSize(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
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
  '중요': { color: '#fb923c', bg: 'rgba(251,146,60,0.13)'  },
  '긴급': { color: '#f87171', bg: 'rgba(248,113,113,0.13)' },
  '보통': { color: '#fcd34d', bg: 'rgba(252,211,77,0.13)'  },
  '낮음': { color: '#94a3b8', bg: 'rgba(148,163,184,0.11)' },
};

/* ── 콘텐츠 변환 헬퍼 ────────────────────────────────────────── */
function isHtml(s: string) { return /<[a-z][\s\S]*>/i.test(s); }

function textToHtml(text: string): string {
  if (!text) return '';
  if (isHtml(text)) return text;
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/(https?:\/\/[^\s<>"[\]()]+)/g,
      '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n/g, '<br>');
}

/* ── 첨부파일 뷰 ─────────────────────────────────────────────── */
function AttachmentView({ attachments, onRemove }: {
  attachments: Attachment[];
  onRemove?: (id: string) => void;
}) {
  const images = attachments.filter(a => a.type === 'image');
  const files  = attachments.filter(a => a.type === 'file');
  if (!attachments.length) return null;
  return (
    <div>
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: files.length > 0 ? '0.5rem' : 0 }}>
          {images.map(a => (
            <div key={a.id} style={{ position: 'relative' }}>
              <img src={a.url} alt={a.name}
                style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)', display: 'block' }}
                onClick={() => window.open(a.url, '_blank')}
              />
              {onRemove && (
                <button onClick={() => onRemove(a.id)}
                  style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#1a1f2e', border: '1px solid rgba(248,113,113,0.5)', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', color: '#f87171', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, fontFamily: 'inherit' }}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {files.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.65rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.85rem' }}>📎</span>
          <a href={a.url} download={a.name} target="_blank" rel="noreferrer"
            style={{ flex: 1, fontSize: '0.78rem', color: '#94a3b8', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.name}
          </a>
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{fmtSize(a.size)}</span>
          {onRemove && (
            <button onClick={() => onRemove(a.id)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '1rem', padding: '0 0.1rem', lineHeight: 1, flexShrink: 0, fontFamily: 'inherit' }}>
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── 리치 텍스트 에디터 ──────────────────────────────────────── */
function RichEditor({ initialValue, onChange, onImageUpload }: {
  initialValue: string;
  onChange: (html: string) => void;
  onImageUpload: (file: File) => Promise<string | null>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = textToHtml(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = useCallback(() => {
    onChange(editorRef.current?.innerHTML ?? '');
  }, [onChange]);

  function exec(cmd: string, arg?: string) {
    document.execCommand(cmd, false, arg);
    editorRef.current?.focus();
    sync();
  }

  function applyFontSize(size: string) {
    document.execCommand('fontSize', false, '7');
    editorRef.current?.querySelectorAll('font[size="7"]').forEach(el => {
      const span = document.createElement('span');
      span.style.fontSize = size;
      while (el.firstChild) span.appendChild(el.firstChild);
      el.parentNode?.replaceChild(span, el);
    });
    editorRef.current?.focus();
    sync();
  }

  function insertLink() {
    const url = window.prompt('링크 URL을 입력하세요 (예: https://example.com)');
    if (!url?.trim()) return;
    const href = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    document.execCommand('createLink', false, href);
    editorRef.current?.querySelectorAll(`a[href="${href}"]`).forEach(a => {
      if (!a.getAttribute('target')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noreferrer');
      }
    });
    editorRef.current?.focus();
    sync();
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    setUploading(true);
    const url = await onImageUpload(file);
    setUploading(false);
    if (!url || !editorRef.current) return;

    const img = document.createElement('img');
    img.src = url;
    img.alt = '이미지';

    const sel = window.getSelection();
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.setEndAfter(img);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorRef.current.appendChild(img);
    }
    sync();
  }

  const TB: React.CSSProperties = {
    padding: '0.18rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem',
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.5,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.65)',
  };
  const SEP: React.CSSProperties = {
    display: 'inline-block', width: '1px', alignSelf: 'stretch',
    background: 'rgba(255,255,255,0.1)', margin: '0 0.1rem',
  };

  return (
    <div>
      {/* 툴바 */}
      <div className="editor-toolbar no-print" style={{
        display: 'flex', gap: '0.22rem', flexWrap: 'wrap', alignItems: 'center',
        padding: '0.35rem 0.55rem',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px 8px 0 0',
      }}>
        <button onMouseDown={e => { e.preventDefault(); exec('bold'); }} style={TB} title="굵게 (Ctrl+B)"><b>B</b></button>
        <button onMouseDown={e => { e.preventDefault(); exec('italic'); }} style={TB} title="기울임 (Ctrl+I)"><i>I</i></button>
        <button onMouseDown={e => { e.preventDefault(); exec('underline'); }} style={{ ...TB, textDecoration: 'underline' }} title="밑줄 (Ctrl+U)"><u>U</u></button>
        <button onMouseDown={e => { e.preventDefault(); exec('strikeThrough'); }} style={{ ...TB, textDecoration: 'line-through' }} title="취소선"><s>S</s></button>
        <span style={SEP} />
        <button onMouseDown={e => { e.preventDefault(); applyFontSize('0.78em'); }} style={{ ...TB, fontSize: '0.66rem' }} title="작게">소</button>
        <button onMouseDown={e => { e.preventDefault(); applyFontSize('1em'); }} style={{ ...TB, fontSize: '0.8rem' }} title="보통">중</button>
        <button onMouseDown={e => { e.preventDefault(); applyFontSize('1.22em'); }} style={{ ...TB, fontSize: '0.92rem' }} title="크게">대</button>
        <button onMouseDown={e => { e.preventDefault(); applyFontSize('1.5em'); }} style={{ ...TB, fontSize: '1.05rem' }} title="매우 크게">특대</button>
        <span style={SEP} />
        <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }} style={TB} title="글머리 목록">• 목록</button>
        <button onMouseDown={e => { e.preventDefault(); exec('insertOrderedList'); }} style={TB} title="번호 목록">① 목록</button>
        <span style={SEP} />
        <button onMouseDown={e => { e.preventDefault(); insertLink(); }} style={TB} title="링크 삽입">🔗 링크</button>
        {uploading && (
          <span style={{ fontSize: '0.72rem', color: '#a5b4fc', marginLeft: '0.2rem' }}>이미지 업로드 중…</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'rgba(255,255,255,0.22)', whiteSpace: 'nowrap' }}>
          이미지: Ctrl+V
        </span>
      </div>

      {/* 에디터 본문 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onPaste={handlePaste}
        lang="ko"
        spellCheck={false}
        style={{
          minHeight: '280px', maxHeight: '600px', overflowY: 'auto',
          padding: '0.75rem 0.85rem',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          color: '#fff', fontSize: '0.88rem', outline: 'none',
          fontFamily: 'inherit', lineHeight: 1.8, wordBreak: 'break-word',
        }}
      />
    </div>
  );
}

/* ── 메인 컴포넌트 ─────────────────────────────────────────── */
export default function MeetingDetailClient({
  meeting: initial,
  isAdmin = false,
  availableCategories = [],
}: {
  meeting: MeetingRow;
  isAdmin?: boolean;
  availableCategories?: string[];
}) {
  const [meeting, setMeeting] = useState<MeetingRow>(initial);
  const [draft, setDraft] = useState({
    title: initial.title,
    category: initial.category,
    content: initial.content,
    meeting_date: initial.meeting_date,
  });
  const [todoInput, setTodoInput]   = useState('');
  const [dueDate, setDueDate]       = useState('');
  const [saveMsg, setSaveMsg]       = useState('');
  const [calMsg, setCalMsg]         = useState('');
  const [isPending, startTransition]       = useTransition();
  const [todosPending, startTodoTransition] = useTransition();
  const [metaPending, startMetaTransition]  = useTransition();

  const [attachments, setAttachments] = useState<Attachment[]>(initial.attachments ?? []);
  const [dragOver, setDragOver]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function flash() { setSaveMsg('저장됨'); setTimeout(() => setSaveMsg(''), 2000); }

  function handleSave() {
    startTransition(async () => {
      const res = await updateMeeting(meeting.id, draft);
      if (res.error) { alert(res.error); return; }
      setMeeting(m => ({ ...m, ...draft }));
      flash();
    });
  }

  function handleStatusChange(status: TaskStatus) {
    setMeeting(m => ({ ...m, status }));
    startMetaTransition(async () => { await updateMeeting(meeting.id, { status }); flash(); });
  }

  function handlePriorityChange(priority: TaskPriority) {
    setMeeting(m => ({ ...m, priority }));
    startMetaTransition(async () => { await updateMeeting(meeting.id, { priority }); flash(); });
  }

  function handleSecurityChange(security_level: TaskSecurity) {
    setMeeting(m => ({ ...m, security_level }));
    startMetaTransition(async () => { await updateMeeting(meeting.id, { security_level }); flash(); });
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

  async function uploadFile(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/meetings/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as Record<string, string>;
        alert(e.error || '업로드에 실패했습니다.');
        return null;
      }
      return res.json() as Promise<{ url: string; name: string; size: number; mime: string; type: 'image' | 'file' }>;
    } catch { return null; }
  }

  async function uploadImageFile(file: File): Promise<string | null> {
    const result = await uploadFile(file);
    return result?.url ?? null;
  }

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    const results = await Promise.all(files.map(uploadFile));
    const newAtts = results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map(r => ({ id: genId(), ...r }) as Attachment);
    if (!newAtts.length) return;
    const updated = [...attachments, ...newAtts];
    setAttachments(updated);
    await updateMeeting(meeting.id, { attachments: updated });
    flash();
  }

  async function removeAttachment(id: string) {
    const updated = attachments.filter(a => a.id !== id);
    setAttachments(updated);
    await updateMeeting(meeting.id, { attachments: updated });
    flash();
  }

  const pendingCount = meeting.todos.filter(t => !t.done).length;
  const sortedTodos  = [...meeting.todos].sort((a, b) => +a.done - +b.done);
  const catStyle = cs(draft.category);

  return (
    <div className="auth-card" style={{ padding: '1.75rem' }}>
      <style>{`
        @media print {
          html, body { background: #fff !important; margin: 0; padding: 0; }
          * { color: #111 !important; border-color: #ddd !important; }
          .orb-1, .orb-2, .orb-3 { display: none !important; }
          .no-print { display: none !important; }
          .auth-card { background: #fff !important; border: 1px solid #e5e7eb !important; box-shadow: none !important; padding: 1.25rem !important; }
          .print-content-box { background: #f9f9f9 !important; border: 1px solid #e5e7eb !important; }
          .print-todo-row { background: #fff !important; border: 1px solid #e5e7eb !important; }
          .print-meta-row { display: flex !important; }
          [contenteditable="true"] { border: none !important; background: transparent !important; min-height: unset !important; max-height: unset !important; padding: 0.5rem 0 !important; }
          .rich-content a { color: #1a56db !important; }
          .rich-content img { max-width: 100% !important; }
          input[type="text"], input[type="date"], input[list] { border: none !important; background: transparent !important; padding: 0 !important; }
        }
        @media screen {
          .print-meta-row { display: none !important; }
        }
        .rich-content a { color: #93c5fd; text-decoration: underline; word-break: break-all; }
        .rich-content a:hover { color: #bfdbfe; }
        .rich-content img { max-width: 100%; max-height: 480px; object-fit: contain; border-radius: 8px; cursor: pointer; margin: 0.5rem 0; display: block; border: 1px solid rgba(255,255,255,0.08); }
        .rich-content ul, .rich-content ol { padding-left: 1.5rem; margin: 0.4rem 0; }
        .rich-content li { margin-bottom: 0.15rem; }
      `}</style>

      {/* ── 과업명 (항상 편집 가능) ── */}
      <div style={{ marginBottom: '1.25rem' }}>
        <input
          value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          placeholder="과업명"
          style={{ ...INPUT, fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.55rem' }}
        />

        {/* 분류 + 마감일 */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <input
            list="cat-list"
            value={draft.category}
            onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
            placeholder="분류 선택 또는 직접 입력"
            style={{ ...INPUT_SM, flex: 1, marginBottom: 0 }}
          />
          <datalist id="cat-list">
            {availableCategories.map(c => <option key={c} value={c} />)}
          </datalist>
          <input
            type="date"
            value={draft.meeting_date}
            onChange={e => setDraft(d => ({ ...d, meeting_date: e.target.value }))}
            style={{ ...INPUT_SM, flex: 1, marginBottom: 0 }}
          />
        </div>

        {/* 수정일 표시 */}
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.22)', marginBottom: '0.75rem' }}>
          최종 저장: {fmtDate(meeting.updated_at)}
        </div>

        {/* 인쇄 전용 메타 */}
        <div className="print-meta-row" style={{ gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.5rem', fontSize: '0.82rem' }}>
          <span>상태: <strong>{meeting.status ?? '대기'}</strong></span>
          <span>우선순위: <strong>{meeting.priority ?? '보통'}</strong></span>
          <span>보안등급: <strong>{meeting.security_level ?? '공개'}</strong></span>
        </div>

        {/* 상태 + 우선순위 */}
        <div className="no-print" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginRight: '0.1rem' }}>상태</span>
          {STATUSES.map(s => {
            const meta = STATUS_META[s];
            const active = (meeting.status ?? '대기') === s;
            return (
              <button key={s} onClick={() => handleStatusChange(s)} disabled={metaPending}
                style={{ padding: '0.2rem 0.7rem', borderRadius: '20px', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                  background: active ? meta.bg : 'rgba(255,255,255,0.03)',
                  border: active ? `1px solid ${meta.color}88` : '1px solid rgba(255,255,255,0.1)',
                  color: active ? meta.color : 'rgba(255,255,255,0.32)',
                }}>{s}</button>
            );
          })}
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginLeft: '0.4rem', marginRight: '0.1rem' }}>우선순위</span>
          {PRIORITIES.map(p => {
            const meta = PRIORITY_META[p];
            const active = (meeting.priority ?? '보통') === p;
            return (
              <button key={p} onClick={() => handlePriorityChange(p)} disabled={metaPending}
                style={{ padding: '0.2rem 0.7rem', borderRadius: '20px', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                  background: active ? meta.bg : 'rgba(255,255,255,0.03)',
                  border: active ? `1px solid ${meta.color}88` : '1px solid rgba(255,255,255,0.1)',
                  color: active ? meta.color : 'rgba(255,255,255,0.32)',
                }}>{p}</button>
            );
          })}
        </div>

        {/* 보안등급 */}
        <div className="no-print" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', alignSelf: 'center', marginRight: '0.1rem' }}>보안등급</span>
          {isAdmin ? (
            SECURITY_LEVELS.map(sl => {
              const m = SECURITY_META[sl];
              const active = (meeting.security_level ?? '공개') === sl;
              return (
                <button key={sl} onClick={() => handleSecurityChange(sl)} disabled={metaPending}
                  style={{ padding: '0.2rem 0.7rem', borderRadius: '20px', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                    background: active ? m.bg : 'rgba(255,255,255,0.03)',
                    border: active ? `1px solid ${m.border}` : '1px solid rgba(255,255,255,0.1)',
                    color: active ? m.color : 'rgba(255,255,255,0.32)',
                  }}>{sl}</button>
              );
            })
          ) : (
            (() => {
              const sl = (meeting.security_level ?? '공개') as TaskSecurity;
              const m  = SECURITY_META[sl];
              return <span style={{ padding: '0.2rem 0.7rem', borderRadius: '20px', fontSize: '0.73rem', fontWeight: 700, background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>{sl}</span>;
            })()
          )}
        </div>
      </div>

      {/* ── 내용/메모 ── */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
          <span style={SEC_LABEL}>📝 내용 / 메모</span>
          <div className="no-print" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            {saveMsg && <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>{saveMsg}</span>}
            <button onClick={handleSave} style={BTN_SAVE} disabled={isPending}>
              {isPending ? '저장 중…' : '저장'}
            </button>
            <button onClick={() => window.print()} style={BTN_PRINT}>🖨 인쇄</button>
          </div>
        </div>

        {/* 리치 텍스트 에디터 (항상 활성) */}
        <div className="print-content-box" style={{ borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <RichEditor
            initialValue={draft.content}
            onChange={html => setDraft(d => ({ ...d, content: html }))}
            onImageUpload={uploadImageFile}
          />
        </div>

        {/* 첨부파일 드롭존 */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async e => { e.preventDefault(); setDragOver(false); await handleFiles(Array.from(e.dataTransfer.files)); }}
          onClick={() => fileInputRef.current?.click()}
          className="no-print"
          style={{
            border: `1px dashed ${dragOver ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: '8px', padding: '0.65rem 1rem', textAlign: 'center', cursor: 'pointer',
            color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem',
            background: dragOver ? 'rgba(99,102,241,0.06)' : 'transparent',
            transition: 'all 0.15s', marginTop: '0.65rem',
            marginBottom: attachments.length ? '0.65rem' : 0,
          }}
        >
          📎 파일 / 이미지 첨부 — 클릭 또는 드래그 앤 드롭 (최대 20MB)
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => { handleFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />

        {attachments.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600, marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
              📎 첨부파일
            </div>
            <AttachmentView attachments={attachments} onRemove={removeAttachment} />
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
              <div key={todo.id} className="print-todo-row" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.8rem', borderRadius: '8px', background: todo.done ? 'rgba(255,255,255,0.02)' : 'rgba(251,191,36,0.05)', border: todo.done ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(251,191,36,0.18)', transition: 'all 0.15s' }}>
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
                <button onClick={() => deleteTodo(todo.id)} className="no-print"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '1rem', padding: '0 0.2rem', lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="no-print" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input value={todoInput} onChange={e => setTodoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTodo(); }}
            placeholder="항목을 입력하고 Enter…"
            lang="ko" spellCheck={false}
            style={{ ...INPUT, flex: '1 1 200px', marginBottom: 0, fontSize: '0.83rem' }}
          />
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            title="기한 설정 (선택)" style={{ ...INPUT_SM, flex: '0 0 auto', marginBottom: 0, width: '132px' }}
          />
          <button onClick={addTodo} style={{ ...BTN_SAVE, flexShrink: 0 }}>추가</button>
        </div>
        {calMsg && (
          <p className="no-print" style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: calMsg.includes('실패') ? '#f87171' : '#4ade80' }}>{calMsg}</p>
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
const BTN_PRINT: React.CSSProperties = {
  padding: '0.28rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer',
  background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7', fontFamily: 'inherit',
};
