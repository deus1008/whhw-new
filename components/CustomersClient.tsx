'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type Customer = {
  id:            string;
  customer_code: string | null;
  customer_name: string;
  customer_type: string | null;
  region:        string | null;
  sub_region:    string | null;
  address:       string | null;
  phone:         string | null;
  manager:       string | null;
  cso:           string | null;
  memo:          string | null;
  source_file:   string;
};

type Meta = { regions: string[]; types: string[]; managers: string[] };

export default function CustomersClient() {
  const [query,    setQuery]    = useState('');
  const [region,   setRegion]   = useState('');
  const [type,     setType]     = useState('');
  const [manager,  setManager]  = useState('');
  const [items,    setItems]    = useState<Customer[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [meta,     setMeta]     = useState<Meta>({ regions: [], types: [], managers: [] });
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── 메타 로드 ── */
  useEffect(() => {
    fetch('/api/customers?meta=1')
      .then(r => r.json()).then(setMeta).catch(console.error);
  }, []);

  /* ── 검색 ── */
  const search = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg) });
      if (query)   params.set('q',       query);
      if (region)  params.set('region',  region);
      if (type)    params.set('type',    type);
      if (manager) params.set('manager', manager);

      const res  = await fetch(`/api/customers?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(pg);
      setSearched(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [query, region, type, manager]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    search(1);
  }

  function reset() {
    setQuery(''); setRegion(''); setType(''); setManager('');
    setItems([]); setTotal(0); setSearched(false);
    inputRef.current?.focus();
  }

  const totalPages = Math.ceil(total / 50);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* ── 헤더 ── */}
      <div style={card}>
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            🏢 거래처현황
          </h2>
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            거래처명·코드·주소로 검색하고 담당 지역장을 확인하세요.
          </p>
        </div>

        {/* 검색 폼 */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {/* 키워드 검색 */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="CSO명 / 사업자번호 / 내부명 / 주소 검색"
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

          {/* 필터 */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={region} onChange={e => setRegion(e.target.value)} style={inputSel}>
              <option value="">전체 지역</option>
              {meta.regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={type} onChange={e => setType(e.target.value)} style={inputSel}>
              <option value="">전체 종별</option>
              {meta.types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={manager} onChange={e => setManager(e.target.value)} style={inputSel}>
              <option value="">전체 담당사원(지역장)</option>
              {meta.managers.map(m => <option key={m} value={m}>{m}</option>)}
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
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <PgBtn label="◀" disabled={page <= 1} onClick={() => search(page - 1)} />
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(pg => (
                  <PgBtn key={pg} label={String(pg)} active={pg === page} onClick={() => search(pg)} />
                ))}
                {totalPages > 7 && <span style={{ color: 'var(--text-muted)', lineHeight: '2rem', padding: '0 4px' }}>…</span>}
                <PgBtn label="▶" disabled={page >= totalPages} onClick={() => search(page + 1)} />
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {['CSO명','사업자번호','내부명','종별/지역','담당사원(지역장)','담당자(CSO)','연락처','주소/이메일','비고'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => (
                  <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    {/* CSO명 */}
                    <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)', minWidth: 130 }}>
                      {c.customer_name}
                    </td>
                    {/* 사업자번호 */}
                    <td style={{ ...td, color: 'var(--text-muted)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                      {c.customer_code ?? '—'}
                    </td>
                    {/* 내부명 (sub_region에 저장) */}
                    <td style={{ ...td, color: 'rgba(240,244,255,0.7)', whiteSpace: 'nowrap' }}>
                      {c.sub_region ?? '—'}
                    </td>
                    {/* 종별/지역 */}
                    <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '0.73rem' }}>
                      {[c.customer_type, c.region].filter(Boolean).join(' / ') || '—'}
                    </td>
                    {/* 담당사원명 → 지역장 ⭐ */}
                    <td style={{ ...td, fontWeight: c.manager ? 700 : 400, color: c.manager ? '#a5b4fc' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {c.manager ?? '—'}
                    </td>
                    {/* 담당자 (CSO 업체 담당자) */}
                    <td style={{ ...td, color: 'rgba(240,244,255,0.75)', whiteSpace: 'nowrap' }}>
                      {c.cso ?? '—'}
                    </td>
                    {/* 전화번호 */}
                    <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {c.phone ?? '—'}
                    </td>
                    {/* 주소 / 이메일(memo) */}
                    <td style={{ ...td, maxWidth: 220, fontSize: '0.72rem' }}>
                      <div style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {c.memo || c.address || '—'}
                      </div>
                    </td>
                    {/* 비고 */}
                    <td style={{ ...td, maxWidth: 100, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {c.address && c.memo ? c.address : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!searched && !loading && (
        <div style={{ ...card, textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🏢</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            검색어를 입력하거나 필터를 선택해 거래처를 찾아보세요.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── 종별 색상 ── */
function typeColor(t: string): { bg: string; bd: string; color: string } {
  const tl = t.toLowerCase();
  if (tl.includes('상급') || tl.includes('종합병원')) return { bg: 'rgba(239,68,68,0.1)', bd: 'rgba(239,68,68,0.3)', color: '#f87171' };
  if (tl.includes('병원'))   return { bg: 'rgba(251,191,36,0.1)', bd: 'rgba(251,191,36,0.3)', color: '#fbbf24' };
  if (tl.includes('의원'))   return { bg: 'rgba(52,211,153,0.1)', bd: 'rgba(52,211,153,0.3)', color: '#34d399' };
  if (tl.includes('약국'))   return { bg: 'rgba(96,165,250,0.1)', bd: 'rgba(96,165,250,0.3)', color: '#60a5fa' };
  return { bg: 'rgba(148,163,184,0.1)', bd: 'rgba(148,163,184,0.2)', color: '#94a3b8' };
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

/* ── 스타일 ── */
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
  padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600,
  color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  color: 'rgba(240,244,255,0.85)',
  verticalAlign: 'middle',
};
