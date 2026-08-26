'use client';

import { useState, useMemo, useTransition } from 'react';
import { searchDrugPrices, type DrugRow } from '@/app/drug-search/actions';

type SortKey = 'productName' | 'ingredientName' | 'manufacturer' | 'form' | 'payType' | 'maxPrice' | 'isBioequiv';

export default function DrugSearchClient(_props: { apiConfigured: boolean }) {
  const [query, setQuery]       = useState('');
  const [rows, setRows]         = useState<DrugRow[]>([]);
  const [searched, setSearched] = useState('');
  const [error, setError]       = useState('');
  const [isPending, startTransition] = useTransition();

  // 필터
  const [form, setForm]         = useState('');            // 제형
  const [ingrKeys, setIngrKeys] = useState<Set<string>>(new Set()); // 단일제 함량/복합제 유형 선택(복수)
  const [listQuery, setListQuery] = useState('');          // 결과 내 키워드 검색
  const [sortKey, setSortKey]   = useState<SortKey>('productName');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');

  function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setError('');
    startTransition(async () => {
      try {
        const { rows } = await searchDrugPrices(q);
        setRows(rows);
        setSearched(q);
        setForm(''); setIngrKeys(new Set()); setListQuery('');
      } catch {
        setError('검색 중 오류가 발생했습니다.');
      }
    });
  }

  /* ── 제형 카운트 (전체 rows 기준) ── */
  const formCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.form] = (m[r.form] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  /* ── 제형 적용 후 rows ── */
  const afterForm = useMemo(() => form ? rows.filter(r => r.form === form) : rows, [rows, form]);

  /* ── 단일제 함량 / 복합제 유형 그룹 ── */
  const singleGroups = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of afterForm) if (!r.isCombo && r.ingredientName) m[r.ingredientName] = (m[r.ingredientName] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [afterForm]);
  const comboGroups = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of afterForm) if (r.isCombo && r.ingredientName) m[r.ingredientName] = (m[r.ingredientName] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [afterForm]);

  /* ── 최종 필터 + 정렬 ── */
  const view = useMemo(() => {
    let list = afterForm;
    if (ingrKeys.size) list = list.filter(r => ingrKeys.has(r.ingredientName));
    const lq = listQuery.trim().toLowerCase();
    if (lq) {
      const tokens = lq.split(/[\s,+]+/).filter(Boolean);
      list = list.filter(r => {
        const hay = `${r.productName} ${r.ingredientName} ${r.manufacturer} ${r.maker}`.toLowerCase();
        return tokens.some(t => hay.includes(t));
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let va: string | number = a[sortKey] as never, vb: string | number = b[sortKey] as never;
      if (sortKey === 'maxPrice') { va = a.maxPrice ?? -1; vb = b.maxPrice ?? -1; }
      else if (sortKey === 'isBioequiv') { va = a.isBioequiv ? 1 : 0; vb = b.isBioequiv ? 1 : 0; }
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'ko') * dir;
    });
  }, [afterForm, ingrKeys, listQuery, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'maxPrice' || k === 'isBioequiv' ? 'desc' : 'asc'); }
  }
  function toggleIngr(g: string) {
    setIngrKeys(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  }

  return (
    <div style={{ width: '100%', maxWidth: 1200 }}>
      {/* 검색 */}
      <form onSubmit={runSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="성분명 또는 제품명으로 검색 (예: clopidogrel, 크레트롤)"
          style={{ flex: 1, minWidth: 240, padding: '0.55rem 0.85rem', borderRadius: 9, background: '#ffffff', border: '1px solid #d7dce5', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }} />
        <button type="submit" disabled={isPending}
          style={{ padding: '0.55rem 1.4rem', borderRadius: 9, background: '#2563eb', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
          {isPending ? '검색 중…' : '검색'}
        </button>
      </form>
      {error && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</p>}

      {searched && rows.length === 0 && !isPending && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>&ldquo;{searched}&rdquo; 약가표 검색 결과가 없습니다.</p>
      )}

      {rows.length > 0 && (
        <>
          {/* 제형 선택 */}
          <Panel title="제형 선택">
            <Chips>
              <Chip active={form === ''} onClick={() => { setForm(''); setIngrKeys(new Set()); }}>전체</Chip>
              {formCounts.map(([f, c]) => (
                <Chip key={f} active={form === f} onClick={() => { setForm(form === f ? '' : f); setIngrKeys(new Set()); }}>{f} <Count>{c}건</Count></Chip>
              ))}
            </Chips>
          </Panel>

          {/* 단일제 함량 / 복합제 유형 (복수선택) */}
          {singleGroups.length > 0 && (
            <Panel title={`단일제 함량 선택 (${singleGroups.length}종)${ingrKeys.size ? ` · ${ingrKeys.size}개 선택` : ''}`} onClear={ingrKeys.size ? () => setIngrKeys(new Set()) : undefined}>
              <Chips>
                {singleGroups.map(([g, c]) => (
                  <Chip key={g} active={ingrKeys.has(g)} onClick={() => toggleIngr(g)}>{g} <Count>{c}건</Count></Chip>
                ))}
              </Chips>
            </Panel>
          )}
          {comboGroups.length > 0 && (
            <Panel title={`복합제 유형 선택 (${comboGroups.length}종)${ingrKeys.size ? ` · ${ingrKeys.size}개 선택` : ''}`} onClear={ingrKeys.size ? () => setIngrKeys(new Set()) : undefined}>
              <Chips>
                {comboGroups.map(([g, c]) => (
                  <Chip key={g} active={ingrKeys.has(g)} onClick={() => toggleIngr(g)}>{g} <Count>{c}건</Count></Chip>
                ))}
              </Chips>
            </Panel>
          )}

          {/* 결과 내 키워드 검색 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', margin: '0.9rem 0 0.4rem', flexWrap: 'wrap' }}>
            <input value={listQuery} onChange={e => setListQuery(e.target.value)}
              placeholder="🔍 결과 내 검색 (제품명·성분·회사, 공백/쉼표/+로 여러 개)"
              style={{ flex: 1, minWidth: 220, padding: '0.42rem 0.7rem', borderRadius: 7, background: '#ffffff', border: '1px solid #d7dce5', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{view.length.toLocaleString()}건 · 행 클릭 시 상세</span>
          </div>

          {/* 테이블 */}
          <div style={{ overflowX: 'auto', border: '1px solid #e5e9f0', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <SortTh label="생동" k="isBioequiv" cur={sortKey} dir={sortDir} onClick={toggleSort} w={64} center />
                  <th style={{ ...TH, width: 64, textAlign: 'center' }}>제조</th>
                  <SortTh label="판매회사" k="manufacturer" cur={sortKey} dir={sortDir} onClick={toggleSort} w={150} />
                  <SortTh label="제품명" k="productName" cur={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="성분명" k="ingredientName" cur={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="제형" k="form" cur={sortKey} dir={sortDir} onClick={toggleSort} w={72} center />
                  <th style={{ ...TH, minWidth: 120 }}>포장단위</th>
                  <SortTh label="구분" k="payType" cur={sortKey} dir={sortDir} onClick={toggleSort} w={64} center />
                  <SortTh label="약가" k="maxPrice" cur={sortKey} dir={sortDir} onClick={toggleSort} w={80} right />
                </tr>
              </thead>
              <tbody>
                {view.map(r => {
                  const k = r.itemCode + r.productName;
                  return (
                    <tr key={k} style={{ borderTop: '1px solid #e5e9f0' }}>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          {r.isBioequiv
                            ? <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#15803d', background: 'rgba(52,211,153,0.14)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>생동</span>
                            : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }} title={r.maker || undefined}>
                          {r.isConsignment == null
                            ? <span style={{ color: '#94a3b8' }}>—</span>
                            : <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4,
                                color: r.isConsignment ? '#b45309' : '#15803d',
                                background: r.isConsignment ? 'rgba(251,191,36,0.14)' : 'rgba(52,211,153,0.14)' }}>
                                {r.isConsignment ? '위탁' : '자사'}</span>}
                        </td>
                        <td style={TD}>{r.manufacturer || '—'}</td>
                        <td style={{ ...TD, fontWeight: 600, color: 'var(--text-primary)' }}>{r.productName}</td>
                        <td style={{ ...TD, fontSize: '0.76rem', color: '#475569' }}>{r.ingredientName || '—'}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>{r.form}</td>
                        <td style={{ ...TD, fontSize: '0.75rem', color: '#475569' }}>{r.packageUnit || '—'}</td>
                        <td style={{ ...TD, textAlign: 'center', fontSize: '0.76rem', color: '#475569' }}>{r.payType || '—'}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{r.maxPrice != null ? r.maxPrice.toLocaleString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ── UI 헬퍼 ── */
function Panel({ title, children, onClear }: { title: string; children: React.ReactNode; onClear?: () => void }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid #e5e9f0', borderRadius: 12, padding: '0.7rem 0.9rem', marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 0.5rem' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</p>
        {onClear && (
          <button onClick={onClear} style={{ fontSize: '0.68rem', color: '#94a3b8', background: 'transparent', border: '1px solid #e5e9f0', borderRadius: 6, padding: '0.12rem 0.5rem', cursor: 'pointer', fontFamily: 'inherit' }}>✕ 선택해제</button>
        )}
      </div>
      {children}
    </div>
  );
}
function Chips({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>{children}</div>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.32rem 0.75rem', borderRadius: 8, fontSize: '0.78rem', fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
      background: active ? '#2563eb' : '#ffffff',
      border: `1px solid ${active ? '#2563eb' : '#e5e9f0'}`,
      color: active ? '#fff' : 'var(--text-primary)', transition: 'all 0.12s',
    }}>{children}</button>
  );
}
function Count({ children }: { children: React.ReactNode }) {
  return <span style={{ marginLeft: 4, fontSize: '0.7rem', opacity: 0.6 }}>{children}</span>;
}
function SortTh({ label, k, cur, dir, onClick, w, center, right }: {
  label: string; k: SortKey; cur: SortKey; dir: 'asc' | 'desc'; onClick: (k: SortKey) => void; w?: number; center?: boolean; right?: boolean;
}) {
  const active = cur === k;
  return (
    <th onClick={() => onClick(k)} style={{
      padding: '0.5rem 0.7rem', fontSize: '0.74rem', fontWeight: 700, color: active ? '#2563eb' : '#475569',
      borderBottom: '1px solid #e5e9f0', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
      textAlign: right ? 'right' : center ? 'center' : 'left', width: w, background: '#f1f4f9',
    }}>
      {label}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
    </th>
  );
}
const TD: React.CSSProperties = {
  padding: '0.45rem 0.7rem', color: '#111827', verticalAlign: 'middle',
};
const TH: React.CSSProperties = {
  padding: '0.5rem 0.7rem', fontSize: '0.74rem', fontWeight: 700, color: '#475569',
  borderBottom: '1px solid #e5e9f0', whiteSpace: 'nowrap',
  background: '#f1f4f9',
};
