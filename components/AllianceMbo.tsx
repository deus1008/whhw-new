'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAllianceMbo, setAllianceGrowth } from '@/app/mbo/actions';
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
  const [loading, setLoad]  = useState(false);

  const load = useCallback(async () => {
    setLoad(true);
    try { setInds(await getAllianceMbo(memberId, memberName, fyYear, companyId)); }
    catch (e) { console.error('[alliance-mbo]', e); }
    finally { setLoad(false); }
  }, [memberId, memberName, fyYear, companyId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <b style={{ color: '#a5b4fc' }}>{memberName}</b> · 실적은 정산·계약 DB에서 자동 산출(선택 위탁사 기준),
        목표는 <b style={{ color: '#fbbf24' }}>평균 성장율(%)</b>만 입력하면 <b>전년 동월 실적 × (1+성장율)</b>로 자동 계산됩니다.
      </div>
      {loading && inds.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>불러오는 중…</div>
      ) : inds.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>산출할 데이터가 없습니다.</div>
      ) : (
        inds.map(ind => (
          <IndicatorCard key={ind.storeKey} ind={ind} canEdit={canEdit}
            onSaveGrowth={async (pct) => {
              const r = await setAllianceGrowth(memberId, fyYear, ind.storeKey, pct);
              if (r.error) onToast('⚠ ' + r.error);
              else { onToast('✓ 성장율이 저장되었습니다.'); load(); }
            }} />
        ))
      )}
    </div>
  );
}

function IndicatorCard({ ind, canEdit, onSaveGrowth }: {
  ind: AllianceIndicator; canEdit: boolean; onSaveGrowth: (pct: number) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [growth, setGrowth] = useState(String(ind.growthPct));
  useEffect(() => { setGrowth(String(ind.growthPct)); }, [ind.growthPct]);

  // 실적이 발생한 월(actual ≠ 0)까지의 누적목표 대비 실적으로 달성률 산정
  const active = ind.months.filter(m => (m.actual ?? 0) !== 0);
  const sumA = active.reduce((s, m) => s + (m.actual ?? 0), 0);
  const sumT = active.reduce((s, m) => s + (m.target ?? 0), 0);
  const rate = sumT > 0 ? Math.round((sumA / sumT) * 100) : null;
  const annualT = ind.months.reduce((s, m) => s + (m.target ?? 0), 0);

  const commitGrowth = () => {
    const n = Number(growth.replace(/[, %]/g, ''));
    if (isNaN(n) || n === ind.growthPct) { setGrowth(String(ind.growthPct)); return; }
    onSaveGrowth(Math.round(n * 100) / 100);
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '0.9rem 1rem' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: ind.scope === 'all' ? '#c4b5fd' : 'var(--text-primary)' }}>
          {ind.label}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ind.unit}</span>

        {/* 성장율 입력 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#fbbf24' }}>
          평균 성장율
          <input value={growth} disabled={!canEdit}
            onChange={e => setGrowth(e.target.value)}
            onBlur={commitGrowth}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ width: 56, textAlign: 'right', padding: '0.2rem 0.4rem', borderRadius: 6,
              background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)',
              color: '#fbbf24', fontSize: '0.76rem', outline: 'none', fontFamily: 'inherit' }} />
          %
        </label>

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
                    if (rowKind === '목표') return <Cell key={fm} v={m.target} color="#fbbf24" />;
                    if (rowKind === '실적') return <Cell key={fm} v={m.actual} color="#60a5fa" />;
                    const r = (m.target ?? 0) > 0 && (m.actual ?? 0) !== 0 ? Math.round(((m.actual ?? 0) / (m.target ?? 1)) * 100) : null;
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

function Cell({ v, color }: { v: number | null; color: string }) {
  const has = v !== null && v !== 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', height: 26, borderRadius: 6, padding: '0 0.4rem',
      fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums',
      background: has ? 'rgba(255,255,255,0.03)' : 'transparent',
      border: '1px solid rgba(255,255,255,0.06)',
      color: has ? color : 'var(--text-muted)',
    }}>{v === null ? '-' : nf(v)}</div>
  );
}
