'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  initialMessages?: Message[];
}

export default function Chat({ initialMessages = [] }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 최신 메시지로 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;

    const userMsg: Message = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setError('');
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('응답 스트림을 읽을 수 없습니다.');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') break;

          const parsed = JSON.parse(raw) as { text?: string; error?: string };
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: updated[updated.length - 1].content + parsed.text,
              };
              return updated;
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.error('[Chat send error]', err);
      setError(msg);
      // 빈 AI 말풍선 제거
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setError('');
    try {
      const res = await fetch('/api/chat/clear', { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      setMessages([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.error('[Chat clear error]', err);
      setError(msg);
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div style={styles.wrapper} className="chat-height">
      {/* 헤더 */}
      <div style={styles.header}>
        <span style={styles.headerLeft}>
          <span style={styles.headerDot} />
          AI 채팅
        </span>

        {/* 대화 초기화 버튼 */}
        {messages.length > 0 && !streaming && (
          confirmClear ? (
            <span style={styles.confirmRow}>
              <span style={styles.confirmText}>정말 삭제할까요?</span>
              <button
                onClick={handleClear}
                disabled={clearing}
                style={{ ...styles.confirmBtn, ...styles.confirmBtnDanger }}
              >
                {clearing ? '삭제 중…' : '삭제'}
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                disabled={clearing}
                style={styles.confirmBtn}
              >
                취소
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              style={styles.clearBtn}
            >
              대화 비우기
            </button>
          )
        )}
      </div>

      {/* 메시지 목록 */}
      <div style={styles.messageList}>
        {messages.length === 0 && (
          <p style={styles.placeholder}>메시지를 입력해 대화를 시작하세요.</p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.bubbleRow,
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'assistant' && (
              <span style={styles.avatar}>AI</span>
            )}
            <div
              style={{
                ...styles.bubble,
                ...(msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI),
              }}
            >
              {msg.content || (streaming && i === messages.length - 1
                ? <TypingDots />
                : ''
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* 에러 배너 */}
      {error && (
        <div style={styles.error}>
          오류: {error}
        </div>
      )}

      {/* 입력 폼 */}
      <form onSubmit={handleSubmit} style={styles.form}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지 입력… (Enter 전송, Shift+Enter 줄바꿈)"
          disabled={streaming}
          rows={2}
          style={styles.textarea}
          className="chat-textarea"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="chat-send"
          style={{
            ...styles.sendBtn,
            opacity: streaming || !input.trim() ? 0.4 : 1,
          }}
        >
          {streaming ? (
            <span style={styles.spinner} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </form>

      <style>{`
        @keyframes typing {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .chat-typing span {
          display: inline-block;
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--text-muted);
          animation: typing 1.2s ease-in-out infinite;
        }
        .chat-typing span:nth-child(2) { animation-delay: 0.2s; }
        .chat-typing span:nth-child(3) { animation-delay: 0.4s; }
        .chat-textarea:focus {
          border-color: var(--accent-1) !important;
          box-shadow: 0 0 0 3px rgba(79,142,247,0.14) !important;
        }
        .chat-send:hover:not(:disabled) { opacity: 0.85 !important; transform: translateY(-1px); }
      `}</style>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="chat-typing" style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      <span /><span /><span />
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'rgba(13, 21, 38, 0.65)',
    border: '1px solid rgba(255,255,255,0.09)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: '20px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    width: '100%',
    /* height은 chat-height CSS 클래스로 제어 */
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.85rem 1.4rem',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    flexShrink: 0,
    gap: '0.8rem',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: '0.02em',
  },
  headerDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #4f8ef7, #a259ff)',
    boxShadow: '0 0 8px rgba(79,142,247,0.6)',
    display: 'inline-block',
    flexShrink: 0,
  },
  clearBtn: {
    padding: '0.3rem 0.75rem',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    color: 'var(--text-muted)',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.2s',
    flexShrink: 0,
  },
  confirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },
  confirmText: {
    fontSize: '0.78rem',
    color: 'var(--text-muted)',
  },
  confirmBtn: {
    padding: '0.28rem 0.65rem',
    borderRadius: '7px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text-muted)',
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmBtnDanger: {
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)',
    color: '#fca5a5',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '1.2rem 1.4rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  placeholder: {
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
    textAlign: 'center',
    marginTop: '2rem',
  },
  bubbleRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
  },
  avatar: {
    flexShrink: 0,
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #4f8ef7, #a259ff)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.62rem',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.02em',
  },
  bubble: {
    maxWidth: '75%',
    padding: '0.65rem 1rem',
    borderRadius: '14px',
    fontSize: '0.88rem',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  bubbleUser: {
    background: 'linear-gradient(135deg, rgba(79,142,247,0.25), rgba(162,89,255,0.2))',
    border: '1px solid rgba(79,142,247,0.22)',
    color: 'var(--text-primary)',
    borderBottomRightRadius: '4px',
  },
  bubbleAI: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--text-primary)',
    borderBottomLeftRadius: '4px',
  },
  error: {
    margin: '0 1.4rem 0.6rem',
    padding: '0.6rem 0.9rem',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.22)',
    borderRadius: '10px',
    fontSize: '0.8rem',
    color: '#fca5a5',
    flexShrink: 0,
  },
  form: {
    display: 'flex',
    gap: '0.6rem',
    padding: '0.9rem 1.2rem',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    color: 'var(--text-primary)',
    padding: '0.65rem 0.9rem',
    fontSize: '16px',   /* iOS 자동 줌 방지 */
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
    transition: 'border-color 0.2s, box-shadow 0.2s',
    minHeight: '44px',
  },
  sendBtn: {
    flexShrink: 0,
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #4f8ef7, #a259ff)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s, transform 0.15s',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.7s linear infinite',
  },
};
