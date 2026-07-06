'use client';

import React, { useState, useEffect } from 'react';

/* ── API 응답 집계 타입 ── */
type AggNode = { name: string; presc: number; sett: number; cnt: number; sub?: AggNode[] };
type AggData = {
  summary:     { totalPresc: number; totalSett: number; totalCnt: number };
  csoTree:     AggNode[];
  mgrTree:     AggNode[];
  productTree: AggNode[];
  typeTree:    AggNode[];
};

/* ── 집계 트리 타입 ── */
type L4 = { name: string; presc: number; sett: number; cnt: number };
type L3 = { name: string; presc: number; sett: number; cnt: number; sub?: L4[] };
type L2 = { name: string; presc: number; sett: number; cnt: number; sub: L3[] };
type L1 = { name: string; presc: number; sett: number; cnt: number; sub: L2[] };

/* ── 5단 집계 트리 타입 ── */
type L5   = { name: string; presc: number; sett: number; cnt: number };
type L4_5 = { name: string; presc: number; sett: number; cnt: number; sub: L5[] };
type L3_5 = { name: string; presc: number; sett: number; cnt: number; sub: L4_5[] };
type L2_5 = { name: string; presc: number; sett: number; cnt: number; sub: L3_5[] };
type L1_5 = { name: string; presc: number; sett: number; cnt: number; sub: L2_5[] };


/* ── 포맷 유틸 ── */
function fmtChun(n: number | null | undefined): string {
  if (n == null) return '-';
  return Math.round(n / 1000).toLocaleString();
}
function fmtChunBig(n: number | null | undefined): string {
  if (n == null) return '-';
  const c = n / 1000;
  if (Math.abs(c) >= 100_000) return `${(c / 100_000).toFixed(1)}억`;
  if (Math.abs(c) >= 1_000)   return `${(c / 1_000).toFixed(0)}만`;
  return `${Math.round(c).toLocaleString()}천`;
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return '-';
  return `${n.toFixed(1)}%`;
}
function calcRate(sett: number, presc: number): string {
  return presc > 0 ? fmtPct((sett / presc) * 100) : '-';
}
function fmtMonth(m: string | null): string {
  if (!m) return '-';
  const mt = m.match(/^(\d{4})-(\d{2})$/);
  if (mt) return `${mt[1]}년 ${+mt[2]}월`;
  return m;
}

/* ── 공통 스타일 ── */
const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px', padding: '1rem', marginBottom: '0.75rem',
};
const TH: React.CSSProperties = {
  padding: '0.4rem 0.6rem', fontSize: '0.7rem', color: 'var(--text-muted)',
  fontWeight: 600, whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'right',
};
const TH_L: React.CSSProperties = { ...TH, textAlign: 'left' };
const TD: React.CSSProperties = {
  padding: '0.4rem 0.6rem', fontSize: '0.78rem', whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'right',
};
const TD_L: React.CSSProperties = { ...TD, textAlign: 'left' };

/* ── 요약 카드 ── */
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

/* ── 섹션 제목 ── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem',
      background: 'linear-gradient(135deg,#fff 0%,#a8c4ff 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
    }}>{children}</h3>
  );
}

/* ── 3단 아코디언 테이블 ── */
interface AccordionTableProps {
  title: string;
  tree: L1[];
  totalPresc: number;
  totalSett: number;
  totalCnt: number;
  accentL1: string;   // rgba 색상 (L1 하이라이트)
  accentL2: string;
  accentL3: string;
  colorPresc?: string;
  colorSett?: string;
  colorRate?: string;
  l1Label: string;
}

const SHOW_LIMIT = 10;

