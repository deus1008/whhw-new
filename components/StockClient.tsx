'use client';

import React, { useState, useMemo } from 'react';

export type StockRow = {
  material_code:  string;
  material_name:  string;
  unit:           string | null;
  available_qty:  number;
  transit_qty:    number;
  total_qty:      number;
};

export type StockPeriod = {
  year:        string;
  period:      string;
  source_file: string;
  rows:        StockRow[];
};

/* ── 스타일 ── */
const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px', padding: '1rem', marginBottom: '0.75rem',
};
const TH: React.CSSProperties = {
  padding: '0.45rem 0.7rem', fontSize: '0.72rem', color: 'var(--text-muted)',
  fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};
const TH_L: React.CSSProperties = { ...TH, textAlign: 'left' };
const TD: React.CSSProperties = {
  padding: '0.4rem 0.7rem', fontSize: '0.8rem', whiteSpace: 'nowrap',
  textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)',
};
const TD_L: React.CSSProperties = { ...TD, textAlign: 'left' };

function fmt(n: number): string {
  return n === 0 ? '-' : n.toLocaleString();
}

/* ── 3개월 재고 추이 분류 ──
 * 재고 감소 → 도매 주문↑ → 처방 증가 추정 / 급감 → 품절·대체조제 위험
 * 재고 증가 → 도매 주문↓ → 처방 감소 추정 / 급증 → 부진재고·폐기 위험
 */
const SHARP = 0.5;   // 급변 기준 ±50%
const MILD  = 0.15;  // 완만 기준 ±15%

type TrendCat = 'shortage' | 'excess' | 'down' | 'up' | 'flat';
type TrendMeta = { cat: TrendCat; label: string; desc: string; color: string; rank: number };

const CAT_META: Record<TrendCat, TrendMeta> = {
  shortage: { cat: 'shortage', label: '🔴 품절 위험', desc: '재고 급감 — 처방 증가 추정이나 품절 시 대체조제 위험', color: '#f87171', rank: 0 },
  excess:   { cat: 'excess',   label: '🟠 폐기 위험', desc: '재고 급증 — 계획 대비 처방 부진, 부진재고 폐기 위험',  color: '#fb923c', rank: 1 },
  down:     { cat: 'down',     label: '🟢 감소',       desc: '재고 감소 — 처방 증가 추정',                         color: '#4ade80', rank: 2 },
  up:       { cat: 'up',       label: '🔵 증가',       desc: '재고 증가 — 처방 감소 추정',                         color: '#60a5fa', rank: 3 },
  flat:     { cat: 'flat',     label: '⚪ 보합',       desc: '재고 변동 미미',                                     color: '#94a3b8', rank: 4 },
};

/** 최고(oldest)→최신 재고 시계열 → 변화율·분류. v0=0 은 신규유입으로 보아 극단분류 제외 */
function classifyTrend(series: number[]): { pct: number | null; meta: TrendMeta } {
  const v0 = series[0], vN = series[series.length - 1];
  if (v0 === 0) {
    const meta = vN > 0 ? CAT_META.up : CAT_META.flat;   // 0→유입 = 증가(신규), 0→0 = 보합
    return { pct: v0 === 0 && vN > 0 ? null : 0, meta };
  }
  const pct = (vN - v0) / v0;
  let cat: TrendCat;
  if (pct <= -SHARP) cat = 'shortage';
  else if (pct >= SHARP) cat = 'excess';
  else if (pct <= -MILD) cat = 'down';
  else if (pct >= MILD) cat = 'up';
  else cat = 'flat';
  return { pct, meta: CAT_META[cat] };
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: '130px', background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '0.85rem 1rem',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: color ?? '#fff' }}>{value}</div>
    </div>
  );
}

