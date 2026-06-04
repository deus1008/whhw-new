'use client';

import { useState, useEffect, useCallback } from 'react';

type AggItem  = { label: string; amount: number };
type MetaData = { reps: string[]; csos: string[]; products: string[]; types: string[]; tiers: string[]; months: string[] };

const TABS = [
  { key: 'month',    label: '📅 월별 추이' },
  { key: 'rep',      label: '👤 담당자별' },
  { key: 'cso',      label: '🏢 담당CSO별' },
  { key: 'hospital', label: '🏥 처방처별' },
  { key: 'product',  label: '💊 품목별' },
  { key: 'type',     label: '🏷 종별' },
  { key: 'tier',     label: '💰 수수료구간별' },
] as const;

type TabKey = typeof TABS[number]['key'];

const TIER_ORDER = ['10% 미만','10%~20%','20%~30%','30%~40%','40%~50%','50% 이상'];

function fmtAmt(n: number): string {
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억`;
  if (n >= 1_000_0000)  return `${(n / 1_000_0000).toFixed(1)}천만`;
  if (n >= 10_000)      return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString();
}

function fmtAmtFull(n: number): string {
  return n.toLocaleString() + '원';
}

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
    x: PAD.l + i * xStep,
    y: yScale(item.amount),
    label: fmtMonth(item.label),
    amount: item.amount,
  }));

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = `${pathD} L${pts[pts.length - 1].x},${H - PAD.b} L${pts[0].x},${H - PAD.b} Z`;

  // Y 눈금
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => maxVal * (i / yTicks));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 500 }}>
        {/* Y축 눈금선 */}
        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={yScale(v)} x2={W - PAD.r} y2={yScale(v)}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.l - 6} y={yScale(v) + 4} textAnchor="end"
              fill="rgba(148,163,184,0.8)" fontSize={10}>{fmtAmt(v)}</text>
          </g>
        ))}
        {/* 면적 */}
        <path d={areaD} fill="rgba(52,211,153,0.07)" />
        {/* 선 */}
        <path d={pathD} fill="none" stroke="#34d399" strokeWidth={2} strokeLinejoin="round" />
        {/* 점 + X 라벨 */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="#34d399" stroke="#111827" strokeWidth={2} />
            <text x={p.x} y={H - PAD.b + 16} textAnchor="middle"
              fill="rgba(148,163,184,0.9)" fontSize={10}
              transform={pts.length > 8 ? `rotate(-30,${p.x},${H - PAD.b + 16})` : undefined}>
              {p.label}
            </text>
            {/* 툴팁 영역 (hover title) */}
            <title>{p.label}: {fmtAmtFull(p.amount)}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── 막대 차트 (가로) ── */
function BarChart({ items, maxItems = 20 }: { items: AggItem[]; maxItems?: number }) {
  const shown  = items.slice(0, maxItems);
  if (shown.length === 0) return <NoData />;
  const maxVal = shown[0].amount || 1;

  const colors = [
    '#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa',
    '#67e8f9','#fb7185','#86efac','#fde68a','#c4b5fd',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {shown.map((item, i) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 160, fontSize: '0.75rem', color: 'rgba(240,244,255,0.85)', textAlign: 'right',
            flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={item.label}
          >
            {item.label}
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 4, height: 18, overflow: 'hidden' }}>
            <div style={{
              width: `${(item.amount / maxVal) * 100}%`,
              height: '100%',
              background: colors[i % colors.length],
              borderRadius: 4,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ width: 90, fontSize: '0.73rem', color: 'rgba(148,163,184,0.9)',
            textAlign: 'right', flexShrink: 0 }}>
            {fmtAmt(item.amount)}
          </div>
        </div>
      ))}
      {items.length > maxItems && (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right', margin: 0 }}>
          외 {items.length - maxItems}건 더 있음
        </p>
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
            <th style={th}>순위</th>
            <th style={th}>{labelHeader}</th>
            <th style={{ ...th, textAlign: 'right' }}>처방금액</th>
            <th style={{ ...th, textAlign: 'right' }}>비중</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.label} style={{ borderTop: '1px solid rgba(255,255,255,0.04)',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
              <td style={{ ...td, color: 'var(--text-muted)', width: 40 }}>{i + 1}</td>
              <td style={{ ...td, fontWeight: i < 3 ? 600 : 400 }}>{item.label}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {item.amount.toLocaleString()}
              </td>
              <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>
                {total > 0 ? `${((item.amount / total) * 100).toFixed(1)}%` : '-'}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(99,102,241,0.05)' }}>
            <td style={{ ...td, fontWeight: 700 }} colSpan={2}>합계</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {total.toLocaleString()}
            </td>
            <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NoData() {
  return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
    데이터가 없습니다. 트렌드분석 폴더에 파일을 업로드하고 재처리하세요.
  </p>;
}

/* ════════════════════════════════════════════
   메인 컴포넌트
════════════════════════════════════════════ */
export default function TrendClient() {
  const [activeTab, setActiveTab] = useState<TabKey>('month');
  const [items,     setItems]     = useState<AggItem[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [meta,      setMeta]      = useState<MetaData | null>(null);

  // 필터
  const [monthFrom, setMonthFrom] = useState('');
  const [monthTo,   setMonthTo]   = useState('');
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
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error('[Trend] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, monthFrom, monthTo, filterRep, filterCso, filterProd, filterType, filterTier]);

  useEffect(() => { load(); }, [load]);

  const labelMap: Record<TabKey, string> = {
    month: '처방월', rep: '담당자', cso: '담당CSO',
    hospital: '처방처', product: '품목명', type: '종별구분', tier: '수수료구간',
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
              트렌드분석 폴더의 처방실적 데이터를 다차원으로 분석합니다.
            </p>
          </div>
          {total > 0 && (
            <div style={{ padding: '0.5rem 1rem', borderRadius: 9, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>총 처방금액 </span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#34d399' }}>{total.toLocaleString()}원</span>
            </div>
          )}
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          {/* 기간 */}
          <input type="month" value={monthFrom} onChange={e => setMonthFrom(e.target.value)}
            style={sel} placeholder="시작월" title="시작월" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>~</span>
          <input type="month" value={monthTo} onChange={e => setMonthTo(e.target.value)}
            style={sel} placeholder="종료월" title="종료월" />

          {/* 담당자 */}
          <select value={filterRep} onChange={e => setFilterRep(e.target.value)} style={sel}>
            <option value="">전체 담당자</option>
            {(meta?.reps ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* CSO */}
          <select value={filterCso} onChange={e => setFilterCso(e.target.value)} style={sel}>
            <option value="">전체 CSO</option>
            {(meta?.csos ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* 품목 */}
          <select value={filterProd} onChange={e => setFilterProd(e.target.value)} style={sel}>
            <option value="">전체 품목</option>
            {(meta?.products ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* 종별 */}
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={sel}>
            <option value="">전체 종별</option>
            {(meta?.types ?? []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* 수수료구간 */}
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} style={sel}>
            <option value="">전체 구간</option>
            {TIER_ORDER.map(v => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* 초기화 */}
          {(monthFrom || monthTo || filterRep || filterCso || filterProd || filterType || filterTier) && (
            <button onClick={() => {
              setMonthFrom(''); setMonthTo('');
              setFilterRep(''); setFilterCso(''); setFilterProd(''); setFilterType(''); setFilterTier('');
            }} style={{
              padding: '0.38rem 0.75rem', borderRadius: 7, cursor: 'pointer',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171', fontSize: '0.78rem', fontFamily: 'inherit',
            }}>초기화</button>
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
            {(['chart', 'table'] as const).map(m => (
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
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>⏳ 분석 중…</p>
        ) : viewMode === 'chart' ? (
          activeTab === 'month'
            ? <LineChart items={items} />
            : <BarChart items={items} maxItems={activeTab === 'hospital' ? 30 : 20} />
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
