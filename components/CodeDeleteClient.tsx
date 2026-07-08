'use client';

import { useState, useEffect, Fragment } from 'react';
import type { CSSProperties } from 'react';
import type { CodeDeleteResult, HospitalTarget } from '@/app/api/code-delete/route';

const THRESHOLD = 200_000;

/* ── 포맷 유틸 ───────────────────────────────────────────── */
const fmt  = (v: number) => Math.round(v).toLocaleString();
const fmtM = (m: string) => (!m || m.length < 6) ? m : `${m.slice(0,4)}.${m.slice(4,6)}`;

function amtColor(v: number) {
  if (v === 0)      return '#4b5563';
  if (v < 50_000)  return '#f87171';
  if (v < 100_000) return '#fb923c';
  if (v < 150_000) return '#fbbf24';
  return '#facc15';
}

/* ── 추이 계산 ───────────────────────────────────────────── */
type TrendInfo = {
  arrow:  '↗' | '↘' | '→';
  pct:    number | null;   // M1 → M3 변화율 (%)
  color:  string;
  label:  string;
};

function calcTrend(months: string[], amounts: Record<string, number>): TrendInfo {
  if (months.length < 2) return { arrow: '→', pct: null, color: 'var(--text-muted)', label: '-' };
  const m1 = amounts[months[0]] ?? 0;
  const mN = amounts[months[months.length - 1]] ?? 0;

  if (m1 === 0 && mN === 0) return { arrow: '→', pct: null, color: '#4b5563', label: '데이터없음' };
  if (m1 === 0 && mN > 0)  return { arrow: '↗', pct: null, color: '#4ade80', label: '신규' };
  if (m1 > 0 && mN === 0)  return { arrow: '↘', pct: null, color: '#f87171', label: '소멸' };

  const pct = Math.round(((mN - m1) / m1) * 100);
  if (pct >=  10) return { arrow: '↗', pct, color: '#4ade80', label: `+${pct}%` };
  if (pct <= -10) return { arrow: '↘', pct, color: '#f87171', label: `${pct}%` };
  return { arrow: '→', pct, color: '#fbbf24', label: `${pct > 0 ? '+' : ''}${pct}%` };
}

/* ── 스파크라인 (SVG 막대) ──────────────────────────────── */
function Sparkline({ months, amounts }: { months: string[]; amounts: Record<string, number> }) {
  const vals = months.map(m => amounts[m] ?? 0);
  const maxVal = Math.max(...vals, 1);
  const W = 54, H = 26, BW = 14, GAP = 6;
  const thresholdY = maxVal > 0 ? H - Math.round((Math.min(THRESHOLD, maxVal) / maxVal) * H) : 0;

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* 기준선 (20만) */}
      {THRESHOLD <= maxVal && (
        <line x1={0} y1={thresholdY} x2={W} y2={thresholdY}
          stroke="rgba(255,255,255,0.22)" strokeDasharray="2,2" strokeWidth={1} />
      )}
      {vals.map((v, i) => {
        const barH = maxVal > 0 ? Math.max(Math.round((v / maxVal) * H), v > 0 ? 2 : 0) : 0;
        const x = i * (BW + GAP);
        return (
          <g key={i}>
            <rect x={x} y={H - barH} width={BW} height={barH} rx={2}
              fill={amtColor(v)} opacity={v > 0 ? 0.88 : 0.2} />
            {/* 0인 경우 바닥 표시 */}
            {v === 0 && <rect x={x} y={H - 2} width={BW} height={2} rx={1} fill="#4b5563" opacity={0.4} />}
          </g>
        );
      })}
    </svg>
  );
}

/* ── 계층 구조 ───────────────────────────────────────────── */
type SalesRepGroup = { name: string; csos: CsoGroup[]; count: number };
type CsoGroup      = { name: string; hospitals: HospitalTarget[] };

