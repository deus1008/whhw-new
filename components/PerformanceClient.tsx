'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { forceRefreshAnalysis } from '@/app/performance/actions';
import type { StoredReport } from '@/app/performance/actions';
import type { PerfData, StaffStat, ItemStat, CatStat } from '@/lib/performance/process';

/* ── 유틸 ──────────────────────────────────────────────────── */
function fmtAmt(val: number, unit: '억' | '만' | 'auto' = 'auto'): string {
  const abs  = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (unit === '억' || (unit === 'auto' && abs >= 100_000_000))
    return sign + (abs / 100_000_000).toFixed(1) + '억';
  if (unit === '만' || (unit === 'auto' && abs >= 10_000))
    return sign + Math.round(abs / 10_000).toLocaleString() + '만';
  return sign + Math.round(abs).toLocaleString();
}
function fmtPct(val: number) { return (val > 0 ? '+' : '') + (val * 100).toFixed(1) + '%'; }
function diffColor(v: number) { return v > 0 ? '#4ade80' : v < 0 ? '#f87171' : 'var(--text-muted)'; }

/* ── 메인 컴포넌트 ───────────────────────────────────────────── */
interface Props {
  reports: StoredReport[];
  errors:  { filename: string; message: string }[];
  isAdmin: boolean;
}

