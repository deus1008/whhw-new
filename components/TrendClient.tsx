'use client';

import { useState, useEffect, useCallback } from 'react';

type AggItem  = { label: string; amount: number };
type MetaData = { reps: string[]; csos: string[]; products: string[]; types: string[]; tiers: string[]; months: string[] };

const TABS = [
  { key: 'rep',      label: '👤 담당자별' },
  { key: 'cso',      label: '🏢 담당CSO별' },
  { key: 'hospital', label: '🏥 처방처별' },
  { key: 'product',  label: '💊 품목별' },
  { key: 'type',     label: '🏷 종별' },
] as const;

type TabKey = typeof TABS[number]['key'];

const TIER_ORDER = ['10% 미만','10%~20%','20%~30%','30%~40%','40%~50%','50% 이상'];

function fmtAmt(n: number): string {
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (n >= 1_000_0000)  return `${(n / 1_000_0000).toFixed(1)}천만`;
  if (n >= 10_000)      return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString();
}
function fmtAmtFull(n: number): string { return n.toLocaleString() + '원'; }
function fmtMonth(m: string): string {
  if (m.length === 6) return `${m.slice(0, 4)}.${m.slice(4, 6)}`;
  return m;
}

/* ── 꺾은선 SVG 차트 ── */
function LineChart({ items }: { items: AggItem[] }) {
  if (items.length === 0) return <NoData />;
  const W = 800, H = 240, PAD = { t: 20, r: 20, b: 50, l: 70 };
  const maxVal = Math.max(...items.map(i => i.amount));
  const xStep  = (W - PAD.l - PAD.r) / Math.max(items.length - 1, 1);
  const yScale = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / (maxVal || 1));
  const pts = items.map((item, i) => ({
    x: PAD.l + i * xStep, y: yScale(item.amount),
    label: fmtMonth(item.label), amount: item.amount,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = `${pathD} L${pts[pts.length-1].x},${H-PAD.b} L${pts[0].x},${H-PAD.b} Z`;
  const yTickVals = Array.from({ length: 5 }, (_, i) => maxVal * (i / 4));
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 500 }}>
        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={yScale(v)} x2={W-PAD.r} y2={yScale(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.l-6} y={yScale(v)+4} textAnchor="end" fill="rgba(148,163,184,0.8)" fontSize={10}>{fmtAmt(v)}</text>
          </g>
        ))}
        <path d={areaD} fill="rgba(52,211,153,0.07)" />
        <path d={pathD} fill="none" stroke="#34d399" strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="#34d399" stroke="#111827" strokeWidth={2} />
            <text x={p.x} y={H-PAD.b+16} textAnchor="middle" fill="rgba(148,163,184,0.9)" fontSize={10}
              transform={pts.length > 8 ? `rotate(-30,${p.x},${H-PAD.b+16})` : undefined}>
              {p.label}
            </text>
            <title>{p.label}: {fmtAmtFull(p.amount)}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── 막대 차트 (가로) ── */
function BarChart({ items, maxItems = 20 }: { items: AggItem[]; maxItems?: number }) {
  const shown = items.slice(0, maxItems);
  if (shown.length === 0) return <NoData />;
  const maxVal = shown[0].amount || 1;
  const colors = ['#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#67e8f9','#fb7185','#86efac','#fde68a','#c4b5fd'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {shown.map((item, i) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 160, fontSize: '0.75rem', color: 'rgba(240,244,255,0.85)', textAlign: 'right',
            flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.label}>
            {item.label}
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 18, overflow: 'hidden' }}>
            <div style={{ width: `${(item.amount / maxVal) * 100}%`, height: '100%', background: colors[i % colors.length], borderRadius: 4, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ width: 90, fontSize: '0.73rem', color: 'rgba(148,163,184,0.9)', textAlign: 'right', flexShrink: 0 }}>
            {fmtAmt(item.amount)}
          </div>
        </div>
      ))}
      {items.length > maxItems && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right', margin: 0 }}>외 {items.length - maxItems}건 더 있음</p>
      )}
    </div>
  );
}