function buildHierarchy(targets: HospitalTarget[]): SalesRepGroup[] {
  const repMap = new Map<string, Map<string, HospitalTarget[]>>();
  for (const t of targets) {
    if (!repMap.has(t.salesRep)) repMap.set(t.salesRep, new Map());
    const csoMap = repMap.get(t.salesRep)!;
    if (!csoMap.has(t.csoName)) csoMap.set(t.csoName, []);
    csoMap.get(t.csoName)!.push(t);
  }
  const result: SalesRepGroup[] = [];
  for (const [rep, csoMap] of repMap) {
    const csos: CsoGroup[] = [];
    for (const [cso, hosps] of csoMap) {
      csos.push({ name: cso, hospitals: hosps.sort((a, b) => a.avgAmount - b.avgAmount) });
    }
    csos.sort((a, b) => a.name.localeCompare(b.name));
    result.push({ name: rep, csos, count: csos.reduce((s, c) => s + c.hospitals.length, 0) });
  }
  return result.sort((a, b) => b.count - a.count);
}

function filterHierarchy(groups: SalesRepGroup[], kw: string): SalesRepGroup[] {
  if (!kw) return groups;
  const k = kw.toLowerCase();
  return groups.map(g => {
    const csos = g.csos.map(c => ({
      ...c,
      hospitals: c.hospitals.filter(h =>
        h.hospitalName.toLowerCase().includes(k) ||
        h.csoName.toLowerCase().includes(k) ||
        h.salesRep.toLowerCase().includes(k)
      ),
    })).filter(c =>
      c.hospitals.length > 0 ||
      c.name.toLowerCase().includes(k) ||
      g.name.toLowerCase().includes(k)
    );
    return { ...g, csos, count: csos.reduce((s, c) => s + c.hospitals.length, 0) };
  }).filter(g => g.count > 0 || g.name.toLowerCase().includes(k));
}

