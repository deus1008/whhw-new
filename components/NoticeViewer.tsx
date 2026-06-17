'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CSSProperties } from 'react';

type Notice = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function NoticeViewer({ notice }: { notice: Notice }) {
  return (
    <>
      <style>{`
        @media print {
          body { background: #fff !important; color: #111 !important; }
          .no-print { display: none !important; }
          .notice-body { color: #111 !important; background: #fff !important; }
          .notice-body h1,.notice-body h2,.notice-body h3,
          .notice-body p,.notice-body li,.notice-body td,.notice-body th { color: #111 !important; }
          .notice-body table { border-collapse: collapse !important; width: 100% !important; }
          .notice-body th,.notice-body td { border: 1px solid #ccc !important; padding: 6px 10px !important; }
          .notice-body pre,.notice-body code { background: #f4f4f4 !important; color: #333 !important; }
        }
      `}</style>

      {/* 헤더 버튼 */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <a href="/notices" style={{
          padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
        }}>← 목록</a>
        <button onClick={() => window.print()} style={{
          padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
          background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.35)',
          color: '#60a5fa', cursor: 'pointer',
        }}>🖨 인쇄</button>
      </div>

      {/* 핀 배지 */}
      {notice.is_pinned && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.2rem 0.7rem', borderRadius: '100px', marginBottom: '0.75rem',
          background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)',
          fontSize: '0.72rem', fontWeight: 700, color: '#fbbf24',
        }}>
          📌 중요 공지
        </div>
      )}

      {/* 제목 */}
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: '0 0 0.4rem' }}>
        {notice.title}
      </h1>
      <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', marginBottom: '2rem' }}>
        {fmtDate(notice.created_at)}
        {notice.updated_at !== notice.created_at && ` · 수정 ${fmtDate(notice.updated_at)}`}
      </p>

      {/* 구분선 */}
      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.75rem' }} />

      {/* 본문 */}
      <div className="notice-body" style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.75, fontSize: '0.92rem' }}>
        <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {notice.content}
        </Markdown>
      </div>
    </>
  );
}

const MD_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', margin: '1.8rem 0 0.6rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.4rem' }}>{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 style={{ fontSize: '1.08rem', fontWeight: 700, color: '#e2e8f0', margin: '1.5rem 0 0.5rem' }}>{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 style={{ fontSize: '0.97rem', fontWeight: 700, color: '#cbd5e1', margin: '1.2rem 0 0.4rem' }}>{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ margin: '0 0 0.85rem', color: 'rgba(255,255,255,0.8)' }}>{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul style={{ margin: '0 0 0.85rem', paddingLeft: '1.4rem', color: 'rgba(255,255,255,0.75)' }}>{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol style={{ margin: '0 0 0.85rem', paddingLeft: '1.4rem', color: 'rgba(255,255,255,0.75)' }}>{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li style={{ margin: '0.25rem 0' }}>{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ color: '#fff', fontWeight: 700 }}>{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em style={{ color: '#c4b5fd' }}>{children}</em>,
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote style={{ borderLeft: '3px solid rgba(251,191,36,0.5)', margin: '1rem 0', paddingLeft: '1rem', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>{children}</blockquote>
  ),
  code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
    inline ? (
      <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '4px', padding: '0.1em 0.4em', fontSize: '0.85em', color: '#93c5fd' }}>{children}</code>
    ) : (
      <code style={{ display: 'block' }}>{children}</code>
    ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '1rem', overflowX: 'auto', fontSize: '0.83rem', margin: '0 0 1rem', color: '#e2e8f0' }}>{children}</pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 1rem' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th style={{ border: '1px solid rgba(255,255,255,0.12)', padding: '0.5rem 0.8rem', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontWeight: 600, textAlign: 'left' }}>{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td style={{ border: '1px solid rgba(255,255,255,0.08)', padding: '0.45rem 0.8rem', color: 'rgba(255,255,255,0.75)' }}>{children}</td>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '1.5rem 0' }} />,
};
