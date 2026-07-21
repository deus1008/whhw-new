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
  const [selIdx,  setSelIdx]  = useState(0);
  const [search,  setSearch]  = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'avail' | 'transit' | 'total'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const period = periods[selIdx];

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
              <option key={`${p.year}-${p.period}`} value={i} style={{ color: '#111' }}>
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
    </div>
  );
}

const thBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit',
  fontWeight: 'inherit', padding: 0,
};