/* ════════════════════════════════════════════════════════════ */
export default function CodeDeleteClient() {
  const [result,   setResult]   = useState<CodeDeleteResult | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [openReps, setOpenReps] = useState<Set<string>>(new Set());
  const [openCsos, setOpenCsos] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/code-delete')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setResult(d);
        setOpenReps(new Set<string>(d.targets.map((t: HospitalTarget) => t.salesRep)));
      })
      .catch(() => setError('데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>⏳</div>
      <p style={{ fontSize: '0.88rem' }}>데이터를 분석하는 중입니다…</p>
    </div>
  );
  if (error) return (
    <div style={{ textAlign: 'center', padding: '3rem', color: '#f87171', background: 'rgba(239,68,68,0.07)', borderRadius: 14, border: '1px solid rgba(239,68,68,0.18)', fontSize: '0.85rem' }}>
      ⚠ {error}
    </div>
  );
  if (!result) return null;
  if (result.months.length === 0) return (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
      <p>분석할 처방실적 데이터가 없습니다.</p>
      <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>문서관리 &gt; EDI 폴더에 파일을 업로드하고 분석을 실행해주세요.</p>
    </div>
  );

  const hierarchy    = buildHierarchy(result.targets);
  const filtered     = filterHierarchy(hierarchy, search);
  const totalCount   = result.targets.length;
  const visibleCount = filtered.reduce((s, g) => s + g.count, 0);

  // 추이 통계
  const trendStats = result.targets.reduce((acc, t) => {
    const tr = calcTrend(result.months, t.monthlyAmounts);
    acc[tr.arrow] = (acc[tr.arrow] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* ── 요약 카드 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: '0.7rem' }}>
        <SummaryCard label="분석 기간" value={result.months.map(fmtM).join(' ~ ')} sub="최근 3개월 EDI 데이터" color="#93c5fd" />
        <SummaryCard label="삭제대상 처방처" value={`${totalCount.toLocaleString()}개`} sub="월평균 20만원 미만" color="#f87171" />
        <SummaryCard label="↗ 개선 추이" value={`${(trendStats['↗'] ?? 0)}개`} sub="M1→M3 10%↑ 이상" color="#4ade80" />
        <SummaryCard label="↘ 악화 추이" value={`${(trendStats['↘'] ?? 0)}개`} sub="M1→M3 10%↓ 이상" color="#f87171" />
      </div>

      {/* ── 검색 + 범례 ── */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 담당자 / CSO / 처방처 검색…"
          style={{
            flex: 1, minWidth: 180, padding: '0.45rem 0.85rem', borderRadius: 9,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-primary)', fontSize: '0.83rem', fontFamily: 'inherit', outline: 'none',
          }}
        />
        <TrendLegend />
        {search && <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>검색결과 {visibleCount}개</span>}
      </div>

      {/* ── 안내 바 ── */}
      <div style={{
        padding: '0.5rem 1rem', borderRadius: 9,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        fontSize: '0.73rem', color: 'var(--text-muted)',
        display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span>📊 처방처별 월합계 기준 · 없는 달은 0으로 처리</span>
        <span>점선(--) = 20만원 기준선</span>
        <span style={{ marginLeft: 'auto' }}>
          {result.months.map((m, i) => (
            <span key={m}>{i > 0 && ' → '}<strong style={{ color: '#c4b5fd' }}>{fmtM(m)}</strong></span>
          ))}
        </span>
      </div>

      {/* ── 드릴다운 ── */}
      {filtered.length === 0
        ? <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>검색 결과가 없습니다.</div>
        : filtered.map(rep => {
          const repOpen = openReps.has(rep.name);
          return (
            <div key={rep.name} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>

              {/* 담당자 헤더 */}
              <div onClick={() => setOpenReps(p => { const n = new Set(p); n.has(rep.name) ? n.delete(rep.name) : n.add(rep.name); return n; })}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.1rem', cursor: 'pointer', background: 'rgba(168,85,247,0.10)', borderBottom: repOpen ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '0.58rem', color: '#d8b4fe' }}>{repOpen ? '▼' : '▶'}</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#d8b4fe' }}>👤 {rep.name}</span>
                  <Chip count={rep.count} />
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CSO {rep.csos.length}개</span>
              </div>

              {repOpen && rep.csos.map(cso => {
                const csoKey  = `${rep.name}||${cso.name}`;
                const csoOpen = openCsos.has(csoKey);
                return (
                  <Fragment key={cso.name}>
                    {/* CSO 헤더 */}
                    <div onClick={() => setOpenCsos(p => { const n = new Set(p); n.has(csoKey) ? n.delete(csoKey) : n.add(csoKey); return n; })}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 1.1rem 0.55rem 2rem', cursor: 'pointer', background: 'rgba(52,211,153,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.58rem', color: '#6ee7b7' }}>{csoOpen ? '▼' : '▶'}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6ee7b7' }}>🏢 {cso.name}</span>
                        <Chip count={cso.hospitals.length} />
                      </div>
                    </div>

                    {/* 처방처 테이블 */}
                    {csoOpen && (
                      <div style={{ overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 560 }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.025)' }}>
                              <th style={TH('left', '2.5rem')}>처방처명</th>
                              {result.months.map((m, mi) => (
                                <th key={m} style={TH('right')}>
                                  {fmtM(m)}
                                  {mi < result.months.length - 1 && <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: '0.2rem' }}>→</span>}
                                </th>
                              ))}
                              <th style={TH('center')}>추이</th>
                              <th style={TH('center')}>월별차트</th>
                              <th style={TH('right')}>3개월 평균</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cso.hospitals.map((h, hi) => {
                              const tr = calcTrend(result.months, h.monthlyAmounts);
                              return (
                                <tr key={h.hospitalName} style={{ background: hi % 2 ? 'rgba(255,255,255,0.01)' : undefined, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                  {/* 처방처명 */}
                                  <td style={{ ...TD('left'), paddingLeft: '2.5rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.hospitalName}>
                                    {h.hospitalName}
                                  </td>

                                  {/* 월별 금액 + 인라인 미니바 */}
                                  {result.months.map((m, mi) => {
                                    const amt  = h.monthlyAmounts[m] ?? 0;
                                    const prev = mi > 0 ? (h.monthlyAmounts[result.months[mi - 1]] ?? 0) : amt;
                                    const diff = prev > 0 ? amt - prev : 0;
                                    const pct  = Math.min((amt / THRESHOLD) * 100, 100);
                                    return (
                                      <td key={m} style={{ ...TD('right'), verticalAlign: 'top', paddingTop: '0.5rem', paddingBottom: '0.4rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', minWidth: 72 }}>
                                          <span style={{ fontWeight: amt > 0 ? 600 : undefined, color: amt === 0 ? 'rgba(255,255,255,0.2)' : 'var(--text-primary)' }}>
                                            {amt === 0 ? '—' : fmt(amt)}
                                          </span>
                                          {/* 미니 가로 막대 */}
                                          <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: amtColor(amt) }} />
                                          </div>
                                          {/* M1 이후 전월 대비 증감 */}
                                          {mi > 0 && diff !== 0 && (
                                            <span style={{ fontSize: '0.62rem', color: diff > 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                                              {diff > 0 ? '▲' : '▼'}{fmt(Math.abs(diff))}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}

                                  {/* 추이 배지 */}
                                  <td style={{ ...TD('center'), minWidth: 56 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                                      <span style={{ fontSize: '1rem', lineHeight: 1, color: tr.color }}>{tr.arrow}</span>
                                      <span style={{ fontSize: '0.63rem', fontWeight: 600, color: tr.color }}>{tr.label}</span>
                                    </div>
                                  </td>

                                  {/* 스파크라인 */}
                                  <td style={{ ...TD('center'), minWidth: 72 }}>
                                    <Sparkline months={result.months} amounts={h.monthlyAmounts} />
                                  </td>

                                  {/* 3개월 평균 바 */}
                                  <td style={{ ...TD('right'), minWidth: 130, paddingRight: '0.9rem' }}>
                                    <AvgBar avg={h.avgAmount} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          );
        })
      }
    </div>
  );
}

/* ── 공용 컴포넌트들 ─────────────────────────────────────── */

function AvgBar({ avg }: { avg: number }) {
  const pct = Math.min((avg / THRESHOLD) * 100, 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: amtColor(avg) }} />
      </div>
      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: amtColor(avg), minWidth: 58, textAlign: 'right' }}>
        {fmt(avg)}
      </span>
    </div>
  );
}

function Chip({ count }: { count: number }) {
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.08rem 0.45rem', borderRadius: 20, background: 'rgba(248,113,113,0.13)', color: '#f87171' }}>
      {count}개
    </span>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.85rem 1rem' }}>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 0.25rem' }}>{label}</p>
      <p style={{ fontSize: '1.1rem', fontWeight: 700, color, margin: '0 0 0.15rem' }}>{value}</p>
      <p style={{ fontSize: '0.67rem', color: 'var(--text-muted)', margin: 0 }}>{sub}</p>
    </div>
  );
}

function TrendLegend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexShrink: 0, fontSize: '0.7rem' }}>
      <span style={{ color: '#4ade80' }}>↗ 개선</span>
      <span style={{ color: '#fbbf24' }}>→ 유지</span>
      <span style={{ color: '#f87171' }}>↘ 악화</span>
      <span style={{ color: 'var(--text-muted)', marginLeft: '0.2rem' }}>/ M1→M3 기준</span>
    </div>
  );
}

function TH(align: 'left' | 'right' | 'center', paddingLeft?: string): CSSProperties {
  return {
    padding: '0.4rem 0.65rem', textAlign: align,
    color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(255,255,255,0.09)',
    fontSize: '0.72rem',
    ...(paddingLeft ? { paddingLeft } : {}),
  };
}

function TD(align: 'left' | 'right' | 'center'): CSSProperties {
  return { padding: '0.45rem 0.65rem', textAlign: align, color: 'var(--text-primary)', whiteSpace: 'nowrap' };
}