/* ── 상세 테이블 ── */
function DataTable({ items, labelHeader = '항목' }: { items: AggItem[]; labelHeader?: string }) {
  if (items.length === 0) return <NoData />;
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
            <th style={th}>순위</th><th style={th}>{labelHeader}</th>
            <th style={{ ...th, textAlign: 'right' }}>처방금액</th>
            <th style={{ ...th, textAlign: 'right' }}>비중</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.label} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
              <td style={{ ...td, color: 'var(--text-muted)', width: 40 }}>{i + 1}</td>
              <td style={{ ...td, fontWeight: i < 3 ? 600 : 400 }}>{item.label}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.amount.toLocaleString()}</td>
              <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>
                {total > 0 ? `${((item.amount / total) * 100).toFixed(1)}%` : '-'}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(99,102,241,0.05)' }}>
            <td style={{ ...td, fontWeight: 700 }} colSpan={2}>합계</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{total.toLocaleString()}</td>
            <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── 담당자 × 월 피벗 테이블 ── */
type PivotData = {
  months: string[];
  rows: { label: string; monthly: Record<string, number>; total: number }[];
};

function fmtM(m: string) {
  return m.length === 6 ? `${m.slice(0,4)}.${m.slice(4,6)}` : m;
}

/* 백만원 단위 포맷 */
function fmtM2(v: number): string {
  if (v === 0) return '-';
  return Math.round(v / 1_000_000).toLocaleString('ko-KR');
}

