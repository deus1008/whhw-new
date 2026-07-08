'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ManagerRow, CsoRow, TrendRow, HospTypeRow,
  MonthDataResult, MboTarget,
} from '@/app/monthly-report/actions';
import type { BrandGroup } from '@/app/monthly-report/constants';

/* ── 스타일 상수 ─────────────────────────────────────────────── */
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '14px',
  padding: '1.25rem 1.5rem',
  marginBottom: '1.5rem',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: '1rem',
  letterSpacing: '-0.01em',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.85rem',
};

const th: React.CSSProperties = {
  padding: '0.45rem 0.6rem',
  textAlign: 'right',
  color: 'var(--text-muted)',
  fontSize: '0.78rem',
  fontWeight: 500,
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  whiteSpace: 'nowrap',
};

const thLeft: React.CSSProperties = { ...th, textAlign: 'left' };

const td: React.CSSProperties = {
  padding: '0.45rem 0.6rem',
  textAlign: 'right',
  color: 'var(--text-primary)',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  verticalAlign: 'middle',
};

const tdLeft: React.CSSProperties = { ...td, textAlign: 'left' };

/* ── 유틸 ─────────────────────────────────────────────────────── */
function fmt억(won: number): string {
  const eok = won / 100_000_000;
  if (eok === 0) return '0';
  if (eok < 1) return (won / 1_000_000).toFixed(1) + 'M';
  if (eok < 10) return eok.toFixed(1) + '억';
  return Math.round(eok).toLocaleString('ko-KR') + '억';
}

function fmt백만(won: number): string {
  const m = won / 1_000_000;
  if (m === 0) return '0';
  if (m < 1) return m.toFixed(1);
  if (m < 10) return m.toFixed(1);
  return Math.round(m).toLocaleString('ko-KR');
}

function fmtPct(v: number | null): string {
  if (v == null) return '-';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function pctColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)';
  if (v >= 5) return '#4ade80';
  if (v >= 0) return '#86efac';
  if (v >= -5) return '#fca5a5';
  return '#ef4444';
}

function monthLabel(m: string): string {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return `${y}년 ${parseInt(mo)}월`;
}

function periodLabel(months: string[]): string {
  if (months.length === 0) return '';
  const sorted = [...months].sort();
  if (months.length === 1) return monthLabel(sorted[0]);
  const [sy, sm] = sorted[0].split('-');
  const [ey, em] = sorted[sorted.length - 1].split('-');
  if (sy === ey) return `${sy}년 ${parseInt(sm)}~${parseInt(em)}월`;
  return `${monthLabel(sorted[0])} ~ ${monthLabel(sorted[sorted.length - 1])}`;
}

function shortMonth(m: string): string {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return `${y.slice(2)}.${mo}`;
}

/* ── 매니저 색상 ─────────────────────────────────────────────── */
const MGR_COLORS: Record<string, string> = {
  '박동수': '#60a5fa',
  '김윤성': '#34d399',
  '임경봉': '#fbbf24',
  '김양희': '#f472b6',
  '이정원': '#a78bfa',
  '이훈섭': '#fb923c',
};

function mgrColor(name: string): string {
  return MGR_COLORS[name] ?? '#94a3b8';
}

