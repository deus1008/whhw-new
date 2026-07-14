'use client';

import { useState, useMemo, useTransition, useRef, Fragment } from 'react';
import { searchDrugPrices, type DrugRow } from '@/app/drug-search/actions';
import type { DrugInfoResponse } from '@/app/api/drug-info/route';

const NEDRUG_SEARCH = (q: string) =>
  `https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?searchYearly=&opYes=&division=all&text1=${encodeURIComponent(q)}&page=1`;

type SortKey = 'productName' | 'ingredientName' | 'manufacturer' | 'form' | 'payType' | 'maxPrice' | 'isBioequiv';
type DetailState = { loading: boolean; data?: DrugInfoResponse; error?: string };

export default function DrugSearchClient({ apiConfigured }: { apiConfigured: boolean }) {
  const [query, setQuery]       = useState('');
  const [rows, setRows]         = useState<DrugRow[]>([]);
  const [searched, setSearched] = useState('');
  const [error, setError]       = useState('');
  const [isPending, startTransition] = useTransition();

  // 필터
  const [form, setForm]         = useState('');            // 제형
  const [ingrKey, setIngrKey]   = useState('');            // 단일제 함량/복합제 유형 선택(성분키)
  const [listQuery, setListQuery] = useState('');          // 결과 내 키워드 검색
  const [sortKey, setSortKey]   = useState<SortKey>('productName');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');

  // 행 상세(MFDS)
  const [openRow, setOpenRow]   = useState<string | null>(null);
  const [detail, setDetail]     = useState<Record<string, DetailState>>({});
  const loadingRef = useRef(new Set<string>());

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
        setForm(''); setIngrKey(''); setListQuery(''); setOpenRow(null);
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
    if (ingrKey) list = list.filter(r => r.ingredientName === ingrKey);
    const lq = listQuery.trim().toLowerCase();
    if (lq) {
      const tokens = lq.split(/[\s,+]+/).filter(Boolean);
      list = list.filter(r => {
        const hay = `${r.productName} ${r.ingredientName} ${r.manufacturer}`.toLowerCase();
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
  }, [afterForm, ingrKey, listQuery, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'maxPrice' || k === 'isBioequiv' ? 'desc' : 'asc'); }
  }

  async function loadDetail(r: DrugRow) {
    const k = r.itemCode + r.productName;
    if (loadingRef.current.has(k) || detail[k]?.data) return;
    loadingRef.current.add(k);
    setDetail(p => ({ ...p, [k]: { loading: true } }));
    try {
      const params = new URLSearchParams({ item: r.productName });
      if (r.ingredientName) params.set('ingr', r.ingredientName);
      const res = await fetch(`/api/drug-info?${params}`);
      const data = await res.json() as DrugInfoResponse & { error?: string };
      setDetail(p => ({ ...p, [k]: data.error ? { loading: false, error: data.error } : { loading: false, data } }));
    } catch {
      setDetail(p => ({ ...p, [k]: { loading: false, error: '조회 실패' } }));
    }
    loadingRef.current.delete(k);
  }
  function onRowClick(r: DrugRow) {
    const k = r.itemCode + r.productName;
    setOpenRow(o => o === k ? null : k);
    loadDetail(r);
  }

  return (
    <div style={{ width: '100%', maxWidth: 1200 }}>
      {/* 검색 */}
      <form onSubmit={runSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="성분명 또는 제품명으로 검색 (예: clopidogrel, 크레트롤)"
          style={{ flex: 1, minWidth: 240, padding: '0.55rem 0.85rem', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' }} />
        <button type="submit" disabled={isPending}
          style={{ padding: '0.55rem 1.4rem', borderRadius: 9, background: 'rgba(59,130,246,0.9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
          {isPending ? '검색 중…' : '검색'}
        </button>
      </form>
      {!apiConfigured && (
        <p style={{ fontSize: '0.75rem', color: '#fca5a5', marginBottom: '0.8rem' }}>
          ⚠ DRUG_API_KEY 미설정 — 행 클릭 시 MFDS 상세(생동·DMF)는 조회되지 않습니다.
        </p>
      )}
      {error && <p style={{ color: '#fca5a5', fontSize: '0.85rem' }}>{error}</p>}

      {searched && rows.length === 0 && !isPending && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>&ldquo;{searched}&rdquo; 약가표 검색 결과가 없습니다.</p>
      )}

      {rows.length > 0 && (
        <>
          {/* 제형 선택 */}
          <Panel title="제형 선택">
            <Chips>
              <Chip active={form === ''} onClick={() => { setForm(''); setIngrKey(''); }}>전체</Chip>
              {formCounts.map(([f, c]) => (
                <Chip key={f} active={form === f} onClick={() => { setForm(form === f ? '' : f); setIngrKey(''); }}>{f} <Count>{c}건</Count></Chip>
              ))}
            </Chips>
          </Panel>

          {/* 단일제 함량 / 복합제 유형 */}
          {singleGroups.length > 0 && (
            <Panel title={`단일제 함량 선택 (${singleGroups.length}종)`}>
              <Chips>
                {singleGroups.map(([g, c]) => (
                  <Chip key={g} active={ingrKey === g} onClick={() => setIngrKey(ingrKey === g ? '' : g)}>{g} <Count>{c}건</Count></Chip>
                ))}
              </Chips>
            </Panel>
          )}
          {comboGroups.length > 0 && (
            <Panel title={`복합제 유형 선택 (${comboGroups.length}종)`}>
              <Chips>
                {comboGroups.map(([g, c]) => (
                  <Chip key={g} active={ingrKey === g} onClick={() => setIngrKey(ingrKey === g ? '' : g)}>{g} <Count>{c}건</Count></Chip>
                ))}
              </Chips>
            </Panel>
          )}

          {/* 결과 내 키워드 검색 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', margin: '0.9rem 0 0.4rem', flexWrap: 'wrap' }}>
            <input value={listQuery} onChange={e => setListQuery(e.target.value)}
              placeholder="🔍 결과 내 검색 (제품명·성분·회사, 공백/쉼표/+로 여러 개)"
              style={{ flex: 1, minWidth: 220, padding: '0.42rem 0.7rem', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{view.length.toLocaleString()}건 · 행 클릭 시 상세</span>
          </div>

          {/* 테이블 */}
          <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <SortTh label="생동" k="isBioequiv" cur={sortKey} dir={sortDir} onClick={toggleSort} w={64} center />
                  <SortTh label="판매회사" k="manufacturer" cur={sortKey} dir={sortDir} onClick={toggleSort} w={150} />
                  <SortTh label="제품명" k="productName" cur={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="성분명" k="ingredientName" cur={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortTh label="제형" k="form" cur={sortKey} dir={sortDir} onClick={toggleSort} w={72} center />
                  <SortTh label="구분" k="payType" cur={sortKey} dir={sortDir} onClick={toggleSort} w={64} center />
                  <SortTh label="약가" k="maxPrice" cur={sortKey} dir={sortDir} onClick={toggleSort} w={80} right />
                </tr>
              </thead>
              <tbody>
                {view.map(r => {
                  const k = r.itemCode + r.productName;
                  const isOpen = openRow === k;
                  return (
                    <Fragment key={k}>
                      <tr onClick={() => onRowClick(r)} style={{ cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.05)', background: isOpen ? 'rgba(59,130,246,0.08)' : undefined }}>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          {r.isBioequiv
                            ? <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#6ee7b7', background: 'rgba(52,211,153,0.14)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>생동</span>
                            : <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>}
                        </td>
                        <td style={TD}>{r.manufacturer || '—'}</td>
                        <td style={{ ...TD, fontWeight: 600, color: 'var(--text-primary)' }}>{r.productName}</td>
                        <td style={{ ...TD, fontSize: '0.76rem', color: 'rgba(255,255,255,0.6)' }}>{r.ingredientName || '—'}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>{r.form}</td>
                        <td style={{ ...TD, textAlign: 'center', fontSize: '0.76rem', color: 'rgba(255,255,255,0.6)' }}>{r.payType || '—'}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{r.maxPrice != null ? r.maxPrice.toLocaleString() : '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0.6rem 1rem 0.9rem', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <DetailPanel state={detail[k]} productName={r.productName} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

/* ── 상세 패널 (MFDS: 생동·DMF·약가) ── */
function DetailPanel({ state, productName }: { state?: DetailState; productName: string }) {
  if (!state || state.loading) return <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>⏳ MFDS 상세(생동·DMF) 조회 중…</p>;
  if (state.error) return <p style={{ fontSize: '0.78rem', color: '#fca5a5' }}>상세 조회 실패: {state.error}</p>;
  const d = state.data;
  const dmf = d?.dmf ?? [];
  const bioEq = d?.bioEq ?? [];
  return (
    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
        <span>생동 등록: <b style={{ color: bioEq.length ? '#6ee7b7' : 'rgba(255,255,255,0.6)' }}>{bioEq.length ? `${bioEq.length}건` : '없음'}</b></span>
        <span>원료 DMF: <b style={{ color: dmf.length ? '#93c5fd' : 'rgba(255,255,255,0.6)' }}>{dmf.length ? `${dmf.length}건 등록` : '없음'}</b></span>
      </div>
      {dmf.length > 0 && (
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>
          {dmf.slice(0, 4).map((x, i) => <div key={i}>· {x.ingrName} — {x.entpName ?? x.country ?? ''} ({x.dmfNo ?? '-'})</div>)}
        </div>
      )}
      <a href={NEDRUG_SEARCH(productName)} target="_blank" rel="noreferrer" style={{ color: '#93c5fd', fontSize: '0.75rem' }}>🌐 의약품안전나라에서 상세 보기 →</a>
    </div>
  );
}

/* ── UI 헬퍼 ── */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '0.7rem 0.9rem', marginBottom: '0.6rem' }}>
      <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem' }}>{title}</p>
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
      background: active ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.12)'}`,
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
      padding: '0.5rem 0.7rem', fontSize: '0.74rem', fontWeight: 700, color: active ? '#93c5fd' : 'rgba(255,255,255,0.55)',
      borderBottom: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
      textAlign: right ? 'right' : center ? 'center' : 'left', width: w, background: 'rgba(255,255,255,0.03)',
    }}>
      {label}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
    </th>
  );
}
const TD: React.CSSProperties = {
  padding: '0.45rem 0.7rem', color: 'rgba(255,255,255,0.85)', verticalAlign: 'middle',
};
