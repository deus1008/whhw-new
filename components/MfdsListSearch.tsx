'use client';

import { useState, useMemo, useTransition } from 'react';

type Col = { key: string; label: string; w?: number };
type Row = Record<string, string>;

export default function MfdsListSearch({ type, columns, placeholder }: {
  type: 'recall' | 'admin';
  columns: Col[];
  placeholder: string;
}) {
  const [query, setQuery]     = useState('');
  const [rows, setRows]       = useState<Row[]>([]);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice]   = useState('');
  const [listQuery, setListQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>(columns[0].key);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [isPending, startTransition] = useTransition();

  function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    startTransition(async () => {
      setNotice('');
      try {
        const res = await fetch(`/api/mfds-list?type=${type}&q=${encodeURIComponent(query.trim())}`);
        const data = await res.json() as { items?: Row[]; notAvailable?: boolean; message?: string };
        setRows(data.items ?? []);
        setSearched(true);
        setListQuery('');
        if (data.notAvailable) setNotice(data.message ?? '현재 조회할 수 없습니다.');
      } catch {
        setRows([]); setSearched(true); setNotice('조회 중 오류가 발생했습니다.');
      }
    });
  }

  const view = useMemo(() => {
    let list = rows;
    const lq = listQuery.trim().toLowerCase();
    if (lq) {
      const tokens = lq.split(/[\s,+]+/).filter(Boolean);
      list = list.filter(r => {
        const hay = Object.values(r).join(' ').toLowerCase();
        return tokens.some(t => hay.includes(t));
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'ko') * dir);
  }, [rows, listQuery, sortKey, sortDir]);

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  }

  return (
    <div>
      <form onSubmit={runSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, minWidth: 240, padding: '0.55rem 0.85rem', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }} />
        <button type="submit" disabled={isPending}
          style={{ padding: '0.55rem 1.4rem', borderRadius: 9, background: 'rgba(59,130,246,0.9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
          {isPending ? '조회 중…' : '조회'}
        </button>
      </form>

      {notice && (
        <div style={{ padding: '0.7rem 1rem', borderRadius: 10, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fde68a', fontSize: '0.82rem', marginBottom: '0.8rem' }}>
          ⚠ {notice}
        </div>
      )}

      {searched && !notice && rows.length === 0 && !isPending && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>조회 결과가 없습니다.</p>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
            <input value={listQuery} onChange={e => setListQuery(e.target.value)}
              placeholder="🔍 결과 내 검색 (공백/쉼표/+로 여러 개)"
              style={{ flex: 1, minWidth: 220, padding: '0.42rem 0.7rem', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{view.length.toLocaleString()}건</span>
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  {columns.map(c => {
                    const active = sortKey === c.key;
                    return (
                      <th key={c.key} onClick={() => toggleSort(c.key)} style={{
                        padding: '0.5rem 0.7rem', fontSize: '0.74rem', fontWeight: 700, color: active ? '#93c5fd' : 'rgba(255,255,255,0.55)',
                        borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                        textAlign: 'left', width: c.w, background: 'rgba(255,255,255,0.03)',
                      }}>{c.label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {view.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {columns.map(c => (
                      <td key={c.key} style={{ padding: '0.45rem 0.7rem', color: 'rgba(255,255,255,0.85)', verticalAlign: 'top' }}>{r[c.key] || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