/* ── SVG 라인 차트 ───────────────────────────────────────────── */
function LineChart({
  series, periods, unit = '백만',
}: {
  series: { name: string; color: string; values: (number | null)[] }[];
  periods: string[];
  unit?: string;
}) {
  const W = 660, H = 220, PAD_L = 62, PAD_B = 40, PAD_T = 16, PAD_R = 20;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const allVals = series.flatMap(s => s.values).filter((v): v is number => v != null && v > 0);
  const maxVal  = Math.max(...allVals, 1);

  const n   = periods.length;
  const xOf = (i: number) => n <= 1 ? PAD_L + chartW / 2 : PAD_L + (chartW / (n - 1)) * i;
  const yOf = (v: number) => PAD_T + chartH * (1 - v / maxVal);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = PAD_T + chartH * (1 - t);
        return (
          <g key={t}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
              stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            {t > 0 && (
              <text x={PAD_L - 5} y={y + 4} textAnchor="end"
                fontSize={9} fill="rgba(255,255,255,0.4)">
                {unit === '억' ? fmt억(maxVal * t) : fmt백만(maxVal * t)}
              </text>
            )}
          </g>
        );
      })}

      {periods.map((p, i) => {
        const x = xOf(i);
        const label = shortMonth(p);
        const thisYear = p.slice(0, 4);
        const yearChanged = i > 0 && periods[i - 1].slice(0, 4) !== thisYear;
        return (
          <g key={p}>
            <text x={x} y={H - PAD_B + 13} textAnchor="middle"
              fontSize={8.5} fill="rgba(255,255,255,0.45)">
              {label}
            </text>
            {yearChanged && (
              <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + chartH}
                stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="3,3" />
            )}
          </g>
        );
      })}

      {series.map(s => {
        let d = '';
        let gap = true;
        s.values.forEach((v, i) => {
          if (v == null || v === 0) { gap = true; return; }
          const cmd = gap ? 'M' : 'L';
          d += `${cmd}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)} `;
          gap = false;
        });
        return (
          <g key={s.name}>
            {d && <path d={d.trim()} fill="none" stroke={s.color} strokeWidth={2.2}
              strokeLinejoin="round" strokeLinecap="round" />}
            {s.values.map((v, i) => v != null && v > 0 ? (
              <circle key={i} cx={xOf(i)} cy={yOf(v)} r={3.5}
                fill={s.color} stroke="rgba(12,12,28,0.9)" strokeWidth={1.2} />
            ) : null)}
          </g>
        );
      })}

      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + chartH}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      <line x1={PAD_L} y1={PAD_T + chartH} x2={W - PAD_R} y2={PAD_T + chartH}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
    </svg>
  );
}

/* ── 범례 ─────────────────────────────────────────────────────── */
function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
      {items.map(item => (
        <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ── 퍼센트 바 ───────────────────────────────────────────────── */
function PctBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 6, width: '100%', minWidth: 60 }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: color, transition: 'width 0.3s' }} />
    </div>
  );
}

/* ── 탭 버튼 ─────────────────────────────────────────────────── */
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.45rem 0.9rem',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '0.82rem',
        fontWeight: active ? 600 : 400,
        background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────────── */
type Props = {
  initialMonths: string[];
  monthData: MonthDataResult;
  ubistData: {
    periods: string[];
    brandData: Record<string, Record<string, number>>;
    newProductData: Record<string, Record<string, number>>;
  };
  brandGroups: BrandGroup[];
  newProducts: BrandGroup[];
  mboTargets: MboTarget[];
  isAdmin: boolean;
};