export default function PerformanceClient({ reports, errors, isAdmin }: Props) {
  const [selectedDocId, setSelectedDocId] = useState<string>(
    reports[0]?.doc_id ?? '',
  );
  const [isPending, startTransition] = useTransition();
  const [refreshError, setRefreshError] = useState('');
  const router = useRouter();

  /* ── 강제 재분석 (관리자) ── */
  function handleRefresh() {
    setRefreshError('');
    startTransition(async () => {
      const result = await forceRefreshAnalysis();
      if (result.error) {
        setRefreshError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const selectedData = reports.find(r => r.doc_id === selectedDocId);

  /* ── 파일 없음 ── */
  if (reports.length === 0) {
    return (
      <div style={{
        maxWidth: 560, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
          마감분석 대시보드
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <strong style={{ color: '#fbbf24' }}>문서관리 → 실적마감</strong> 폴더에<br />
          마감분석 엑셀 파일을 업로드하면<br />
          이 화면에 자동으로 분석 결과가 표시됩니다.
        </p>
        {errors.length > 0 && (
          <div style={{ marginTop: '1.2rem' }}>
            {errors.map((e, i) => (
              <ErrorMsg key={i} msg={`${e.filename}: ${e.message}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── 대시보드 ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {isPending && <LoadingOverlay msg="분석 캐시를 초기화하는 중입니다…" />}

      {/* 헤더 */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1rem 1.2rem',
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              📊 마감분석 대시보드
            </h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              📁 문서관리 → <strong style={{ color: '#fbbf24' }}>실적마감</strong> 폴더의 파일을 자동 분석합니다
            </p>
          </div>

          {/* 관리자: 강제 재분석 버튼 */}
          {isAdmin && (
            <button
              onClick={handleRefresh}
              disabled={isPending}
              title="캐시를 지우고 파일을 다시 분석합니다"
              style={{
                padding: '0.38rem 0.9rem', borderRadius: 8,
                cursor: isPending ? 'not-allowed' : 'pointer',
                background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.28)',
                color: isPending ? 'rgba(251,191,36,0.4)' : '#fbbf24',
                fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              {isPending ? '처리 중…' : '🔄 재분석'}
            </button>
          )}
        </div>

        {/* 파일 선택 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>파일 선택</span>
          {reports.map(r => {
            const isSelected = r.doc_id === selectedDocId;
            return (
              <button
                key={r.doc_id}
                onClick={() => setSelectedDocId(r.doc_id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '0.6rem', padding: '0.55rem 0.9rem', borderRadius: 9,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  background: isSelected ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? 'rgba(59,130,246,0.42)' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  fontSize: '0.82rem', fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? '#93c5fd' : 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  📄 {r.filename}
                </span>
                <span style={{
                  fontSize: '0.72rem', color: 'var(--text-muted)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {r.period} · {new Date(r.updated_at).toLocaleDateString('ko-KR')}
                </span>
              </button>
            );
          })}
        </div>

        {/* 오류 파일 목록 */}
        {errors.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {errors.map((e, i) => (
              <ErrorMsg key={i} msg={`⚠ ${e.filename}: ${e.message}`} />
            ))}
          </div>
        )}
        {refreshError && <ErrorMsg msg={refreshError} />}
      </div>

      {/* 선택 월 대시보드 */}
      {selectedData
        ? <Dashboard data={selectedData.data} />
        : <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>월을 선택하세요.</p>
      }
    </div>
  );
}

/* ── 서브 컴포넌트 ────────────────────────────────────────────── */
function LoadingOverlay({ msg }: { msg: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,12,20,0.65)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>⏳</div>
        <p style={{ fontSize: '0.9rem' }}>{msg}</p>
      </div>
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p style={{
      color: '#f87171', fontSize: '0.78rem',
      background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)',
      borderRadius: 8, padding: '0.45rem 0.8rem', margin: 0,
    }}>
      {msg}
    </p>
  );
}

/* ── 대시보드 본문 ────────────────────────────────────────────── */
function Dashboard({ data }: { data: PerfData }) {
  const maxStaff = Math.max(...data.staffStats.map(s => s.current));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <KpiCard label="당월 처방금액" value={fmtAmt(data.totalCurrent)} sub={`${data.period} 당월분`} color="#93c5fd" />
        <KpiCard label="전월 대비" value={fmtAmt(data.totalDiff)}
          sub={`${fmtPct(data.totalDiffPct)} (${data.prevPeriod || '-'} → ${data.period})`}
          color={diffColor(data.totalDiff)} />
        <KpiCard label="소급분" value={fmtAmt(data.sogeupAmount)} sub="당월 소급 처방금액" color="#fbbf24" />
        <KpiCard label="처방처 수" value={data.prescriptionCount.toLocaleString() + ' 개'} sub="당월 처방처 (중복제거)" color="#c084fc" />
      </div>

      {/* 담당자별 */}
      <Section title="담당자별 실적 전월대비">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['담당자', '전월', '당월', '증감', '증감률', '당월 비중'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.8rem', textAlign: h === '담당자' ? 'left' : 'right',
                    color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.staffStats.map((s: StaffStat) => (
                <tr key={s.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.55rem 0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{s.name}</td>
                  <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: 'var(--text-muted)' }}>{fmtAmt(s.prev)}</td>
                  <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{fmtAmt(s.current)}</td>
                  <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: diffColor(s.diff), fontWeight: 600 }}>
                    {s.diff > 0 ? '+' : ''}{fmtAmt(s.diff)}
                  </td>
                  <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: diffColor(s.diffPct) }}>{fmtPct(s.diffPct)}</td>
                  <td style={{ padding: '0.55rem 0.8rem', minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ height: '100%', borderRadius: 3,
                          background: 'linear-gradient(90deg,#3b82f6,#60a5fa)',
                          width: maxStaff > 0 ? `${(s.current / maxStaff * 100).toFixed(1)}%` : '0%' }} />
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {data.totalCurrent > 0 ? (s.current / data.totalCurrent * 100).toFixed(1) : '0'}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '0.55rem 0.8rem', fontWeight: 700, color: '#93c5fd' }}>합 계</td>
                <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: '#93c5fd', fontWeight: 600 }}>{fmtAmt(data.totalPrev)}</td>
                <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', fontWeight: 700, color: '#93c5fd' }}>{fmtAmt(data.totalCurrent)}</td>
                <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', fontWeight: 700, color: diffColor(data.totalDiff) }}>
                  {data.totalDiff > 0 ? '+' : ''}{fmtAmt(data.totalDiff)}
                </td>
                <td style={{ padding: '0.55rem 0.8rem', textAlign: 'right', color: diffColor(data.totalDiffPct) }}>{fmtPct(data.totalDiffPct)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* 품목별 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <Section title="📈 품목별 증가 TOP10"><ItemTable items={data.topIncreased} dir="up" /></Section>
        <Section title="📉 품목별 감소 TOP10"><ItemTable items={data.topDecreased} dir="down" /></Section>
      </div>

      {/* 병원구분 + 원외원내 + 소급 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <Section title="병원구분별 처방현황"><BarChart items={data.hospitalStats} color="#06b6d4" /></Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Section title="원외 / 원내 구분"><BarChart items={data.rxTypes} color="#a78bfa" /></Section>
          <Section title="소급분 현황">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <Row label="소급분 금액" value={fmtAmt(data.sogeupAmount)} />
              <Row label="당월분 대비" value={data.totalCurrent > 0
                ? (data.sogeupAmount / data.totalCurrent * 100).toFixed(2) + '%' : '-'} />
            </div>
          </Section>
        </div>
      </div>

      {/* 판매대행처 TOP15 */}
      <Section title="판매대행처별 처방금액 TOP 15">
        <BarChart items={data.dealerStats} color="#34d399" labelWidth={140} />
      </Section>
    </div>
  );
}

/* ── 재사용 컴포넌트 ─────────────────────────────────────────── */
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.1rem 1.2rem' }}>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: '1.45rem', fontWeight: 700, color, lineHeight: 1.1, marginBottom: '0.3rem' }}>{value}</p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.1rem 1.2rem' }}>
      <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.9rem' }}>{title}</h3>
      {children}
    </div>
  );
}
function ItemTable({ items, dir }: { items: ItemStat[]; dir: 'up' | 'down' }) {
  const maxDiff  = Math.max(...items.map(x => Math.abs(x.diff)));
  const color    = dir === 'up' ? '#4ade80' : '#f87171';
  const barColor = dir === 'up' ? 'linear-gradient(90deg,#16a34a,#4ade80)' : 'linear-gradient(90deg,#dc2626,#f87171)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {items.map((item: ItemStat, i: number) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-primary)', flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>
              {item.name.length > 22 ? item.name.slice(0, 22) + '…' : item.name}
            </span>
            <span style={{ fontSize: '0.76rem', color, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {dir === 'up' ? '+' : ''}{fmtAmt(item.diff)} ({fmtPct(item.diffPct)})
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }}>
            <div style={{ height: '100%', borderRadius: 2, background: barColor,
              width: maxDiff > 0 ? `${(Math.abs(item.diff) / maxDiff * 100).toFixed(1)}%` : '0%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function BarChart({ items, color, labelWidth = 80 }: { items: CatStat[]; color: string; labelWidth?: number }) {
  const max   = Math.max(...items.map(x => x.amount));
  const total = items.reduce((s, x) => s + x.amount, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map((item: CatStat, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', width: labelWidth,
            flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.type}>
            {item.type}
          </span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ height: '100%', borderRadius: 4, background: color, opacity: 0.8,
              width: max > 0 ? `${(item.amount / max * 100).toFixed(1)}%` : '0%' }} />
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 60, textAlign: 'right' }}>
            {fmtAmt(item.amount)}
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right' }}>
            {total > 0 ? (item.amount / total * 100).toFixed(1) : '0'}%
          </span>
        </div>
      ))}
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}
