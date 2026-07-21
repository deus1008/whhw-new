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

/* ── 재고 모니터링 분류 ──
 * 기준점 = 년간평균 재고수량(신규출시·품절후재생산 등 3개월추이 왜곡을 완화).
 *   · 현재고 ≥ 기준 × 120% → 재고 과다
 *   · 현재고 ≤ 기준 × 30%  → 재고 급감
 *   · 그 외 → 정상
 * 3개월 추이(최근 3개월 값)는 함께 표시해 같이 판단.
 */
const HIGH = 1.20;   // 기준 대비 120% 초과 = 과다
const LOW  = 0.30;   // 기준 대비 30% 이하  = 급감

type TrendCat = 'shortage' | 'excess' | 'normal';
type TrendMeta = { cat: TrendCat; label: string; color: string; rank: number };

const CAT_META: Record<TrendCat, TrendMeta> = {
  shortage: { cat: 'shortage', label: '🔴 재고 급감', color: '#f87171', rank: 0 },
  excess:   { cat: 'excess',   label: '🟠 재고 과다', color: '#fb923c', rank: 1 },
  normal:   { cat: 'normal',   label: '⚪ 정상',      color: '#94a3b8', rank: 2 },
};

/** 현재고 vs 년간평균 비율로 분류 (기준 대비 120%↑ 과다 / 30%↓ 급감) */
function classifyStock(current: number, annualAvg: number): { ratio: number | null; meta: TrendMeta } {
  if (annualAvg <= 0) return { ratio: null, meta: CAT_META.normal };   // 기준 없음(신규 등)
  const ratio = current / annualAvg;
  const cat: TrendCat = ratio <= LOW ? 'shortage' : ratio >= HIGH ? 'excess' : 'normal';
  return { ratio, meta: CAT_META[cat] };
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

  // ── 재고 모니터링: 3개월 추이 + 년간평균(기준점) ──
  const trend = useMemo(() => {
    if (periods.length < 2) return null;
    const last3   = [...periods.slice(0, 3)].reverse();   // 3개월 추이(오래된→최신)
    const window12 = periods.slice(0, 12);                // 년간평균용(최근 12개월)

    const nameByCode = new Map<string, string>();
    const unitByCode = new Map<string, string | null>();
    // 각 기간별 코드→총재고
    const mapOf = (ps: StockPeriod[]) => ps.map(p => {
      const m = new Map<string, number>();
      for (const r of p.rows) {
        m.set(r.material_code, r.total_qty);
        if (!nameByCode.has(r.material_code)) { nameByCode.set(r.material_code, r.material_name); unitByCode.set(r.material_code, r.unit); }
      }
      return m;
    });
    const maps3  = mapOf(last3);
    const maps12 = mapOf(window12);

    const codes = new Set<string>(nameByCode.keys());
    const items = [...codes].map(code => {
      const series = maps3.map(m => m.get(code) ?? 0);                    // 최근 3개월
      const present = maps12.map(m => m.get(code)).filter((v): v is number => v != null); // 있는 달만
      const annualAvg = present.length ? present.reduce((s, v) => s + v, 0) / present.length : 0;
      const current = series[series.length - 1];                         // 최신월 재고
      const { ratio, meta } = classifyStock(current, annualAvg);
      return { code, name: nameByCode.get(code)!, unit: unitByCode.get(code)!, series, annualAvg, current, ratio, meta };
    });
    // 위험(급감·과다) 우선, 그 다음 기준편차 큰 순
    items.sort((a, b) => a.meta.rank - b.meta.rank || Math.abs((b.ratio ?? 1) - 1) - Math.abs((a.ratio ?? 1) - 1));
    const counts = { shortage: 0, excess: 0, normal: 0 } as Record<TrendCat, number>;
    for (const it of items) counts[it.meta.cat]++;
    return { ordered: last3, months12: window12.length, items, counts };
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

/* ── 3개월추이 + 년간평균 모니터링 뷰 ── */
type TrendItem = { code: string; name: string; unit: string | null; series: number[]; annualAvg: number; current: number; ratio: number | null; meta: TrendMeta };
function TrendView({ trend, rows, filter, setFilter, search, setSearch }: {
  trend: { ordered: StockPeriod[]; months12: number; items: TrendItem[]; counts: Record<TrendCat, number> } | null;
  rows: TrendItem[];
  filter: TrendCat | 'all'; setFilter: (c: TrendCat | 'all') => void;
  search: string; setSearch: (s: string) => void;
}) {
  if (!trend) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        추이 분석에는 최소 2개월 이상의 재고 데이터가 필요합니다. 매월 재고현황 파일을 업로드하면 자동 분석됩니다.
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
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem', lineHeight: 1.6 }}>
        총재고 기준 · 매월 1일자 · 3개월 추이({monthLabels.join('→')})와 <b style={{ color: '#c4b5fd' }}>년간평균</b>(최근 {trend.months12}개월)을 함께 표시.
        기준점 = 년간평균, <b style={{ color: CAT_META.excess.color }}>과다</b>=기준 120% 초과 · <b style={{ color: CAT_META.shortage.color }}>급감</b>=기준 30% 이하.
        (신규출시·재생산 왜곡을 완화하기 위해 년간평균을 기준으로 판정)
      </div>

      {/* 분류 칩 */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        {chip('all', '전체', trend.items.length, '#c4b5fd')}
        {chip('shortage', CAT_META.shortage.label, trend.counts.shortage, CAT_META.shortage.color)}
        {chip('excess',   CAT_META.excess.label,   trend.counts.excess,   CAT_META.excess.color)}
        {chip('normal',   CAT_META.normal.label,   trend.counts.normal,   CAT_META.normal.color)}
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
                <th style={{ ...TH, color: '#c4b5fd' }}>년간평균</th>
                <th style={TH}>기준대비</th>
                <th style={TH_L}>판정</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it, i) => (
                <tr key={it.code} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : undefined }}>
                  <td style={{ ...TD_L, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.name}>{it.name}</td>
                  {it.series.map((v, j) => (
                    <td key={j} style={{ ...TD, color: v > 0 ? '#fbbf24' : 'rgba(255,255,255,0.2)', fontWeight: j === it.series.length - 1 ? 700 : 400 }}>{fmt(v)}</td>
                  ))}
                  <td style={{ ...TD, color: '#c4b5fd' }}>{it.annualAvg > 0 ? Math.round(it.annualAvg).toLocaleString() : '-'}</td>
                  <td style={{ ...TD, color: it.meta.color, fontWeight: 700 }}>
                    {it.ratio == null ? '-' : `${Math.round(it.ratio * 100)}%`}
                  </td>
                  <td style={{ ...TD_L, color: it.meta.color, fontSize: '0.76rem', fontWeight: 600 }}>{it.meta.label}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={monthLabels.length + 4} style={{ ...TD, textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>해당 품목이 없습니다.</td></tr>
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