export default function MonthlyReportClient({
  initialMonths,
  monthData,
  ubistData,
  brandGroups,
  newProducts,
  mboTargets,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeSection, setActiveSection] = useState<string>('실적');
  const [selectedMonths, setSelectedMonths] = useState<string[]>(initialMonths);

  const isSingle = selectedMonths.length === 1;

  function toggleMonth(m: string) {
    let next: string[];
    if (selectedMonths.includes(m)) {
      if (selectedMonths.length === 1) return; // 최소 1개 유지
      next = selectedMonths.filter(x => x !== m);
    } else {
      next = [...selectedMonths, m];
    }
    next = next.sort().reverse();
    setSelectedMonths(next);
    startTransition(() => {
      router.push(`/monthly-report?months=${next.join(',')}`);
    });
  }

  const {
    available_months,
    by_manager,
    by_cso,
    by_hosp_type,
    trend,
    grand_total,
    prev_grand_total,
  } = monthData;

  const grandChangePct = prev_grand_total > 0
    ? ((grand_total - prev_grand_total) / prev_grand_total) * 100
    : null;

  // MBO 목표 맵 (manager → 백만원 단위 월 목표)
  const mboMap: Record<string, number> = {};
  for (const t of mboTargets) mboMap[t.manager] = t.monthly_target;

  // 이욱환 (부문 전체 목표): 백만원 → 원
  const totalTarget = (mboMap['이욱환'] ?? 0) * 1_000_000;
  const totalAchievePct = totalTarget > 0 ? (grand_total / totalTarget) * 100 : null;

  const maxMgrAmount = Math.max(...by_manager.map(r => r.total_amount), 1);

  // 트렌드 데이터 구성
  const trendMonths = [...new Set(trend.map(r => r.prescription_month))].sort();
  const managers = [...new Set(by_manager.map(r => r.manager))];

  const trendSeries = managers.map(mgr => ({
    name: mgr,
    color: mgrColor(mgr),
    values: trendMonths.map(m => {
      const row = trend.find(r => r.manager === mgr && r.prescription_month === m);
      return row ? row.total_amount : null;
    }),
  }));

  // 가동처: 종별 집계
  const hospTypes = [...new Set(by_hosp_type.map(r => r.hospital_type))].sort();
  const mgrHospMap: Record<string, Record<string, number>> = {};
  for (const r of by_hosp_type) {
    if (!mgrHospMap[r.manager]) mgrHospMap[r.manager] = {};
    mgrHospMap[r.manager][r.hospital_type] = r.hospital_cnt;
  }

  // CSO: 담당자별 TOP5
  const csoByMgr: Record<string, CsoRow[]> = {};
  for (const r of by_cso) {
    if (!csoByMgr[r.manager]) csoByMgr[r.manager] = [];
    csoByMgr[r.manager].push(r);
  }

  // 브랜드 차트 데이터
  const brandPeriods = ubistData.periods;
  const brandSeries = brandGroups.map(g => ({
    name: g.name,
    color: g.color,
    values: brandPeriods.map(p => ubistData.brandData[g.name]?.[p] ?? null),
  }));

  // 신제품 차트 데이터
  const allNewProdPeriods = [...new Set(
    newProducts.flatMap(g => Object.keys(ubistData.newProductData[g.name] ?? {}))
  )].sort();
  const newProdSeries = newProducts.map(g => ({
    name: g.name,
    color: g.color,
    values: allNewProdPeriods.map(p => ubistData.newProductData[g.name]?.[p] ?? null),
  })).filter(s => s.values.some(v => v != null && v > 0));

  const SECTIONS = ['실적', '트렌드', ...(by_hosp_type.length > 0 ? ['가동처'] : []), 'CSO', '브랜드', '신제품'];

  return (
    <div>
      {/* ── 기간 선택 & 섹션 탭 ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {available_months.map(m => {
            const isActive = selectedMonths.includes(m);
            return (
              <button
                key={m}
                onClick={() => toggleMonth(m)}
                style={{
                  padding: '0.38rem 0.85rem',
                  borderRadius: 20,
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  background: isActive ? 'rgba(255,255,255,0.13)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {monthLabel(m)}
              </button>
            );
          })}
          {isPending && <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>로딩 중…</span>}
        </div>
      </div>

      {/* 섹션 탭 */}
      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1.5rem',
        background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '0.25rem',
        flexWrap: 'wrap',
      }}>
        {SECTIONS.map(s => (
          <TabButton key={s} active={activeSection === s} onClick={() => setActiveSection(s)}>
            {s}
          </TabButton>
        ))}
      </div>

      {/* ═══════════════ 실적 요약 ═══════════════ */}
      {activeSection === '실적' && (
        <div>
          {/* KPI 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ ...card, marginBottom: 0 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>부문 처방액</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt억(grand_total)}</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.25rem', color: pctColor(grandChangePct) }}>
                전월 대비 {fmtPct(grandChangePct)}
              </div>
            </div>
            {totalTarget > 0 && (
              <div style={{ ...card, marginBottom: 0 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>부문 목표</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt억(totalTarget)}</div>
                <div style={{ fontSize: '0.82rem', marginTop: '0.25rem', color: totalAchievePct != null && totalAchievePct >= 100 ? '#4ade80' : totalAchievePct != null && totalAchievePct >= 90 ? '#fbbf24' : '#ef4444' }}>
                  달성율 {totalAchievePct != null ? totalAchievePct.toFixed(1) + '%' : '-'}
                </div>
              </div>
            )}
            <div style={{ ...card, marginBottom: 0 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>전월 처방액</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt억(prev_grand_total)}</div>
            </div>
            <div style={{ ...card, marginBottom: 0 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>담당자 수</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{by_manager.length}명</div>
            </div>
            <div style={{ ...card, marginBottom: 0 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>총 가동처</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {by_manager.reduce((s, r) => s + r.hospital_cnt, 0).toLocaleString('ko-KR')}
              </div>
            </div>
          </div>

          {/* 담당자별 실적 테이블 */}
          <div style={card}>
            <div style={sectionTitle}>담당자별 실적 ({periodLabel(selectedMonths)})</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thLeft}>담당자</th>
                    <th style={th}>처방액</th>
                    <th style={th}>목표</th>
                    <th style={th}>달성율</th>
                    <th style={th}>구성비</th>
                    {isSingle && <th style={th}>전월</th>}
                    {isSingle && <th style={th}>증감</th>}
                    <th style={th}>가동처</th>
                    <th style={{ ...th, minWidth: 100 }}>비중</th>
                  </tr>
                </thead>
                <tbody>
                  {by_manager.map(r => {
                    const mgrTarget = mboMap[r.manager]; // 백만원
                    const mgrTargetWon = mgrTarget ? mgrTarget * 1_000_000 : null;
                    const achievePct = mgrTargetWon ? (r.total_amount / mgrTargetWon) * 100 : null;
                    const achColor = achievePct == null ? 'var(--text-muted)'
                      : achievePct >= 100 ? '#4ade80'
                      : achievePct >= 90 ? '#fbbf24'
                      : '#ef4444';
                    return (
                      <tr key={r.manager}>
                        <td style={tdLeft}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: mgrColor(r.manager), flexShrink: 0 }} />
                            {r.manager}
                          </div>
                        </td>
                        <td style={td}>{fmt백만(r.total_amount)}M</td>
                        <td style={{ ...td, color: 'var(--text-muted)' }}>
                          {mgrTarget ? mgrTarget.toLocaleString('ko-KR') + 'M' : '-'}
                        </td>
                        <td style={{ ...td, color: achColor, fontWeight: achievePct != null ? 600 : 400 }}>
                          {achievePct != null ? achievePct.toFixed(1) + '%' : '-'}
                        </td>
                        <td style={td}>{grand_total > 0 ? ((r.total_amount / grand_total) * 100).toFixed(1) : 0}%</td>
                        {isSingle && <td style={{ ...td, color: 'var(--text-muted)' }}>{fmt백만(r.prev_amount)}M</td>}
                        {isSingle && <td style={{ ...td, color: pctColor(r.change_pct) }}>{fmtPct(r.change_pct)}</td>}
                        <td style={td}>{r.hospital_cnt.toLocaleString('ko-KR')}</td>
                        <td style={td}>
                          <PctBar value={r.total_amount} max={maxMgrAmount} color={mgrColor(r.manager)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const totalTarget = mboMap['이욱환'] ?? null; // 이욱환 = 부문 전체 목표 (백만원)
                    const totalTargetWon = totalTarget ? totalTarget * 1_000_000 : null;
                    const totalAchieve = totalTargetWon ? (grand_total / totalTargetWon) * 100 : null;
                    const totalAchColor = totalAchieve == null ? 'var(--text-muted)'
                      : totalAchieve >= 100 ? '#4ade80'
                      : totalAchieve >= 90 ? '#fbbf24'
                      : '#ef4444';
                    const totalHospCnt = by_manager.reduce((s, r) => s + r.hospital_cnt, 0);
                    const grandChangePctTotal = prev_grand_total > 0
                      ? ((grand_total - prev_grand_total) / prev_grand_total) * 100
                      : null;
                    const footTd: React.CSSProperties = {
                      ...td,
                      borderTop: '1px solid rgba(255,255,255,0.15)',
                      fontWeight: 600,
                      paddingTop: '0.6rem',
                    };
                    return (
                      <tr>
                        <td style={{ ...tdLeft, ...footTd }}>합계</td>
                        <td style={footTd}>{fmt백만(grand_total)}M</td>
                        <td style={{ ...footTd, color: 'var(--text-muted)' }}>
                          {totalTarget ? totalTarget.toLocaleString('ko-KR') + 'M' : '-'}
                        </td>
                        <td style={{ ...footTd, color: totalAchColor }}>
                          {totalAchieve != null ? totalAchieve.toFixed(1) + '%' : '-'}
                        </td>
                        <td style={footTd}>100%</td>
                        {isSingle && <td style={{ ...footTd, color: 'var(--text-muted)' }}>{fmt백만(prev_grand_total)}M</td>}
                        {isSingle && <td style={{ ...footTd, color: pctColor(grandChangePctTotal) }}>{fmtPct(grandChangePctTotal)}</td>}
                        <td style={footTd}>{totalHospCnt.toLocaleString('ko-KR')}</td>
                        <td style={footTd} />
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ 실적 트렌드 ═══════════════ */}
      {activeSection === '트렌드' && (
        <div style={card}>
          <div style={sectionTitle}>담당자별 실적 트렌드 (처방월 기준)</div>
          {trendSeries.length > 0 ? (
            <>
              <LineChart series={trendSeries} periods={trendMonths} unit="백만" />
              <Legend items={trendSeries.map(s => ({ name: s.name, color: s.color }))} />

              {/* 월별 상세 테이블 */}
              <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thLeft}>담당자</th>
                      {trendMonths.map(m => <th key={m} style={th}>{shortMonth(m)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {trendSeries.map(s => (
                      <tr key={s.name}>
                        <td style={tdLeft}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                            {s.name}
                          </div>
                        </td>
                        {s.values.map((v, i) => (
                          <td key={i} style={{ ...td, fontSize: '0.78rem' }}>
                            {v != null && v > 0 ? fmt백만(v) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>트렌드 데이터 없음</p>
          )}
        </div>
      )}

      {/* ═══════════════ 가동처 현황 ═══════════════ */}
      {activeSection === '가동처' && (
        <div style={card}>
          <div style={sectionTitle}>담당자별 가동처 현황 ({periodLabel(selectedMonths)})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thLeft}>담당자</th>
                  {hospTypes.map(ht => <th key={ht} style={th}>{ht}</th>)}
                  <th style={th}>합계</th>
                </tr>
              </thead>
              <tbody>
                {by_manager.map(r => {
                  const htMap = mgrHospMap[r.manager] ?? {};
                  const total = Object.values(htMap).reduce((s, v) => s + v, 0);
                  return (
                    <tr key={r.manager}>
                      <td style={tdLeft}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: mgrColor(r.manager), flexShrink: 0 }} />
                          {r.manager}
                        </div>
                      </td>
                      {hospTypes.map(ht => (
                        <td key={ht} style={td}>{(htMap[ht] ?? 0).toLocaleString('ko-KR')}</td>
                      ))}
                      <td style={{ ...td, fontWeight: 600 }}>{total.toLocaleString('ko-KR')}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ ...tdLeft, fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.1)' }}>합계</td>
                  {hospTypes.map(ht => {
                    const sum = by_hosp_type.filter(r => r.hospital_type === ht).reduce((s, r) => s + r.hospital_cnt, 0);
                    return <td key={ht} style={{ ...td, fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.1)' }}>{sum.toLocaleString('ko-KR')}</td>;
                  })}
                  <td style={{ ...td, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    {by_manager.reduce((s, r) => s + r.hospital_cnt, 0).toLocaleString('ko-KR')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════ CSO 업체 현황 ═══════════════ */}
      {activeSection === 'CSO' && (
        <div>
          {managers.map(mgr => {
            const rows = (csoByMgr[mgr] ?? []).slice(0, 8);
            const maxCsoAmt = Math.max(...rows.map(r => r.total_amount), 1);
            return (
              <div key={mgr} style={{ ...card, borderLeft: `3px solid ${mgrColor(mgr)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: mgrColor(mgr) }} />
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{mgr}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>CSO 업체 현황</span>
                </div>
                {rows.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={{ ...thLeft, width: '2rem' }}>#</th>
                          <th style={thLeft}>CSO 업체</th>
                          <th style={th}>처방액</th>
                          <th style={th}>구성비</th>
                          <th style={th}>처방처</th>
                          <th style={{ ...th, minWidth: 100 }}>비중</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const mgrTotal = rows.reduce((s, rr) => s + rr.total_amount, 0);
                          return (
                            <tr key={r.cso_name}>
                              <td style={{ ...tdLeft, color: 'var(--text-muted)' }}>{i + 1}</td>
                              <td style={tdLeft}>{r.cso_name}</td>
                              <td style={td}>{fmt백만(r.total_amount)}M</td>
                              <td style={td}>{mgrTotal > 0 ? ((r.total_amount / mgrTotal) * 100).toFixed(1) : 0}%</td>
                              <td style={td}>{r.hospital_cnt.toLocaleString('ko-KR')}</td>
                              <td style={td}>
                                <PctBar value={r.total_amount} max={maxCsoAmt} color={mgrColor(mgr)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>데이터 없음</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════ 브랜드별 처방액 ═══════════════ */}
      {activeSection === '브랜드' && (
        <div>
          <div style={card}>
            <div style={sectionTitle}>아주약품 주요 브랜드 처방액 (Ubist 기준 · 백만원)</div>
            {brandPeriods.length > 0 ? (
              <>
                <LineChart series={brandSeries.filter(s => s.values.some(v => v != null && v > 0))} periods={brandPeriods} unit="백만" />
                <Legend items={brandGroups.map(g => ({ name: g.name, color: g.color }))} />
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Ubist 데이터 없음</p>
            )}
          </div>

          {/* 브랜드별 테이블 */}
          {brandPeriods.length > 0 && (
            <div style={card}>
              <div style={sectionTitle}>브랜드별 월별 처방액 (M원)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thLeft}>브랜드</th>
                      {brandPeriods.slice(-6).map(p => <th key={p} style={th}>{shortMonth(p)}</th>)}
                      <th style={th}>최근평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandGroups.map(g => {
                      const recent = brandPeriods.slice(-6).map(p => ubistData.brandData[g.name]?.[p] ?? 0);
                      const avg = recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
                      return (
                        <tr key={g.name}>
                          <td style={tdLeft}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color }} />
                              {g.name}
                            </div>
                          </td>
                          {brandPeriods.slice(-6).map(p => (
                            <td key={p} style={td}>
                              {fmt백만(ubistData.brandData[g.name]?.[p] ?? 0)}
                            </td>
                          ))}
                          <td style={{ ...td, fontWeight: 600 }}>{fmt백만(avg)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ 신제품 현황 ═══════════════ */}
      {activeSection === '신제품' && (
        <div>
          <div style={card}>
            <div style={sectionTitle}>신제품 처방 현황 (Ubist 기준)</div>
            {newProdSeries.length > 0 ? (
              <>
                <LineChart series={newProdSeries} periods={allNewProdPeriods} unit="백만" />
                <Legend items={newProdSeries.map(s => ({ name: s.name, color: s.color }))} />
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>신제품 Ubist 데이터 없음</p>
            )}
          </div>

          {newProdSeries.length > 0 && (
            <div style={card}>
              <div style={sectionTitle}>신제품 월별 처방액 (M원)</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thLeft}>제품</th>
                      {allNewProdPeriods.map(p => <th key={p} style={th}>{shortMonth(p)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {newProdSeries.map(s => (
                      <tr key={s.name}>
                        <td style={tdLeft}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                            {s.name}
                          </div>
                        </td>
                        {allNewProdPeriods.map((p, i) => (
                          <td key={p} style={{ ...td, fontSize: '0.78rem' }}>
                            {(s.values[i] ?? 0) > 0 ? fmt백만(s.values[i] as number) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
