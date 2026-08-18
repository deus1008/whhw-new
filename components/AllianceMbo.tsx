'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAllianceMbo, setAllianceTargetGrowth } from '@/app/mbo/actions';
import type { AllianceIndicator } from '@/lib/mbo/alliance';

/* fyMonth(1~12) → 월 라벨(4월~3월) */
const fyLabel = (fm: number) => `${fm <= 9 ? fm + 3 : fm - 9}월`;
const FY_HALVES = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]] as const;
const nf = (n: number) => n.toLocaleString();

function rateColor(r: number) { return r >= 95 ? '#60a5fa' : r >= 85 ? '#fbbf24' : '#f87171'; }
function rateRgb(r: number)   { return r >= 95 ? '96,165,250' : r >= 85 ? '251,191,36' : '248,113,113'; }
function rateLabel(r: number) { return r >= 95 ? '순조' : r >= 85 ? '주의' : '미흡'; }

export default function AllianceMbo({
  memberId, memberName, fyYear, companyId, canEdit, onToast,
}: {
  memberId: string; memberName: string; fyYear: number; companyId: string | null;
  canEdit: boolean; onToast: (m: string) => void;
}) {
  const [inds, setInds]     = useState<AllianceIndicator[]>([]);
  const [target, setTarget] = useState(0);
  const [loading, setLoad]  = useState(false);

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const r = await getAllianceMbo(memberId, memberName, fyYear, companyId);
      setInds(r.indicators); setTarget(r.targetGrowth);
    } catch (e) { console.error('[alliance-mbo]', e); }
    finally { setLoad(false); }
  }, [memberId, memberName, fyYear, companyId]);

  useEffect(() => { load(); }, [load]);

  const valueInds  = inds.filter(i => i.mode === 'value');
  const growthInds = inds.filter(i => i.mode === 'growth');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* 상단 — 목표성장율 일괄 입력 */}
      <TargetGrowthBar
        memberName={memberName} fyYear={fyYear} target={target} canEdit={canEdit}
        onSave={async (pct) => {
          const r = await setAllianceTargetGrowth(memberId, fyYear, pct);
          if (r.error) onToast('⚠ ' + r.error);
          else { onToast('✓ 목표성장율이 저장되었습니다.'); load(); }
        }} />

      {loading && inds.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중…</div>
      ) : inds.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>산출할 데이터가 없습니다.</div>
      ) : (
        <>
          <Section
            title="실적 지표"
            desc={`목표 = 전년 동월 실적 × (1 + 목표성장율 ${nf(target)}%)`}
            inds={valueInds} />
          <Section
            title="성장율 지표"
            desc={`목표 = 목표성장율 ${nf(target)}% · 실적 = 실제 달성 성장율(당기 vs 전년, 입력월 기준) · 거래처·처방처별은 동일 대상 기준`}
            inds={growthInds} />
        </>
      )}
    </div>
  );
}

function TargetGrowthBar({ memberName, fyYear, target, canEdit, onSave }: {
  memberName: string; fyYear: number; target: number; canEdit: boolean; onSave: (pct: number) => void;
}) {
  const [val, setVal] = useState(String(target));
  useEffect(() => { setVal(String(target)); }, [target]);
  const commit = () => {
    const n = Number(val.replace(/[, %]/g, ''));
    if (isNaN(n) || n === target) { setVal(String(target)); return; }
    onSave(Math.round(n * 100) / 100);
  };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap',
      background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)',
      borderRadius: 12, padding: '0.75rem 0.95rem',
    }}>
      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fbbf24' }}>FY{fyYear} 목표성장율</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input value={val} disabled={!canEdit}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ width: 68, textAlign: 'right', padding: '0.3rem 0.5rem', borderRadius: 7,
            background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)',
            color: '#fbbf24', fontSize: '0.95rem', fontWeight: 700, outline: 'none', fontFamily: 'inherit' }} />
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fbbf24' }}>%</span>
      </label>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <b style={{ color: '#a5b4fc' }}>{memberName}</b>의 모든 지표에 일괄 적용 · 실적은 정산·계약 DB 자동 산출(선택 위탁사 기준)
        {!canEdit && ' · (관리자만 수정 가능)'}
      </span>
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

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '0.9rem 1rem' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: ind.scope === 'all' ? '#c4b5fd' : 'var(--text-primary)' }}>
          {ind.label}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ind.unit}</span>

        {isGrowth ? (
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
                    if (rowKind === '목표') return <Cell key={fm} v={m.target} color="#fbbf24" suffix={isGrowth ? '%' : ''} />;
                    if (rowKind === '실적') return <Cell key={fm} v={m.actual} color="#60a5fa" suffix={isGrowth ? '%' : ''} />;
                    const r = isGrowth
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
