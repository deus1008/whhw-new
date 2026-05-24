'use client';

import { useState } from 'react';

type SearchResult = {
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

export default function TestSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setResults(json.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>RAG 검색 테스트</h1>

      <div style={rowStyle}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="검색할 질문을 입력하세요"
          style={inputStyle}
        />
        <button onClick={handleSearch} disabled={loading} style={btnStyle}>
          {loading ? '검색 중…' : '검색'}
        </button>
      </div>

      {error && (
        <div style={errorStyle}>
          오류: {error}
        </div>
      )}

      {!loading && !error && results.length === 0 && query && (
        <p style={emptyStyle}>검색 결과가 없습니다.</p>
      )}

      {results.map((r, i) => (
        <div key={i} style={cardStyle}>
          <div style={metaStyle}>
            <span style={simStyle}>유사도 {(r.similarity * 100).toFixed(1)}%</span>
            <span style={docStyle}>문서 ID: {r.document_id} · 청크 #{r.chunk_index}</span>
          </div>
          <p style={contentStyle}>{r.content.slice(0, 400)}{r.content.length > 400 ? '…' : ''}</p>
        </div>
      ))}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '3rem auto',
  padding: '0 1rem',
  fontFamily: 'sans-serif',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 700,
  marginBottom: '1.5rem',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginBottom: '1.5rem',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.6rem 0.9rem',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: '0.95rem',
};

const btnStyle: React.CSSProperties = {
  padding: '0.6rem 1.2rem',
  borderRadius: 8,
  border: 'none',
  background: '#0070f3',
  color: '#fff',
  fontSize: '0.95rem',
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: 8,
  background: '#fff0f0',
  border: '1px solid #ffcccc',
  color: '#cc0000',
  marginBottom: '1rem',
};

const emptyStyle: React.CSSProperties = {
  color: '#888',
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 10,
  padding: '0.9rem 1.1rem',
  marginBottom: '0.75rem',
  background: '#fafafa',
};

const metaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  marginBottom: '0.5rem',
  alignItems: 'center',
};

const simStyle: React.CSSProperties = {
  fontWeight: 700,
  color: '#0070f3',
  fontSize: '0.85rem',
};

const docStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#999',
};

const contentStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  lineHeight: 1.6,
  color: '#333',
  whiteSpace: 'pre-wrap',
  margin: 0,
};
