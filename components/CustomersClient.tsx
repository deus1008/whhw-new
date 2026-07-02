'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type CustomerRow = {
  no:           number;
  code:         string;
  level:        string;
  name:         string;
  root:         string;
  bizType:      string;
  start:        string;
  end:          string;
  bizNo:        string;
  address:      string;
  phone:        string;
  rep:          string;
  repEmail:     string;
  manager:      string;
  managerEmail: string;
  docScore:     number;
};

type LevelCount = { level: string; count: number };
type Meta = {
  levels: string[];
  levelCounts: LevelCount[];
  bizTypes: string[];
  totalCount: number;
  filename: string;
  updatedAt: string;
};

export default function CustomersClient() {
  const [query,    setQuery]    = useState('');
  const [level,    setLevel]    = useState('');
  const [bizType,  setBizType]  = useState('');
  const [items,    setItems]    = useState<CustomerRow[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [meta,     setMeta]     = useState<Meta>({ levels: [], levelCounts: [], bizTypes: [], totalCount: 0, filename: '', updatedAt: '' });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMetaLoading(true);
    fetch('/api/customers?meta=1')
      .then(r => r.json())
      .then(d => { setMeta(d); setMetaLoading(false); })
      .catch(() => setMetaLoading(false));
  }, []);

  const search = useCallback(async (pg = 1, opts?: { level?: string; bizType?: string }) => {
    setLoading(true);
    try {
      const effectiveLevel   = opts?.level   !== undefined ? opts.level   : level;
      const effectiveBizType = opts?.bizType !== undefined ? opts.bizType : bizType;
      const params = new URLSearchParams({ page: String(pg) });
      if (query)              params.set('q',       query);
      if (effectiveLevel)     params.set('level',   effectiveLevel);
      if (effectiveBizType)   params.set('bizType', effectiveBizType);
      const res  = await fetch(`/api/customers?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(pg);
      setSearched(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [query, level, bizType]);

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); search(1); }

  function reset() {
    setQuery(''); setLevel(''); setBizType('');
    setItems([]); setTotal(0); setSearched(false);
    inputRef.current?.focus();
  }

  const totalPages = Math.ceil(total / 50);
  const LEVEL_COLORS: Record<string, string> = {
    '1차': '#a78bfa', '2차': '#34d399', '3차': '#fbbf24',
    '4차': '#f87171', '5차': '#60a5fa', '6차': '#f472b6',
    '7차': '#a3e635', '8차': '#fb923c', '9차': '#94a3b8',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* ── 레벨별 요약 ── */}
      {(metaLoading || meta.levelCounts.length > 0) && (
        <div style={card}>
          {metaLoading ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              ⏳ 데이터 로딩 중… (최초 1회 파일 파싱)
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  📊 재위탁 차수별 현황
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  전체 <strong style={{ color: '#a5b4fc' }}>{meta.totalCount.toLocaleString()}</strong>개
                  {meta.filename && <span style={{ marginLeft: '0.5rem', color: 'rgba(255,255,255,0.2)' }}>— {meta.filename}</span>}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {meta.levelCounts.map(lc => {
                  const color = LEVEL_COLORS[lc.level] ?? '#94a3b8';
                  const pct   = meta.totalCount > 0 ? (lc.count / meta.totalCount) * 100 : 0;
                  return (
                    <div
                      key={lc.level}
                      onClick={() => { const nl = level === lc.level ? '' : lc.level; setLevel(nl); search(1, { level: nl }); }}
                      style={{
                        cursor: 'pointer', borderRadius: '10px', padding: '0.55rem 1rem',
                        background: level === lc.level ? `rgba(${hexToRgb(color)},0.15)` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${level === lc.level ? color : 'rgba(255,255,255,0.08)'}`,
                        display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: '80px',
                      }}
                    >
                      <span style={{ fontSize: '0.7rem', color, fontWeight: 700 }}>{lc.level}</span>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {lc.count.toLocaleString()}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
              {meta.updatedAt && (
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', margin: '0.6rem 0 0', textAlign: 'right' }}>
                  기준: {meta.updatedAt}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 검색 폼 ── */}
      <div style={card}>
        <div style={{ marginBottom: '0.8rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            🏢 거래처 검색
          </h2>
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            업체명·코드·사업자번호·대표자·주소로 검색하세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="업체명 / 사업자번호 / 대표자명 / 주소 검색"
              style={{ flex: 1, ...inputSel }}
            />
            <button type="submit" disabled={loading}
              style={{ padding: '0.55rem 1.4rem', borderRadius: 9, cursor: loading ? 'not-allowed' : 'pointer',
                background: 'rgba(52,211,153,0.18)', border: '1px solid rgba(52,211,153,0.4)',
                color: '#34d399', fontWeight: 700, fontSize: '0.88rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {loading ? '⏳' : '🔍 검색'}
            </button>
            {searched && (
              <button type="button" onClick={reset}
                style={{ padding: '0.55rem 0.9rem', borderRadius: 9, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171', fontWeight: 600, fontSize: '0.82rem', fontFamily: 'inherit' }}>
                초기화
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={level} onChange={e => setLevel(e.target.value)} style={inputSel}>
              <option value="">전체 구분</option>
              {meta.levels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={bizType} onChange={e => setBizType(e.target.value)} style={inputSel}>
              <option value="">개인/법인 전체</option>
              {meta.bizTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </form>
      </div>

      {/* ── 결과 ── */}
      {loading && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>⏳ 검색 중…</p>
      )}

      {!loading && searched && items.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-muted)' }}>검색 결과가 없습니다.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              총 <strong style={{ color: 'var(--text-primary)' }}>{total.toLocaleString()}</strong>건
              {totalPages > 1 && ` (${page}/${totalPages} 페이지)`}
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                <PgBtn label="◀" disabled={page <= 1}         onClick={() => search(page - 1)} />
                {pageRange(page, totalPages).map((pg, i) =>
                  pg === '…'
                    ? <span key={`e${i}`} style={{ color: 'var(--text-muted)', lineHeight: '2rem', padding: '0 4px' }}>…</span>
                    : <PgBtn key={pg} label={String(pg)} active={pg === page} onClick={() => search(pg as number)} />
                )}
                <PgBtn label="▶" disabled={page >= totalPages} onClick={() => search(page + 1)} />
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {['No','업체명','구분','1차업체','개인/법인','계약기간','사업자번호','대표자','담당자','주소'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => {
                  const color = LEVEL_COLORS[c.level] ?? '#94a3b8';
                  const isExpired = c.end && new Date(c.end) < new Date();
                  return (
                    <tr key={`${c.no}-${i}`} style={{
                      borderTop: '1px solid rgba(255,255,255,0.04)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}>
                      <td style={{ ...td, color: 'var(--text-muted)', width: 36, textAlign: 'center' }}>{c.no}</td>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)', minWidth: 120 }}>{c.name || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: '0.68rem', padding: '0.1rem 0.5rem', borderRadius: 4,
                          background: `rgba(${hexToRgb(color)},0.12)`,
                          border: `1px solid ${color}40`, color,
                        }}>{c.level}</span>
                      </td>
                      <td style={{ ...td, fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', minWidth: 100 }}>
                        {c.root !== c.name ? c.root : '—'}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '0.74rem' }}>
                        {c.bizType === '법인' ? (
                          <span style={{ color: '#60a5fa' }}>법인</span>
                        ) : c.bizType === '개인' || c.bizType === '개인사업자' ? (
                          <span style={{ color: '#34d399' }}>개인</span>
                        ) : c.bizType || '—'}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '0.74rem' }}>
                        {c.start && c.end ? (
                          <span style={{ color: isExpired ? '#f87171' : 'var(--text-muted)' }}>
                            {c.start}<br /><span style={{ color: 'rgba(255,255,255,0.2)' }}>~</span> {c.end}
                            {isExpired && <span style={{ color: '#f87171', fontSize: '0.65rem', marginLeft: '0.3rem' }}>만료</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                        {c.bizNo || '—'}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.rep || '—'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.65)' }}>{c.manager || '—'}</td>
                      <td style={{ ...td, fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 180,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={c.address}>{c.address || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!searched && !loading && !metaLoading && (
        <div style={{ ...card, textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🏢</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            검색어를 입력하거나 차수 카드를 클릭해 거래처를 조회하세요.
          </p>
        </div>
      )}
    </div>
  );
}

function hexToRgb(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '255,255,255';
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

function pageRange(current: number, total: number): (number | '…')[] {
  const delta = 2;
  const left  = current - delta;
  const right = current + delta;
  const pages: (number | '…')[] = [];
  let prev = 0;
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= left && p <= right)) {
      if (prev && p - prev > 1) pages.push('…');
      pages.push(p);
      prev = p;
    }
  }
  return pages;
}

function PgBtn({ label, active, disabled, onClick }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ minWidth: 32, height: 32, borderRadius: 7,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: active ? 700 : 400,
        background: active ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? '#34d399' : disabled ? 'rgba(107,122,153,0.4)' : 'var(--text-muted)' }}>
      {label}
    </button>
  );
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  padding: '1.2rem 1.4rem',
};
const inputSel: React.CSSProperties = {
  padding: '0.5rem 0.8rem', borderRadius: 9, fontSize: '0.85rem',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer',
};
const th: React.CSSProperties = {
  padding: '0.45rem 0.65rem', textAlign: 'left', fontWeight: 600,
  color: 'var(--text-muted)', fontSize: '0.72rem', whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};
const td: React.CSSProperties = {
  padding: '0.45rem 0.65rem',
  color: 'rgba(240,244,255,0.85)',
  verticalAlign: 'middle',
};