function PivotTable({ pivot, rowHeader = "항목" }: { pivot: PivotData; rowHeader?: string }) {
  if (pivot.rows.length === 0) return <NoData />;
  const { months, rows } = pivot;

  // 월별 열 합계
  const colTotals = months.map(m =>
    rows.reduce((s, r) => s + (r.monthly[m] ?? 0), 0)
  );

  return (
    <div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', margin: '0 0 0.3rem' }}>
        단위: 백만원
      </p>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0 }}>
              <th style={{ ...th, minWidth: 120, position: 'sticky', left: 0, background: 'rgba(17,24,39,0.95)' }}>
                {rowHeader}
              </th>
              {months.map(m => (
                <th key={m} style={{ ...th, textAlign: 'right', minWidth: 72 }}>{fmtM(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 열 합계 행 — 헤더 바로 아래 */}
            <tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '2px solid rgba(255,255,255,0.1)', background: 'rgba(99,102,241,0.05)' }}>
              <td style={{ ...td, fontWeight: 700, position: 'sticky', left: 0, background: 'rgba(99,102,241,0.05)' }}>
                합계
              </td>
              {colTotals.map((v, i) => (
                <td key={i} style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#a5b4fc', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtM2(v)}
                </td>
              ))}
            </tr>
            {rows.map((row, i) => {
              const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)';
              return (
                <tr key={row.label} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: rowBg }}>
                  <td style={{
                    ...td, fontWeight: 600, position: 'sticky', left: 0,
                    background: i % 2 === 0 ? 'rgba(17,24,39,0.95)' : 'rgba(20,26,44,0.95)',
                    minWidth: 120,
                  }}>
                    {row.label}
                  </td>
                  {months.map(m => {
                    const v = row.monthly[m] ?? 0;
                    return (
                      <td key={m} style={{
                        ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        color: v > 0 ? 'rgba(240,244,255,0.85)' : 'rgba(148,163,184,0.3)',
                      }}>
                        {fmtM2(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NoData() {
  return (
    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
      데이터가 없습니다. 문서관리 &gt; EDI 폴더에 파일을 업로드하고 재처리하세요.
    </p>
  );
}

/* ════════════════════════════════════════════
   메인 컴포넌트
════════════════════════════════════════════ */
export default function TrendClient() {
  const [activeTab,     setActiveTab]     = useState<TabKey>('rep');
  const [items,         setItems]         = useState<AggItem[]>([]);
  const [monthlyItems,  setMonthlyItems]  = useState<AggItem[]>([]);
  const [pivot,         setPivot]         = useState<PivotData | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [meta,      setMeta]      = useState<MetaData | null>(null);

  // 필터
  const [monthFrom,   setMonthFrom]   = useState('');
  const [monthTo,     setMonthTo]     = useState('');
  const [filterRep,   setFilterRep]   = useState('');
  const [filterCso,   setFilterCso]   = useState('');
  const [filterProd,  setFilterProd]  = useState('');
  const [filterType,  setFilterType]  = useState('');
  const [filterTier,  setFilterTier]  = useState('');

  // 뷰 모드
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  /* ── 메타 데이터 로드 ── */
  useEffect(() => {
    fetch('/api/trend', { method: 'POST' })
      .then(r => r.json())
      .then(setMeta)
      .catch(console.error);
  }, []);

  /* ── 데이터 로드 ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ groupBy: activeTab });
      if (monthFrom) params.set('from', monthFrom.replace('-', ''));
      if (monthTo)   params.set('to',   monthTo.replace('-', ''));
      if (filterRep)  params.set('rep',     filterRep);
      if (filterCso)  params.set('cso',     filterCso);
      if (filterProd) params.set('product', filterProd);
      if (filterType) params.set('type',    filterType);
      if (filterTier) params.set('tier',    filterTier);

      const res  = await fetch(`/api/trend?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setMonthlyItems(data.monthlyItems ?? []);
      setPivot(data.pivot ?? null);
    } catch (e) {
      console.error('[Trend] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, monthFrom, monthTo, filterRep, filterCso, filterProd, filterType, filterTier]);

  useEffect(() => { load(); }, [load]);

  const labelMap: Record<TabKey, string> = {
    rep: '담당자', cso: '담당CSO',
    hospital: '처방처', product: '품목명', type: '종별구분',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* ── 헤더 ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              📈 처방실적 트렌드 분석
            </h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              문서관리 &gt; EDI 폴더에 업로드·재처리한 월별 파일 데이터를 집계합니다.
            </p>
          </div>
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <input type="month" value={monthFrom} onChange={e => setMonthFrom(e.target.value)} style={sel} title="시작월" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>~</span>
          <input type="month" value={monthTo} onChange={e => setMonthTo(e.target.value)} style={sel} title="종료월" />

          <select value={filterRep} onChange={e => setFilterRep(e.target.value)} style={sel}>
            <option value="">전체 담당자</option>
            {(meta?.reps ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filterCso} onChange={e => setFilterCso(e.target.value)} style={sel}>
            <option value="">전체 CSO</option>
            {(meta?.csos ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filterProd} onChange={e => setFilterProd(e.target.value)} style={sel}>
            <option value="">전체 품목</option>
            {(meta?.products ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={sel}>
            <option value="">전체 종별</option>
            {(meta?.types ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={sel}>
            <option value="">전체 구간</option>
            {TIER_ORDER.map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {(monthFrom || monthTo || filterRep || filterCso || filterProd || filterType || filterTier) && (
            <button onClick={() => {
              setMonthFrom(''); setMonthTo('');
              setFilterRep(''); setFilterCso(''); setFilterProd(''); setFilterType(''); setFilterTier('');
            }} style={{ padding: '0.38rem 0.75rem', borderRadius: 7, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '0.78rem', fontFamily: 'inherit' }}>
              필터 초기화
            </button>
          )}
        </div>
      </div>


      {/* ── 탭 ── */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              padding: '0.4rem 0.9rem', borderRadius: 9, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
              background: activeTab === t.key ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${activeTab === t.key ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.09)'}`,
              color: activeTab === t.key ? '#34d399' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 콘텐츠 ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {TABS.find(t => t.key === activeTab)?.label}
          </h3>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {!pivot && (['chart', 'table'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}

                style={{
                  padding: '0.25rem 0.7rem', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600,
                  background: viewMode === m ? 'rgba(99,102,241,0.22)' : 'transparent',
                  border: `1px solid ${viewMode === m ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: viewMode === m ? '#a5b4fc' : 'var(--text-muted)',
                }}>
                {m === 'chart' ? '📊 차트' : '📋 테이블'}
              </button>
            ))}
            {pivot && (
              <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                차원 × 월 피벗
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>⏳ 분석 중…</p>
        ) : pivot ? (
          /* 모든 차원 탭: 차원(행) × 월(열) 피벗 테이블 */
          <PivotTable pivot={pivot} rowHeader={labelMap[activeTab]} />
        ) : viewMode === 'chart' ? (
          <BarChart items={items} maxItems={activeTab === 'hospital' ? 30 : 20} />
        ) : (
          <DataTable items={items} labelHeader={labelMap[activeTab]} />
        )}
      </div>
    </div>
  );
}

/* ── 스타일 ── */
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  padding: '1.2rem 1.4rem',
};

const sel: React.CSSProperties = {
  padding: '0.38rem 0.65rem', borderRadius: 8, fontSize: '0.8rem',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer',
};

const th: React.CSSProperties = {
  padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600,
  color: 'var(--text-muted)', fontSize: '0.75rem',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const td: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  color: 'rgba(240,244,255,0.85)',
  fontSize: '0.8rem',
};
