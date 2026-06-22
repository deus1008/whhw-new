'use client';

import { useState, useTransition, useMemo, useRef, useEffect } from 'react';
import type { UnmappedRow, AliasRow, CustomerOption } from '@/app/admin/customer-aliases/actions';
import { createAlias, deleteAlias } from '@/app/admin/customer-aliases/actions';

/* ── 스타일 상수 ── */
const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '1.25rem 1.5rem',
  marginBottom: '1.25rem',
};
const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '7px',
  padding: '0.45rem 0.7rem',
  color: '#fff',
  fontSize: '0.82rem',
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box' as const,
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.42rem 0.9rem',
  borderRadius: '7px',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  background: 'rgba(99,102,241,0.2)',
  border: '1px solid rgba(99,102,241,0.45)',
  color: '#a5b4fc',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap' as const,
};
const BTN_DANGER: React.CSSProperties = {
  padding: '0.3rem 0.65rem',
  borderRadius: '6px',
  fontSize: '0.72rem',
  fontWeight: 600,
  cursor: 'pointer',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.25)',
  color: '#fca5a5',
  fontFamily: 'inherit',
};
const LABEL: React.CSSProperties = {
  fontSize: '0.68rem',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: '0.25rem',
  display: 'block',
};

/* ── 거래처 검색 드롭다운 ── */
function CustomerSearchInput({
  customers,
  value,
  onSelect,
  disabled,
}: {
  customers: CustomerOption[];
  value: { id: string; name: string } | null;
  onSelect: (c: CustomerOption | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) { setQuery(''); return; }
    setQuery(value.name);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = useMemo(() =>
    query.trim().length === 0
      ? customers.slice(0, 30)
      : customers.filter(c => c.customer_name.toLowerCase().includes(query.toLowerCase())).slice(0, 30),
  [query, customers]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        style={INPUT}
        value={query}
        placeholder="거래처명 검색…"
        disabled={disabled}
        onChange={e => { setQuery(e.target.value); setOpen(true); onSelect(null); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '8px', marginTop: '2px',
          maxHeight: '200px', overflowY: 'auto',
        }}>
          {filtered.map(c => (
            <div
              key={c.id}
              onMouseDown={() => { onSelect(c); setQuery(c.customer_name); setOpen(false); }}
              style={{
                padding: '0.45rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem',
                color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{c.customer_name}</span>
              <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                {[c.customer_type, c.region].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 미매핑 행 ── */
function UnmappedRowItem({
  row,
  customers,
  onMapped,
}: {
  row: UnmappedRow;
  customers: CustomerOption[];
  onMapped: () => void;
}) {
  const [selected, setSelected] = useState<CustomerOption | null>(null);
  const [note,     setNote]     = useState('');
  const [msg,      setMsg]      = useState('');
  const [, start]               = useTransition();

  function handleSave() {
    if (!selected) { setMsg('거래처를 선택하세요.'); return; }
    start(async () => {
      const res = await createAlias(row.name, selected.id, note);
      if (res.error) { setMsg(res.error); return; }
      setMsg('');
      onMapped();
    });
  }

  return (
    <div style={{
      padding: '0.9rem 1rem',
      background: 'rgba(251,191,36,0.04)',
      border: '1px solid rgba(251,191,36,0.14)',
      borderRadius: '9px',
      marginBottom: '0.6rem',
    }}>
      {/* 별칭명 + 방문 횟수 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fde68a' }}>{row.name}</span>
        <a
          href={`/visits?q=${encodeURIComponent(row.name)}`}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: '0.65rem', fontWeight: 700, padding: '1px 7px', borderRadius: '100px',
            background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24',
            textDecoration: 'none', cursor: 'pointer',
          }}
        >방문 {row.visit_count}건 →</a>
        <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: 'auto' }}>최근: {row.last_visit}</span>
      </div>

      {/* 매핑 입력 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.6fr auto', gap: '0.5rem', alignItems: 'end' }}>
        <div>
          <span style={LABEL}>정규 거래처 선택 *</span>
          <CustomerSearchInput customers={customers} value={selected ? { id: selected.id, name: selected.customer_name } : null} onSelect={setSelected} />
        </div>
        <div>
          <span style={LABEL}>메모 (선택)</span>
          <input style={INPUT} value={note} onChange={e => setNote(e.target.value)} placeholder="매핑 이유 등" />
        </div>
        <button onClick={handleSave} style={BTN_PRIMARY}>매핑 저장</button>
      </div>
      {msg && <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: '#fca5a5' }}>{msg}</p>}
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
export default function CustomerAliasesClient({
  initialUnmapped,
  initialAliases,
  customers,
}: {
  initialUnmapped: UnmappedRow[];
  initialAliases:  AliasRow[];
  customers:       CustomerOption[];
}) {
  const [unmapped,    setUnmapped]    = useState(initialUnmapped);
  const [aliases,     setAliases]     = useState(initialAliases);
  const [aliasSearch, setAliasSearch] = useState('');
  const [, start]                     = useTransition();

  function handleMapped(name: string) {
    setUnmapped(u => u.filter(r => r.name !== name));
    // 새 매핑은 낙관적 업데이트 없이 새로고침으로 반영
    window.location.reload();
  }

  function handleDelete(id: number) {
    if (!confirm('이 매핑을 삭제하시겠습니까?')) return;
    start(async () => {
      const res = await deleteAlias(id);
      if (res.error) { alert(res.error); return; }
      setAliases(a => a.filter(r => r.id !== id));
    });
  }

  const filteredAliases = useMemo(() =>
    aliasSearch.trim()
      ? aliases.filter(a =>
          a.alias.toLowerCase().includes(aliasSearch.toLowerCase()) ||
          a.canonical_name.toLowerCase().includes(aliasSearch.toLowerCase()),
        )
      : aliases,
  [aliases, aliasSearch]);

  return (
    <div style={{ width: '100%', maxWidth: '800px', padding: '2rem 1rem' }}>

      {/* 헤더 */}
      <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.3rem' }}>
        거래처 별칭 매핑 관리
      </h1>
      <p style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        영업활동에 입력된 거래처명을 거래처현황의 정규명과 연결합니다.<br />
        매핑이 완료된 거래처는 AI 분석 리포트에서 정규명으로 통합 집계됩니다.
      </p>

      {/* 통계 카드 */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        {[
          { label: '미매핑 거래처', value: unmapped.length, color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' },
          { label: '매핑 완료',     value: aliases.length,  color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)' },
          { label: '정규 거래처',   value: customers.length, color: '#a5b4fc', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.2)' },
        ].map(s => (
          <div key={s.label} style={{
            flex: '1 1 140px', padding: '0.85rem 1.1rem',
            background: s.bg, border: `1px solid ${s.border}`, borderRadius: '10px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '3px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── 미매핑 목록 ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fbbf24', margin: 0 }}>
            ⚠ 미매핑 거래처
          </h2>
          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
            영업활동에 입력됐으나 거래처현황과 불일치하는 이름
          </span>
        </div>

        {unmapped.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: '#4ade80' }}>✅ 모든 거래처가 매핑되었습니다.</p>
        ) : (
          unmapped.map(row => (
            <UnmappedRowItem
              key={row.name}
              row={row}
              customers={customers}
              onMapped={() => handleMapped(row.name)}
            />
          ))
        )}
      </div>

      {/* ── 매핑 현황 ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#a5b4fc', margin: 0 }}>
            매핑 현황 ({aliases.length}건)
          </h2>
          <input
            style={{ ...INPUT, width: '200px' }}
            placeholder="별칭 / 정규명 검색"
            value={aliasSearch}
            onChange={e => setAliasSearch(e.target.value)}
          />
        </div>

        {filteredAliases.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: '#64748b' }}>매핑 데이터가 없습니다.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  {['입력명 (별칭)', '→ 정규 거래처명', '종별', '지역', '메모', '등록일', ''].map(h => (
                    <th key={h} style={{
                      padding: '0.5rem 0.7rem', textAlign: 'left',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      fontSize: '0.68rem', color: '#475569', fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAliases.map((a, i) => (
                  <tr key={a.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#fde68a', fontWeight: 600 }}>{a.alias}</td>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#e2e8f0' }}>{a.canonical_name}</td>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#94a3b8' }}>{a.customer_type ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#94a3b8' }}>{a.region ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#64748b', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.note ?? '—'}</td>
                    <td style={{ padding: '0.5rem 0.7rem', color: '#475569', whiteSpace: 'nowrap' }}>{a.created_at.slice(0, 10)}</td>
                    <td style={{ padding: '0.5rem 0.7rem' }}>
                      <button onClick={() => handleDelete(a.id)} style={BTN_DANGER}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
