'use client';

import { useState } from 'react';
import type { AllianceIndicator } from '@/lib/mbo/alliance';

/* fyMonth(1~12) → 월 라벨(4월~3월) */
const fyLabel = (fm: number) => `${fm <= 9 ? fm + 3 : fm - 9}월`;
const FY_HALVES = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]] as const;
const nf = (n: number) => n.toLocaleString();

function rateColor(r: number) { return r >= 95 ? '#60a5fa' : r >= 85 ? '#fbbf24' : '#f87171'; }
function rateRgb(r: number)   { return r >= 95 ? '96,165,250' : r >= 85 ? '251,191,36' : '248,113,113'; }
function rateLabel(r: number) { return r >= 95 ? '순조' : r >= 85 ? '주의' : '미흡'; }

export default function AllianceMbo({
  memberName, fyYear, target, commTarget, inds, loading, onSearch,
}: {
  memberName: string; fyYear: number; target: number; commTarget: number;
  inds: AllianceIndicator[] | null; loading: boolean; onSearch: () => void;
}) {
  // 미검색 상태
  if (inds === null && !loading) {
    return (
      <div style={{ padding: '2.2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p style={{ fontSize: '1.6rem', margin: 0 }}>🔍</p>
        <p style={{ fontSize: '0.86rem', margin: '0.5rem 0 0.9rem' }}>
          <b style={{ color: '#a5b4fc' }}>{memberName}</b> · FY{fyYear} · 목표성장율 <b style={{ color: '#fbbf24' }}>{nf(target)}%</b> · 목표수수료율 <b style={{ color: '#34d399' }}>{nf(commTarget)}%</b>
        </p>
        <button onClick={onSearch}
          style={{ padding: '0.45rem 1.3rem', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit' }}>
          🔍 검색하여 지표 산출
        </button>
      </div>
    );
  }
  if (loading && inds === null) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중…</div>;
  }
  if (!inds || inds.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>산출할 데이터가 없습니다.</div>;
  }

  const valueInds  = inds.filter(i => i.mode === 'value');
  const rateInds   = inds.filter(i => i.mode === 'rate');
  const growthInds = inds.filter(i => i.mode === 'growth');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', opacity: loading ? 0.55 : 1, transition: 'opacity .15s' }}>
      <Section
        title="실적 지표"
        desc={`목표 = 전년 동월 실적 × (1 + 목표성장율 ${nf(target)}%) · 실적은 처방(EDI)·정산 DB 자동 산출`}
        inds={valueInds} />
      <Section
        title="수수료율 지표"
        desc={`수수료율 = 정산액 ÷ 처방액 · 목표수수료율 ${nf(commTarget)}% 이하 관리(낮을수록 우수 = 이익↑) · 달성률 = 목표 ÷ 실제`}
        inds={rateInds} />
      <Section
        title="성장율 지표"
        desc={`목표 = 목표성장율 ${nf(target)}% · 실적 = 실제 달성 성장율(당기 vs 전년, 입력월 기준) · 거래처·처방처별은 동일 대상 기준`}
        inds={growthInds} />
    </div>
  );
}

function Section({ title, desc, inds }: { title: string; desc: string; inds: AllianceIndicator[] }) {
  if (inds.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      {inds.map(ind => <IndicatorCard key={ind.storeKey} ind={ind} />)}
    </div>
  );
}

function IndicatorCard({ ind }: { ind: AllianceIndicator }) {
  const [open, setOpen] = useState(false);
  const isGrowth = ind.mode === 'growth';
  const isRate   = ind.mode === 'rate';

  // value: 실적 발생 월까지 누적목표 대비 실적. growth: 성장율 산출월(actual≠null)의 원자료 누적.
  const active  = ind.months.filter(m => (m.actual ?? 0) !== 0);
  const sumA    = active.reduce((s, m) => s + (m.actual ?? 0), 0);
  const sumT    = active.reduce((s, m) => s + (m.target ?? 0), 0);
  const rate    = sumT > 0 ? Math.round((sumA / sumT) * 100) : null;
  const annualT = ind.months.reduce((s, m) => s + (m.target ?? 0), 0);

  const gActive = ind.months.filter(m => m.actual !== null);
  const gCur    = gActive.reduce((s, m) => s + (m.curRaw ?? 0), 0);
  const gPrev   = gActive.reduce((s, m) => s + (m.prevRaw ?? 0), 0);
  const gActual = gPrev > 0 ? Math.round(((gCur - gPrev) / gPrev) * 1000) / 10 : null; // 달성 성장율%
  const gRate   = gActual !== null && ind.growthPct > 0 ? Math.round((gActual / ind.growthPct) * 100) : null;

  // rate: 수수료율 = Σ정산액 / Σ처방액 (정산 완료월만). 달성률 = 목표 ÷ 실제(낮을수록 우수 → 100% 이상 우수).
  const rActive = ind.months.filter(m => (m.curRaw ?? 0) > 0 && (m.prevRaw ?? 0) > 0);
  const rSettle = rActive.reduce((s, m) => s + (m.curRaw ?? 0), 0);
  const rPresc  = rActive.reduce((s, m) => s + (m.prevRaw ?? 0), 0);
  const rActual = rPresc > 0 ? Math.round((rSettle / rPresc) * 1000) / 10 : null; // 실제 수수료율%
  const rRate   = rActual !== null && rActual > 0 && ind.growthPct > 0 ? Math.round((ind.growthPct / rActual) * 100) : null;

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '0.9rem 1rem' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: ind.scope === 'all' ? '#c4b5fd' : 'var(--text-primary)' }}>
          {ind.label}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ind.unit}</span>

        {isRate ? (
          <>
            <span style={{ fontSize: '0.72rem', color: '#34d399', padding: '0.1rem 0.5rem', borderRadius: 5, background: 'rgba(52,211,153,0.1)' }}>
              목표 {nf(ind.growthPct)}% 이하
            </span>
            <span style={{ fontSize: '0.72rem', color: '#60a5fa', padding: '0.1rem 0.5rem', borderRadius: 5, background: 'rgba(96,165,250,0.1)' }}>
              실제 {rActual === null ? '-' : `${nf(rActual)}%`}
            </span>
            {rRate !== null && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: rateColor(rRate), padding: '0.1rem 0.5rem', borderRadius: 5, background: `rgba(${rateRgb(rRate)},0.12)` }}>
                {rRate}% <span style={{ fontSize: '0.64rem' }}>{rateLabel(rRate)}</span>
              </span>
            )}
          </>
        ) : isGrowth ? (
          <>
            <span style={{ fontSize: '0.72rem', color: '#fbbf24', padding: '0.1rem 0.5rem', borderRadius: 5, background: 'rgba(251,191,36,0.1)' }}>
              목표 성장 {nf(ind.growthPct)}%
            </span>
            <span style={{ fontSize: '0.72rem', color: '#60a5fa', padding: '0.1rem 0.5rem', borderRadius: 5, background: 'rgba(96,165,250,0.1)' }}>
              달성 성장 {gActual === null ? '-' : `${nf(gActual)}%`}
            </span>
            {gRate !== null && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: rateColor(gRate), padding: '0.1rem 0.5rem', borderRadius: 5, background: `rgba(${rateRgb(gRate)},0.12)` }}>
                {gRate}% <span style={{ fontSize: '0.64rem' }}>{rateLabel(gRate)}</span>
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: '0.72rem', color: '#fbbf24', padding: '0.1rem 0.5rem', borderRadius: 5, background: 'rgba(251,191,36,0.1)' }}>
              목표 누적 {nf(sumT)}<span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>· 연간 {nf(annualT)}</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: '#60a5fa', padding: '0.1rem 0.5rem', borderRadius: 5, background: 'rgba(96,165,250,0.1)' }}>
              실적 누적 {nf(sumA)}
            </span>
            {rate !== null && (
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: rateColor(rate), padding: '0.1rem 0.5rem', borderRadius: 5, background: `rgba(${rateRgb(rate)},0.12)` }}>
                {rate}% <span style={{ fontSize: '0.64rem' }}>{rateLabel(rate)}</span>
              </span>
            )}
          </>
        )}

        <button onClick={() => setOpen(o => !o)}
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.6rem', fontFamily: 'inherit' }}>
          {open ? '▲ 월별 접기' : '▼ 월별 보기'}
        </button>
      </div>

      {/* 월별 그리드 */}
      {open && (
        <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {FY_HALVES.map((half, hi) => (
            <div key={hi}>
              <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(6, 1fr)', gap: '0.3rem', marginBottom: '0.2rem' }}>
                <div />
                {half.map(fm => <div key={fm} style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{fyLabel(fm)}</div>)}
              </div>
              {(['목표', '실적', '달성률'] as const).map(rowKind => (
                <div key={rowKind} style={{ display: 'grid', gridTemplateColumns: '44px repeat(6, 1fr)', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 600, display: 'flex', alignItems: 'center',
                    color: rowKind === '목표' ? '#fbbf24' : rowKind === '실적' ? '#60a5fa' : 'var(--text-muted)' }}>{rowKind}</div>
                  {half.map(fm => {
                    const m = ind.months.find(x => x.fyMonth === fm)!;
                    const pct = isGrowth || isRate;
                    if (rowKind === '목표') return <Cell key={fm} v={m.target} color={isRate ? '#34d399' : '#fbbf24'} suffix={pct ? '%' : ''} />;
                    if (rowKind === '실적') return <Cell key={fm} v={m.actual} color="#60a5fa" suffix={pct ? '%' : ''} />;
                    const r = isRate
                      ? ((m.target ?? 0) > 0 && (m.actual ?? 0) > 0 ? Math.round(((m.target ?? 0) / (m.actual ?? 1)) * 100) : null)
                      : isGrowth
                      ? ((m.target ?? 0) > 0 && m.actual !== null ? Math.round((m.actual / (m.target ?? 1)) * 100) : null)
                      : ((m.target ?? 0) > 0 && (m.actual ?? 0) !== 0 ? Math.round(((m.actual ?? 0) / (m.target ?? 1)) * 100) : null);
                    return (
                      <div key={fm} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', height: 26, borderRadius: 6,
                        fontSize: '0.7rem', fontWeight: 700,
                        background: r === null ? 'transparent' : `rgba(${rateRgb(r)},0.12)`,
                        color: r === null ? 'var(--text-muted)' : rateColor(r),
                        border: r === null ? '1px solid rgba(255,255,255,0.05)' : `1px solid rgba(${rateRgb(r)},0.25)`,
                      }}>{r === null ? '-' : `${r}%`}</div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({ v, color, suffix = '' }: { v: number | null; color: string; suffix?: string }) {
  const has = v !== null && v !== 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 26, borderRadius: 6, padding: '0 0.4rem',
      fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums',
      background: has ? 'rgba(255,255,255,0.03)' : 'transparent',
      border: '1px solid rgba(255,255,255,0.06)',
      color: has ? color : 'var(--text-muted)',
    }}>{v === null ? '-' : `${nf(v)}${suffix}`}</div>
  );
}