function ShowMoreRow({ hidden, onShow, onHide }: { hidden: number; onShow: () => void; onHide: () => void }) {
  if (hidden > 0) return (
    <tr>
      <td colSpan={5} style={{ textAlign: 'center', padding: '0.5rem' }}>
        <button onClick={onShow} style={{
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '6px', color: 'var(--text-muted)', fontSize: '0.75rem',
          padding: '0.3rem 1rem', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          {hidden}개 더 보기 ▼
        </button>
      </td>
    </tr>
  );
  return (
    <tr>
      <td colSpan={5} style={{ textAlign: 'center', padding: '0.4rem' }}>
        <button onClick={onHide} style={{
          background: 'transparent', border: 'none',
          color: 'rgba(180,180,220,0.35)', fontSize: '0.72rem',
          padding: '0.2rem 0.8rem', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          접기 ▲
        </button>
      </td>
    </tr>
  );
}

function AccordionTable({
  title, tree, totalPresc, totalSett, totalCnt,
  accentL1, accentL2, accentL3,
  colorPresc = '#a8c4ff', colorSett = '#4ade80', colorRate = '#fbbf24',
  l1Label,
}: AccordionTableProps) {
  const [openL1, setOpenL1] = useState<string | null>(null);
  const [openL2, setOpenL2] = useState<string | null>(null);
  const [openL3, setOpenL3] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  function toggleL1(name: string) {
    const next = openL1 === name ? null : name;
    setOpenL1(next);
    setOpenL2(null);
    setOpenL3(null);
  }
  function toggleL2(key: string) {
    setOpenL2(openL2 === key ? null : key);
    setOpenL3(null);
  }
  function toggleL3(key: string) {
    setOpenL3(openL3 === key ? null : key);
  }

  const visible = showAll ? tree : tree.slice(0, SHOW_LIMIT);
  const hidden  = tree.length - visible.length;

  return (
    <div style={CARD}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH_L}>{l1Label}</th>
              <th style={TH}>처방금액 (천원)</th>
              <th style={TH}>정산액 (천원)</th>
              <th style={TH}>수수료율</th>
              <th style={TH}>건수</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(l1 => {
              const l1Open = openL1 === l1.name;
              return (
                <React.Fragment key={l1.name}>
                  {/* ── L1 ── */}
                  <tr onClick={() => toggleL1(l1.name)}
                    style={{ cursor: 'pointer', background: l1Open ? accentL1 : undefined }}>
                    <td style={{ ...TD_L, fontWeight: 600 }}>
                      <span style={{ marginRight: '0.4rem', fontSize: '0.68rem', opacity: 0.55 }}>{l1Open ? '▲' : '▶'}</span>
                      <span style={{ color: l1Open ? '#c4b5fd' : '#e2e8f0' }}>{l1.name}</span>
                    </td>
                    <td style={{ ...TD, color: colorPresc }}>{fmtChun(l1.presc)}</td>
                    <td style={{ ...TD, color: colorSett, fontWeight: 600 }}>{fmtChun(l1.sett)}</td>
                    <td style={{ ...TD, color: colorRate }}>{calcRate(l1.sett, l1.presc)}</td>
                    <td style={TD}>{l1.cnt.toLocaleString()}</td>
                  </tr>

                  {/* ── L2 ── */}
                  {l1Open && l1.sub.map(l2 => {
                    const l2Key  = `${l1.name}||${l2.name}`;
                    const l2Open = openL2 === l2Key;
                    return (
                      <React.Fragment key={l2Key}>
                        <tr onClick={() => toggleL2(l2Key)}
                          style={{ cursor: 'pointer', background: l2Open ? accentL2 : accentL3 }}>
                          <td style={{ ...TD_L, paddingLeft: '1.7rem', fontSize: '0.75rem' }}>
                            <span style={{ marginRight: '0.35rem', fontSize: '0.63rem', opacity: 0.5 }}>{l2Open ? '▲' : '▶'}</span>
                            <span style={{ color: l2Open ? '#ddd6fe' : 'var(--text-muted)' }}>{l2.name}</span>
                          </td>
                          <td style={{ ...TD, color: '#8ab0e8', fontSize: '0.75rem' }}>{fmtChun(l2.presc)}</td>
                          <td style={{ ...TD, color: '#3dd68c', fontSize: '0.75rem' }}>{fmtChun(l2.sett)}</td>
                          <td style={{ ...TD, color: '#d4a843', fontSize: '0.75rem' }}>{calcRate(l2.sett, l2.presc)}</td>
                          <td style={{ ...TD, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l2.cnt.toLocaleString()}</td>
                        </tr>

                        {/* ── L3 (병의원) + L4 (품목 드릴다운) ── */}
                        {l2Open && l2.sub.map((l3, i) => {
                          const l3Key  = `${l2Key}||${l3.name}`;
                          const l3Open = openL3 === l3Key;
                          const hasL4  = (l3.sub?.length ?? 0) > 0;
                          return (
                            <React.Fragment key={l3.name}>
                              <tr
                                onClick={hasL4 ? () => toggleL3(l3Key) : undefined}
                                style={{
                                  background: l3Open ? 'rgba(120,100,200,0.09)' : (i % 2 === 0 ? 'rgba(120,100,200,0.04)' : undefined),
                                  cursor: hasL4 ? 'pointer' : undefined,
                                }}
                              >
                                <td style={{ ...TD_L, paddingLeft: '3.2rem', fontSize: '0.7rem',
                                  color: 'rgba(200,200,230,0.55)', maxWidth: '200px',
                                  overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {hasL4 && <span style={{ marginRight: '0.3rem', fontSize: '0.6rem', opacity: 0.4 }}>{l3Open ? '▲' : '▶'}</span>}
                                  {l3.name}
                                </td>
                                <td style={{ ...TD, color: '#7a9fd4', fontSize: '0.7rem' }}>{fmtChun(l3.presc)}</td>
                                <td style={{ ...TD, color: '#34c472', fontSize: '0.7rem' }}>{fmtChun(l3.sett)}</td>
                                <td style={{ ...TD, color: '#c49a30', fontSize: '0.7rem' }}>{calcRate(l3.sett, l3.presc)}</td>
                                <td style={{ ...TD, fontSize: '0.7rem', color: 'var(--text-muted)' }}>{l3.cnt.toLocaleString()}</td>
                              </tr>
                              {l3Open && l3.sub?.map((l4, j) => (
                                <tr key={l4.name} style={{ background: j % 2 === 0 ? 'rgba(100,80,180,0.05)' : undefined }}>
                                  <td style={{ ...TD_L, paddingLeft: '4.8rem', fontSize: '0.66rem',
                                    color: 'rgba(160,160,210,0.5)', maxWidth: '180px',
                                    overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {l4.name}
                                  </td>
                                  <td style={{ ...TD, color: '#6a8fc4', fontSize: '0.66rem' }}>{fmtChun(l4.presc)}</td>
                                  <td style={{ ...TD, color: '#2ab460', fontSize: '0.66rem' }}>{fmtChun(l4.sett)}</td>
                                  <td style={{ ...TD, color: '#b48820', fontSize: '0.66rem' }}>{calcRate(l4.sett, l4.presc)}</td>
                                  <td style={{ ...TD, fontSize: '0.66rem', color: 'var(--text-muted)' }}>{l4.cnt.toLocaleString()}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* 더 보기 / 접기 */}
            {tree.length > SHOW_LIMIT && (
              <ShowMoreRow hidden={hidden} onShow={() => setShowAll(true)} onHide={() => { setShowAll(false); setOpenL1(null); setOpenL2(null); setOpenL3(null); }} />
            )}

            {/* 합계 행 */}
            <tr style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <td style={{ ...TD_L, fontWeight: 700, color: '#fff' }}>합계</td>
              <td style={{ ...TD, color: colorPresc, fontWeight: 700 }}>{fmtChun(totalPresc)}</td>
              <td style={{ ...TD, color: colorSett,  fontWeight: 700 }}>{fmtChun(totalSett)}</td>
              <td style={{ ...TD, color: colorRate,  fontWeight: 700 }}>{calcRate(totalSett, totalPresc)}</td>
              <td style={{ ...TD, fontWeight: 700 }}>{totalCnt.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 5단 아코디언 테이블 (품목→기조실병의원→병원→담당자→CSO) ── */
interface AccordionTable5Props {
  title: string;
  tree: L1_5[];
  totalPresc: number;
  totalSett: number;
  totalCnt: number;
  accentL1: string;
  accentL2: string;
  accentL3: string;
  accentL4: string;
  colorPresc?: string;
  colorSett?: string;
  colorRate?: string;
  l1Label: string;
  l2Label: string;
  l3Label: string;
  l4Label: string;
  l5Label: string;
}

function AccordionTable5({
  title, tree, totalPresc, totalSett, totalCnt,
  accentL1, accentL2, accentL3, accentL4,
  colorPresc = '#a8c4ff', colorSett = '#4ade80', colorRate = '#fbbf24',
  l1Label,
}: AccordionTable5Props) {
  const [search, setSearch]   = useState('');
  const [showAll, setShowAll] = useState(false);
  const [openL1, setOpenL1]   = useState<string | null>(null);
  const [openL2, setOpenL2]   = useState<string | null>(null);
  const [openL3, setOpenL3]   = useState<string | null>(null);
  const [openL4, setOpenL4]   = useState<string | null>(null);

  function toggleL1(n: string) { const v = openL1===n ? null : n; setOpenL1(v); setOpenL2(null); setOpenL3(null); setOpenL4(null); }
  function toggleL2(k: string) { const v = openL2===k ? null : k; setOpenL2(v); setOpenL3(null); setOpenL4(null); }
  function toggleL3(k: string) { const v = openL3===k ? null : k; setOpenL3(v); setOpenL4(null); }
  function toggleL4(k: string) { setOpenL4(openL4===k ? null : k); }

  const allFiltered = search.trim() ? tree.filter(l1 => l1.name.includes(search.trim())) : tree;
  const filtered    = showAll ? allFiltered : allFiltered.slice(0, SHOW_LIMIT);
  const hidden      = allFiltered.length - filtered.length;

  return (
    <div style={CARD}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ marginBottom: '0.6rem' }}>
        <input
          type="text"
          placeholder={`${l1Label} 검색…`}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpenL1(null); setOpenL2(null); setOpenL3(null); setOpenL4(null); }}
          style={{
            width: '100%', padding: '0.45rem 0.8rem', fontSize: '0.8rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px', color: '#e2e8f0', outline: 'none', fontFamily: 'inherit',
          }}
        />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH_L}>{l1Label}</th>
              <th style={TH}>처방금액 (천원)</th>
              <th style={TH}>정산액 (천원)</th>
              <th style={TH}>수수료율</th>
              <th style={TH}>건수</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l1 => {
              const l1Open = openL1 === l1.name;
              return (
                <React.Fragment key={l1.name}>
                  {/* L1: 품목 */}
                  <tr onClick={() => toggleL1(l1.name)} style={{ cursor: 'pointer', background: l1Open ? accentL1 : undefined }}>
                    <td style={{ ...TD_L, fontWeight: 600 }}>
                      <span style={{ marginRight: '0.4rem', fontSize: '0.68rem', opacity: 0.55 }}>{l1Open ? '▲' : '▶'}</span>
                      <span style={{ color: l1Open ? '#6ee7b7' : '#e2e8f0' }}>{l1.name}</span>
                    </td>
                    <td style={{ ...TD, color: colorPresc }}>{fmtChun(l1.presc)}</td>
                    <td style={{ ...TD, color: colorSett, fontWeight: 600 }}>{fmtChun(l1.sett)}</td>
                    <td style={{ ...TD, color: colorRate }}>{calcRate(l1.sett, l1.presc)}</td>
                    <td style={TD}>{l1.cnt.toLocaleString()}</td>
                  </tr>

                  {l1Open && l1.sub.map(l2 => {
                    const l2Key  = `${l1.name}||${l2.name}`;
                    const l2Open = openL2 === l2Key;
                    return (
                      <React.Fragment key={l2Key}>
                        {/* L2: 기조실병의원구분 */}
                        <tr onClick={() => toggleL2(l2Key)} style={{ cursor: 'pointer', background: l2Open ? accentL2 : accentL3 }}>
                          <td style={{ ...TD_L, paddingLeft: '1.5rem', fontSize: '0.75rem' }}>
                            <span style={{ marginRight: '0.35rem', fontSize: '0.63rem', opacity: 0.5 }}>{l2Open ? '▲' : '▶'}</span>
                            <span style={{ color: l2Open ? '#a7f3d0' : 'var(--text-muted)' }}>{l2.name}</span>
                          </td>
                          <td style={{ ...TD, color: '#8ab0e8', fontSize: '0.75rem' }}>{fmtChun(l2.presc)}</td>
                          <td style={{ ...TD, color: '#3dd68c', fontSize: '0.75rem' }}>{fmtChun(l2.sett)}</td>
                          <td style={{ ...TD, color: '#d4a843', fontSize: '0.75rem' }}>{calcRate(l2.sett, l2.presc)}</td>
                          <td style={{ ...TD, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l2.cnt.toLocaleString()}</td>
                        </tr>

                        {l2Open && l2.sub.map(l3 => {
                          const l3Key  = `${l2Key}||${l3.name}`;
                          const l3Open = openL3 === l3Key;
                          return (
                            <React.Fragment key={l3Key}>
                              {/* L3: 병원 */}
                              <tr onClick={() => toggleL3(l3Key)} style={{ cursor: 'pointer', background: l3Open ? accentL4 : undefined }}>
                                <td style={{ ...TD_L, paddingLeft: '2.8rem', fontSize: '0.72rem' }}>
                                  <span style={{ marginRight: '0.3rem', fontSize: '0.6rem', opacity: 0.45 }}>{l3Open ? '▲' : '▶'}</span>
                                  <span style={{ color: l3Open ? '#d1fae5' : 'rgba(200,220,210,0.6)' }}>{l3.name}</span>
                                </td>
                                <td style={{ ...TD, color: '#7a9fd4', fontSize: '0.72rem' }}>{fmtChun(l3.presc)}</td>
                                <td style={{ ...TD, color: '#34c472', fontSize: '0.72rem' }}>{fmtChun(l3.sett)}</td>
                                <td style={{ ...TD, color: '#c49a30', fontSize: '0.72rem' }}>{calcRate(l3.sett, l3.presc)}</td>
                                <td style={{ ...TD, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{l3.cnt.toLocaleString()}</td>
                              </tr>

                              {l3Open && l3.sub.map(l4 => {
                                const l4Key  = `${l3Key}||${l4.name}`;
                                const l4Open = openL4 === l4Key;
                                return (
                                  <React.Fragment key={l4Key}>
                                    {/* L4: 담당자 */}
                                    <tr onClick={() => toggleL4(l4Key)} style={{ cursor: 'pointer', background: l4Open ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.02)' }}>
                                      <td style={{ ...TD_L, paddingLeft: '4.2rem', fontSize: '0.69rem' }}>
                                        <span style={{ marginRight: '0.28rem', fontSize: '0.58rem', opacity: 0.4 }}>{l4Open ? '▲' : '▶'}</span>
                                        <span style={{ color: l4Open ? '#ecfdf5' : 'rgba(180,210,195,0.5)' }}>{l4.name}</span>
                                      </td>
                                      <td style={{ ...TD, color: '#6a8fc4', fontSize: '0.69rem' }}>{fmtChun(l4.presc)}</td>
                                      <td style={{ ...TD, color: '#2ab460', fontSize: '0.69rem' }}>{fmtChun(l4.sett)}</td>
                                      <td style={{ ...TD, color: '#b48820', fontSize: '0.69rem' }}>{calcRate(l4.sett, l4.presc)}</td>
                                      <td style={{ ...TD, fontSize: '0.69rem', color: 'var(--text-muted)' }}>{l4.cnt.toLocaleString()}</td>
                                    </tr>

                                    {/* L5: CSO (리프) */}
                                    {l4Open && l4.sub.map((l5, i) => (
                                      <tr key={l5.name} style={{ background: i % 2 === 0 ? 'rgba(16,185,129,0.03)' : undefined }}>
                                        <td style={{ ...TD_L, paddingLeft: '5.6rem', fontSize: '0.66rem',
                                          color: 'rgba(150,200,175,0.4)', maxWidth: '160px',
                                          overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {l5.name}
                                        </td>
                                        <td style={{ ...TD, color: '#5a7fb4', fontSize: '0.66rem' }}>{fmtChun(l5.presc)}</td>
                                        <td style={{ ...TD, color: '#22a050', fontSize: '0.66rem' }}>{fmtChun(l5.sett)}</td>
                                        <td style={{ ...TD, color: '#a07810', fontSize: '0.66rem' }}>{calcRate(l5.sett, l5.presc)}</td>
                                        <td style={{ ...TD, fontSize: '0.66rem', color: 'var(--text-muted)' }}>{l5.cnt.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* 더 보기 / 접기 */}
            {allFiltered.length > SHOW_LIMIT && (
              <ShowMoreRow hidden={hidden} onShow={() => setShowAll(true)} onHide={() => { setShowAll(false); setOpenL1(null); setOpenL2(null); setOpenL3(null); setOpenL4(null); }} />
            )}

            {/* 합계 행 */}
            <tr style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <td style={{ ...TD_L, fontWeight: 700, color: '#fff' }}>합계</td>
              <td style={{ ...TD, color: colorPresc, fontWeight: 700 }}>{fmtChun(totalPresc)}</td>
              <td style={{ ...TD, color: colorSett,  fontWeight: 700 }}>{fmtChun(totalSett)}</td>
              <td style={{ ...TD, color: colorRate,  fontWeight: 700 }}>{calcRate(totalSett, totalPresc)}</td>
              <td style={{ ...TD, fontWeight: 700 }}>{totalCnt.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
export default function SettlementClient({
  allFiles,
}: {
  allFiles?: { file: string; settMonth: string | null; prescMonth: string | null }[];
}) {
  const files = allFiles ?? [];

  const [selectedFile, setSelectedFile] = useState<string>(files[0]?.file ?? '');
  const [dropOpen,     setDropOpen]     = useState(false);
  const [aggData,      setAggData]      = useState<AggData | null>(null);
  const [loading,      setLoading]      = useState(files.length > 0);
  const [fetchError,   setFetchError]   = useState(false);

  async function loadFile(file: string) {
    setAggData(null);
    setFetchError(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/settlement-rows?file=${encodeURIComponent(file)}`);
      if (res.ok) setAggData(await res.json());
      else setFetchError(true);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  // 마운트 시 첫 파일 자동 fetch
  useEffect(() => {
    const firstFile = files[0]?.file;
    if (!firstFile) return;
    loadFile(firstFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedMeta = files.find(f => f.file === selectedFile);

  async function handleFileChange(file: string) {
    if (file === selectedFile) { setDropOpen(false); return; }
    setSelectedFile(file);
    setDropOpen(false);
    loadFile(file);
  }

  const { totalPresc, totalSett, totalCnt } = aggData?.summary ?? { totalPresc: 0, totalSett: 0, totalCnt: 0 };
  const avgRate = totalPresc > 0 ? (totalSett / totalPresc) * 100 : 0;

  if (files.length === 0 && !loading) {
    return (
      <div style={{ ...CARD, textAlign: 'center', padding: '2rem',
        color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1rem' }}>
        문서관리 &gt; 수수료정산 폴더에 파일을 업로드하면 자동으로 집계됩니다.
      </div>
    );
  }

  return (
    <>
    <style>{`
      @keyframes skel-pulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.65; }
      }
      .skel { animation: skel-pulse 1.4s ease-in-out infinite; background: rgba(255,255,255,0.09); border-radius: 5px; }
      @media print {
        .orb, .page-nav, .no-print { display: none !important; }
        .print-only { display: block !important; }
        @page { margin: 1.5cm; size: A4; }
        body { background: white !important; }
        table td, table th { color: #111 !important; border-color: #ddd !important; }
        table tr { background: transparent !important; }
      }
    `}</style>
    <div style={{ marginTop: '1rem' }}>

      {/* ── 파일 선택 드롭다운 ── */}
      <div className="no-print" style={{ position: 'relative', marginBottom: '1rem' }}>
        <button
          onClick={() => setDropOpen(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.4)',
            background: 'rgba(99,102,241,0.15)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#c4b5fd' }}>
              {selectedFile || '파일을 선택하세요'}
            </div>
            {selectedMeta && (selectedMeta.settMonth || selectedMeta.prescMonth) && (
              <div style={{ fontSize: '0.72rem', color: 'rgba(180,180,220,0.6)', marginTop: '0.15rem' }}>
                {selectedMeta.settMonth  && <span>{fmtMonth(selectedMeta.settMonth)}(정산)</span>}
                {selectedMeta.settMonth && selectedMeta.prescMonth && <span style={{ margin: '0 0.4rem', opacity: 0.4 }}>·</span>}
                {selectedMeta.prescMonth && <span>{fmtMonth(selectedMeta.prescMonth)}(처방)</span>}
              </div>
            )}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'rgba(180,180,220,0.5)', marginLeft: '0.5rem' }}>
            {dropOpen ? '▲' : '▼'}
          </span>
        </button>

        {dropOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: 'rgba(20,20,35,0.97)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '10px', overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {files.map((f, i) => {
              const isActive = f.file === selectedFile;
              return (
                <button
                  key={f.file}
                  onClick={() => handleFileChange(f.file)}
                  style={{
                    width: '100%', display: 'block', textAlign: 'left', padding: '0.6rem 1rem',
                    background: isActive ? 'rgba(99,102,241,0.25)' : 'transparent',
                    border: 'none', borderBottom: i < files.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 500, color: isActive ? '#c4b5fd' : '#e2e8f0' }}>
                    {f.file}
                  </div>
                  {(f.settMonth || f.prescMonth) && (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(180,180,220,0.5)', marginTop: '0.1rem' }}>
                      {f.settMonth  && <span>{fmtMonth(f.settMonth)}(정산)</span>}
                      {f.settMonth && f.prescMonth && <span style={{ margin: '0 0.4rem', opacity: 0.4 }}>·</span>}
                      {f.prescMonth && <span>{fmtMonth(f.prescMonth)}(처방)</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DB 조회 오류 (timeout 등) ── */}
      {fetchError && !loading && (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.6rem', opacity: 0.6 }}>⚠️</div>
          <div style={{ marginBottom: '0.4rem', color: '#fca5a5' }}>데이터 조회 중 오류가 발생했습니다.</div>
          <div style={{ fontSize: '0.78rem', marginBottom: '1rem', opacity: 0.6 }}>
            DB 부하로 인한 일시적 오류일 수 있습니다. 잠시 후 다시 시도해주세요.
          </div>
          <button
            onClick={() => loadFile(selectedFile)}
            style={{
              padding: '0.5rem 1.4rem', fontSize: '0.82rem', fontWeight: 600,
              background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)',
              borderRadius: '8px', color: '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            다시 시도
          </button>
        </div>
      )}

      {/* ── 로딩 스켈레톤 ── */}
      {!fetchError && loading ? (
        <div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {[140, 110, 80, 90].map((w, i) => (
              <div key={i} style={{
                flex: 1, minWidth: '130px', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '0.85rem 1rem',
              }}>
                <div className="skel" style={{ height: '9px', width: `${Math.round(w * 0.58)}px`, marginBottom: '0.5rem' }} />
                <div className="skel" style={{ height: '14px', width: `${Math.round(w * 0.45)}px` }} />
              </div>
            ))}
          </div>
          {[4, 5, 4].map((rowCnt, si) => (
            <div key={si} style={{ ...CARD, marginBottom: '0.75rem' }}>
              <div className="skel" style={{ height: '10px', width: '110px', marginBottom: '0.75rem' }} />
              {Array.from({ length: rowCnt }).map((_, ri) => (
                <div key={ri} style={{
                  display: 'flex', gap: '0.5rem', padding: '0.4rem 0',
                  borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center',
                }}>
                  <div className="skel" style={{ height: '9px', flex: 3 }} />
                  <div className="skel" style={{ height: '9px', flex: 1 }} />
                  <div className="skel" style={{ height: '9px', flex: 1 }} />
                  <div className="skel" style={{ height: '9px', flex: 0.8 }} />
                  <div className="skel" style={{ height: '9px', flex: 0.6 }} />
                </div>
              ))}
            </div>
          ))}
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.5rem', opacity: 0.55 }}>
            정산 데이터를 서버에서 집계하는 중입니다…
          </div>
        </div>
      ) : !fetchError && !aggData ? (
        <div style={{ ...CARD, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          선택한 파일의 정산 데이터가 없습니다.
        </div>
      ) : !fetchError && aggData !== null ? (
        <>
          {/* 인쇄 전용 헤더 */}
          <div className="print-only" style={{ display: 'none', marginBottom: '1rem', borderBottom: '2px solid #333', paddingBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#111' }}>{selectedFile}</h2>
            {selectedMeta && (selectedMeta.settMonth || selectedMeta.prescMonth) && (
              <p style={{ fontSize: '0.82rem', margin: '0.2rem 0 0', color: '#444' }}>
                {selectedMeta.settMonth  && <span>{fmtMonth(selectedMeta.settMonth)} 정산</span>}
                {selectedMeta.settMonth && selectedMeta.prescMonth && <span> · </span>}
                {selectedMeta.prescMonth && <span>{fmtMonth(selectedMeta.prescMonth)} 처방</span>}
              </p>
            )}
          </div>

          {/* 인쇄 버튼 */}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
            <button
              onClick={() => window.print()}
              style={{
                padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '0.03em',
              }}
            >
              인쇄
            </button>
          </div>

          {/* ── 요약 스탯 ── */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <StatCard label="총 처방금액 (천원)" value={fmtChunBig(totalPresc)} color="#a8c4ff" />
            <StatCard label="총 정산액 (천원)"   value={fmtChunBig(totalSett)}  color="#4ade80" />
            <StatCard label="평균 수수료율"       value={fmtPct(avgRate)}        color="#fbbf24" />
            <StatCard label="처방 건수"           value={`${totalCnt.toLocaleString()}건`} />
          </div>

          {/* 종별: L1=기조실병의원구분, L2=종별구분, L3=처방처명, L4=품목명 */}
          {aggData.typeTree.length > 0 && (
            <AccordionTable
              title="🏥 종별 현황"
              tree={aggData.typeTree as unknown as L1[]}
              totalPresc={totalPresc} totalSett={totalSett} totalCnt={totalCnt}
              accentL1="rgba(167,139,250,0.14)"
              accentL2="rgba(167,139,250,0.09)"
              accentL3="rgba(167,139,250,0.04)"
              colorSett="#4ade80" colorRate="#fbbf24"
              l1Label="기조실병의원구분"
            />
          )}

          {/* 담당자별: L1=내부담당자, L2=담당CSO, L3=처방처명, L4=품목명 */}
          {aggData.mgrTree.length > 0 && (
            <AccordionTable
              title="👤 담당자별 현황"
              tree={aggData.mgrTree as unknown as L1[]}
              totalPresc={totalPresc} totalSett={totalSett} totalCnt={totalCnt}
              accentL1="rgba(251,191,36,0.14)"
              accentL2="rgba(251,191,36,0.09)"
              accentL3="rgba(251,191,36,0.04)"
              colorSett="#4ade80" colorRate="#fbbf24"
              l1Label="내부담당자"
            />
          )}

          {/* CSO별: L1=담당CSO, L2=처방처명, L3=품목명 */}
          <AccordionTable
            title="🏢 CSO별 현황"
            tree={aggData.csoTree as unknown as L1[]}
            totalPresc={totalPresc} totalSett={totalSett} totalCnt={totalCnt}
            accentL1="rgba(99,102,241,0.14)"
            accentL2="rgba(99,102,241,0.09)"
            accentL3="rgba(99,102,241,0.04)"
            l1Label="담당CSO"
          />

          {/* 품목별: L1=품목, L2=기조실병의원구분, L3=병원, L4=담당자, L5=CSO */}
          {aggData.productTree.length > 0 && (
            <AccordionTable5
              title="📦 품목별 현황"
              tree={aggData.productTree as unknown as L1_5[]}
              totalPresc={totalPresc} totalSett={totalSett} totalCnt={totalCnt}
              accentL1="rgba(16,185,129,0.14)"
              accentL2="rgba(16,185,129,0.09)"
              accentL3="rgba(16,185,129,0.05)"
              accentL4="rgba(16,185,129,0.02)"
              l1Label="품목" l2Label="기조실병의원구분" l3Label="병원" l4Label="담당자" l5Label="CSO"
            />
          )}
        </>
      ) : null}
    </div>
    </>
  );
}