export default function StockClient({ periods }: { periods: StockPeriod[] }) {
  const [view,    setView]    = useState<'month' | 'trend'>('trend');
  const [selIdx,  setSelIdx]  = useState(0);
  const [search,  setSearch]  = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'avail' | 'transit' | 'total'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [trendFilter, setTrendFilter] = useState<TrendCat | 'all'>('all');
  const [trendSearch, setTrendSearch] = useState('');

  const period = periods[selIdx];

  // ── 3개월 추이 분석: 최신 3개 기간(총재고 기준) ──
  const trend = useMemo(() => {
    const last = periods.slice(0, 3);              // 최신순
    if (last.length < 2) return null;
    const ordered = [...last].reverse();           // 오래된→최신
    const nameByCode = new Map<string, string>();
    const unitByCode = new Map<string, string | null>();
    const qtyMaps = ordered.map(p => {
      const m = new Map<string, number>();
      for (const r of p.rows) {
        m.set(r.material_code, r.total_qty);
        if (!nameByCode.has(r.material_code)) { nameByCode.set(r.material_code, r.material_name); unitByCode.set(r.material_code, r.unit); }
      }
      return m;
    });
    const codes = new Set<string>(nameByCode.keys());
    const items = [...codes].map(code => {
      const series = qtyMaps.map(m => m.get(code) ?? 0);
      const { pct, meta } = classifyTrend(series);
      return { code, name: nameByCode.get(code)!, unit: unitByCode.get(code)!, series, pct, meta };
    });
    // 위험(품절·폐기) 우선, 그 다음 변화율 큰 순
    items.sort((a, b) => a.meta.rank - b.meta.rank || Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));
    const counts = { shortage: 0, excess: 0, down: 0, up: 0, flat: 0 } as Record<TrendCat, number>;
    for (const it of items) counts[it.meta.cat]++;
    return { ordered, items, counts };
  }, [periods]);

  const trendRows = useMemo(() => {
    if (!trend) return [];
    let list = trend.items;
    if (trendFilter !== 'all') list = list.filter(it => it.meta.cat === trendFilter);
    const q = trendSearch.trim().toLowerCase();
    if (q) list = list.filter(it => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q));
    return list;
  }, [trend, trendFilter, trendSearch]);

  const rows = useMemo(() => {
    let list = period?.rows ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.material_name.toLowerCase().includes(q) ||
        r.material_code.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      let v = 0;
      if (sortKey === 'name')    v = a.material_name.localeCompare(b.material_name, 'ko');
      if (sortKey === 'avail')   v = a.available_qty - b.available_qty;
      if (sortKey === 'transit') v = a.transit_qty   - b.transit_qty;
      if (sortKey === 'total')   v = a.total_qty     - b.total_qty;
      return sortAsc ? v : -v;
    });
  }, [period, search, sortKey, sortAsc]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const totalAvail   = rows.reduce((s, r) => s + r.available_qty,  0);
  const totalTransit = rows.reduce((s, r) => s + r.transit_qty,    0);
  const totalAll     = rows.reduce((s, r) => s + r.total_qty,      0);

  function sortIcon(key: typeof sortKey) {
    if (sortKey !== key) return <span style={{ opacity: 0.25, marginLeft: '0.2rem' }}>↕</span>;
    return <span style={{ marginLeft: '0.2rem', fontSize: '0.65rem' }}>{sortAsc ? '▲' : '▼'}</span>;
  }

  if (periods.length === 0) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        문서관리 &gt; 재고현황 폴더에 ERP Excel 파일을 업로드하고 처리하면 자동 표시됩니다.
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>

      {/* 뷰 전환 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {([['trend', '3개월추이'], ['month', '월별 현황']] as [typeof view, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            style={{
              padding: '0.5rem 1.1rem', borderRadius: '9px', border: '1px solid',
              cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit', fontWeight: view === k ? 700 : 500,
              borderColor: view === k ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.12)',
              background: view === k ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.04)',
              color: view === k ? '#c4b5fd' : 'var(--text-muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {view === 'trend' ? (
        <TrendView trend={trend} rows={trendRows} filter={trendFilter} setFilter={setTrendFilter} search={trendSearch} setSearch={setTrendSearch} />
      ) : (
      <>
      {/* 기간 선택 — 드롭다운(진입 시 최신월 기본). 과거월은 목록에서 선택 */}
      {periods.length > 1 && (
        <div style={{ marginBottom: '1rem' }}>
          <select
            value={selIdx}
            onChange={e => { setSelIdx(Number(e.target.value)); setSearch(''); }}
            style={{
              padding: '0.5rem 0.9rem', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(99,102,241,0.18)',
              color: '#c4b5fd', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer', outline: 'none', minWidth: '150px',
            }}
          >
            {periods.map((p, i) => (
              <option key={`${p.year}-${p.period}`} value={i} style={{ color: '#e2e8f0', background: '#1a2030' }}>
                {p.year}년 {p.period}월
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 요약 */}
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        {period.year}년 {period.period}월 기준 &nbsp;·&nbsp; {period.source_file}
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <StatCard label="품목 수"      value={`${rows.length.toLocaleString()}개`} />
        <StatCard label="가용 합계"    value={totalAvail.toLocaleString()}   color="#4ade80" />
        <StatCard label="운송중 합계"  value={totalTransit.toLocaleString()} color="#a8c4ff" />
        <StatCard label="총재고 합계"  value={totalAll.toLocaleString()}     color="#fbbf24" />
      </div>

      {/* 검색 */}
      <div style={{ marginBottom: '0.6rem' }}>
        <input
          type="text"
          placeholder="품목명 / 자재코드 검색…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '0.5rem 0.9rem', fontSize: '0.82rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '9px', color: '#e2e8f0', outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* 테이블 */}
      <div style={CARD}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH_L}>
                  <button onClick={() => toggleSort('name')} style={thBtn}>
                    자재내역 {sortIcon('name')}
                  </button>
                </th>
                <th style={TH}>자재코드</th>
                <th style={TH}>
                  <button onClick={() => toggleSort('avail')} style={thBtn}>
                    가용 {sortIcon('avail')}
                  </button>
                </th>
                <th style={TH}>
                  <button onClick={() => toggleSort('transit')} style={thBtn}>
                    운송중 {sortIcon('transit')}
                  </button>
                </th>
                <th style={TH}>
                  <button onClick={() => toggleSort('total')} style={thBtn}>
                    합계 {sortIcon('total')}
                  </button>
                </th>
                <th style={TH}>단위</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.material_code} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : undefined }}>
                  <td style={{ ...TD_L, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.material_name}
                  </td>
                  <td style={{ ...TD, color: 'var(--text-muted)', fontSize: '0.73rem' }}>{r.material_code}</td>
                  <td style={{ ...TD, color: r.available_qty > 0 ? '#4ade80' : 'rgba(255,255,255,0.2)' }}>
                    {fmt(r.available_qty)}
                  </td>
                  <td style={{ ...TD, color: r.transit_qty > 0 ? '#a8c4ff' : 'rgba(255,255,255,0.2)' }}>
                    {fmt(r.transit_qty)}
                  </td>
                  <td style={{ ...TD, color: r.total_qty > 0 ? '#fbbf24' : 'rgba(255,255,255,0.2)', fontWeight: 600 }}>
                    {fmt(r.total_qty)}
                  </td>
                  <td style={{ ...TD, color: 'var(--text-muted)', fontSize: '0.73rem' }}>{r.unit ?? '-'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...TD, textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                    검색 결과가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                  <td style={{ ...TD_L, fontWeight: 700, color: '#fff' }}>합계</td>
                  <td style={TD} />
                  <td style={{ ...TD, color: '#4ade80', fontWeight: 700 }}>{totalAvail.toLocaleString()}</td>
                  <td style={{ ...TD, color: '#a8c4ff', fontWeight: 700 }}>{totalTransit.toLocaleString()}</td>
                  <td style={{ ...TD, color: '#fbbf24', fontWeight: 700 }}>{totalAll.toLocaleString()}</td>
                  <td style={TD} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/* ── 3개월 추이 모니터링 뷰 ── */
type TrendItem = { code: string; name: string; unit: string | null; series: number[]; pct: number | null; meta: TrendMeta };
function TrendView({ trend, rows, filter, setFilter, search, setSearch }: {
  trend: { ordered: StockPeriod[]; items: TrendItem[]; counts: Record<TrendCat, number> } | null;
  rows: TrendItem[];
  filter: TrendCat | 'all'; setFilter: (c: TrendCat | 'all') => void;
  search: string; setSearch: (s: string) => void;
}) {
  if (!trend) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        3개월 추이 분석에는 최소 2개월 이상의 재고 데이터가 필요합니다. 매월 재고현황 파일을 업로드하면 자동 분석됩니다.
      </div>
    );
  }
  const monthLabels = trend.ordered.map(p => `${p.year}.${String(p.period).padStart(2, '0')}`);
  const chip = (key: TrendCat | 'all', label: string, n: number, color: string) => (
    <button key={key} onClick={() => setFilter(key)}
      style={{
        padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit',
        border: '1px solid', borderColor: filter === key ? color : 'rgba(255,255,255,0.12)',
        background: filter === key ? `${color}22` : 'rgba(255,255,255,0.04)',
        color: filter === key ? color : 'var(--text-muted)', fontWeight: filter === key ? 700 : 500,
      }}>
      {label} <b style={{ marginLeft: 3 }}>{n}</b>
    </button>
  );

  return (
    <div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
        분석 기간(총재고 기준): {monthLabels.join(' → ')} · 매월 1일자 · 재고 급감=품절/대체조제 위험, 급증=부진재고/폐기 위험
      </div>

      {/* 분류 칩 */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        {chip('all', '전체', trend.items.length, '#c4b5fd')}
        {chip('shortage', CAT_META.shortage.label, trend.counts.shortage, CAT_META.shortage.color)}
        {chip('excess',   CAT_META.excess.label,   trend.counts.excess,   CAT_META.excess.color)}
        {chip('down',     CAT_META.down.label,     trend.counts.down,     CAT_META.down.color)}
        {chip('up',       CAT_META.up.label,       trend.counts.up,       CAT_META.up.color)}
        {chip('flat',     CAT_META.flat.label,     trend.counts.flat,     CAT_META.flat.color)}
      </div>

      <div style={{ marginBottom: '0.6rem' }}>
        <input type="text" placeholder="품목명 / 자재코드 검색…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.9rem', fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '9px', color: '#e2e8f0', outline: 'none', fontFamily: 'inherit' }} />
      </div>

      <div style={CARD}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH_L}>자재내역</th>
                {monthLabels.map(m => <th key={m} style={TH}>{m}</th>)}
                <th style={TH}>3개월 변화</th>
                <th style={TH_L}>판정 / 해석</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it, i) => (
                <tr key={it.code} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : undefined }}>
                  <td style={{ ...TD_L, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.name}>{it.name}</td>
                  {it.series.map((v, j) => (
                    <td key={j} style={{ ...TD, color: v > 0 ? '#fbbf24' : 'rgba(255,255,255,0.2)', fontWeight: j === it.series.length - 1 ? 700 : 400 }}>{fmt(v)}</td>
                  ))}
                  <td style={{ ...TD, color: it.meta.color, fontWeight: 700 }}>
                    {it.pct == null ? '신규' : `${it.pct >= 0 ? '+' : ''}${(it.pct * 100).toFixed(0)}%`}
                  </td>
                  <td style={{ ...TD_L, color: it.meta.color, fontSize: '0.74rem' }}>
                    {it.meta.label}<span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{it.meta.desc}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={monthLabels.length + 3} style={{ ...TD, textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>해당 품목이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const thBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit',
  fontWeight: 'inherit', padding: 0,
};
