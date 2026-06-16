'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CSSProperties } from 'react';

type Report = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReportViewer({ report }: { report: Report }) {
  return (
    <>
      <style>{`
        @media print {
          body { background: #fff !important; color: #111 !important; }
          .no-print { display: none !important; }
          .report-body { color: #111 !important; background: #fff !important; }
          .report-body h1, .report-body h2, .report-body h3,
          .report-body h4, .report-body p, .report-body li,
          .report-body td, .report-body th { color: #111 !important; }
          .report-body table { border-collapse: collapse !important; width: 100% !important; }
          .report-body th, .report-body td { border: 1px solid #ccc !important; padding: 6px 10px !important; }
          .report-body pre, .report-body code { background: #f4f4f4 !important; color: #333 !important; }
          .report-body blockquote { border-left: 3px solid #999 !important; color: #555 !important; }
          .print-title { font-size: 22pt !important; color: #000 !important; }
          .print-meta  { color: #555 !important; }
        }
      `}</style>

      {/* 헤더 */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <a href="/reports" style={{
          padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.6)', textDecoration: 'none', cursor: 'pointer',
        }}>← 목록</a>
        <button
          onClick={() => window.print()}
          style={{
            padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
            background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.35)',
            color: '#60a5fa', cursor: 'pointer',
          }}
        >🖨 인쇄</button>
      </div>

      {/* 제목 */}
      <h1 className="print-title" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: '0 0 0.4rem' }}>
        {report.title}
      </h1>
      <p className="print-meta" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', marginBottom: '2rem' }}>
        작성일 {fmtDate(report.created_at)}
        {report.updated_at !== report.created_at && ` · 수정 ${fmtDate(report.updated_at)}`}
      </p>

      {/* 본문 마크다운 */}
      <div className="report-body" style={bodyStyle}>
        <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {report.content}
        </Markdown>
      </div>
    </>
  );
}

const bodyStyle: CSSProperties = {
  color: 'rgba(255,255,255,0.85)',
  lineHeight: 1.75,
  fontSize: '0.92rem',
};

/* 마크다운 요소별 스타일 오버라이드 */
const MD_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', margin: '1.8rem 0 0.6rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.4rem' }}>{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', margin: '1.5rem 0 0.5rem' }}>{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#cbd5e1', margin: '1.2rem 0 0.4rem' }}>{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#94a3b8', margin: '1rem 0 0.3rem' }}>{children}</h4>
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
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ margin: '0.25rem 0' }}>{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ color: '#fff', fontWeight: 700 }}>{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em style={{ color: '#c4b5fd' }}>{children}</em>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote style={{
      borderLeft: '3px solid rgba(96,165,250,0.5)', margin: '1rem 0',
      paddingLeft: '1rem', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic',
    }}>{children}</blockquote>
  ),
  code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
    inline ? (
      <code style={{
        background: 'rgba(255,255,255,0.08)', borderRadius: '4px',
        padding: '0.1em 0.4em', fontSize: '0.85em', color: '#93c5fd',
      }}>{children}</code>
    ) : (
      <code style={{ display: 'block' }}>{children}</code>
    ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre style={{
      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px', padding: '1rem', overflowX: 'auto',
      fontSize: '0.83rem', margin: '0 0 1rem', color: '#e2e8f0',
    }}>{children}</pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 1rem' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th style={{
      border: '1px solid rgba(255,255,255,0.12)', padding: '0.5rem 0.8rem',
      background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontWeight: 600,
      textAlign: 'left',
    }}>{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td style={{
      border: '1px solid rgba(255,255,255,0.08)', padding: '0.45rem 0.8rem',
      color: 'rgba(255,255,255,0.75)',
    }}>{children}</td>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '1.5rem 0' }} />
  ),
};
