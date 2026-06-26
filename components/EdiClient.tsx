'use client';

import { useState, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { forceRefreshEdi, analyzeEdiFile } from '@/app/edi/actions';
import type { EdiReport } from '@/app/edi/actions';
import type { EdiData, SalesPersonStat, CsoStat, HospitalStat, ItemStat, IHItemStat, DrugPrice } from '@/lib/edi/process';
// HospitalStat now carries .items (품목 드릴다운)

/* ── 포맷 유틸 ──────────────────────────────────────────────── */
/** 원 → 천원 변환 후 쉼표 포맷 (예: 6,946,420,000원 → "6,946,420") */
const fmt = (v: number) => Math.round(v / 1000).toLocaleString();

/* ── 테이블 셀 스타일 헬퍼 ──────────────────────────────────── */
import type { CSSProperties } from 'react';

const TH = (align: 'left' | 'right' = 'left'): CSSProperties => ({
  padding: '0.45rem 0.7rem',
  textAlign: align,
  color: 'var(--text-muted)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.02)',
});

const TD = (align: 'left' | 'right' = 'left', bold?: boolean): CSSProperties => ({
  padding: '0.5rem 0.7rem',
  textAlign: align,
  color: 'var(--text-primary)',
  fontWeight: bold ? 600 : undefined,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
});

const TD_MUTED = (align: 'left' | 'right' = 'left'): CSSProperties => ({
  padding: '0.5rem 0.7rem',
  textAlign: align,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
});

const TR_SUBTOTAL: CSSProperties = { background: 'rgba(255,255,255,0.035)' };
const TR_TOTAL:    CSSProperties = { background: 'rgba(168,85,247,0.12)', fontWeight: 700 };


/* ── Props ────────────────────────────────────────────────── */
interface Props {
  files:   { id: string; filename: string; created_at: string }[];
  isAdmin: boolean;
}

/* ════════════════════════════════════════════════════════════ */
export default function EdiClient({ files, isAdmin }: Props) {
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(
    files[0] ? new Set([files[0].id]) : new Set()
  );
  const [reports,      setReports]      = useState<EdiReport[]>([]);
  const [activeTab,    setActiveTab]    = useState(0);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [analyzeErr,   setAnalyzeErr]   = useState('');
  const [isPending,    startTransition] = useTransition();
  const [refreshError, setRefreshError] = useState('');
  const router = useRouter();

  function toggleFile(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setReports([]); setAnalyzeErr('');
  }

  async function handleAnalyze() {
    if (selectedIds.size === 0) return;
    setAnalyzing(true); setAnalyzeErr(''); setReports([]); setActiveTab(0);
    try {
      const orderedIds = files.filter(f => selectedIds.has(f.id)).map(f => f.id);
      const results = await Promise.all(orderedIds.map(id => analyzeEdiFile(id)));
      const ok   = results.flatMap(r => r.report ? [r.report as EdiReport] : []);
      const errs = results.flatMap(r => r.error  ? [r.error]              : []);
      if (ok.length > 0)   setReports(ok);
      if (errs.length > 0) setAnalyzeErr(errs.join(' / '));
    } catch (e) { setAnalyzeErr(e instanceof Error ? e.message : '분석 실패'); }
    finally { setAnalyzing(false); }
  }

  function handleRefresh() {
    setRefreshError('');
    startTransition(async () => {
      const r = await forceRefreshEdi();
      if (r.error) setRefreshError(r.error); else router.refresh();
    });
  }

  if (files.length === 0) return <EmptyState errors={[]} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {(analyzing || isPending) && <LoadingOverlay />}

      {/* 파일 선택 + 분석 버튼 */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🗂 EDI 분석 대시보드</h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>파일을 선택하고 분석 버튼을 눌러주세요</p>
          </div>
          {isAdmin && (
            <button onClick={handleRefresh} disabled={isPending}
              style={{ padding: '0.38rem 0.9rem', borderRadius: 8, cursor: isPending ? 'not-allowed' : 'pointer', background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.28)', color: isPending ? 'rgba(251,191,36,0.4)' : '#fbbf24', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600 }}>
              {isPending ? '처리 중…' : '🔄 캐시 초기화'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>파일 선택</span>
              {selectedIds.size > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#c4b5fd', fontWeight: 600 }}>{selectedIds.size}개 선택됨</span>
              )}
            </div>
            <div style={{
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
              background: 'rgba(255,255,255,0.03)',
              maxHeight: files.length > 5 ? '12rem' : undefined,
              overflowY: files.length > 5 ? 'auto' : undefined,
            }}>
              {files.map((f, i) => (
                <label key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  padding: '0.48rem 0.85rem', cursor: 'pointer',
                  borderBottom: i < files.length - 1 ? '1px solid rgba(255,255,255,0.05)' : undefined,
                  background: selectedIds.has(f.id) ? 'rgba(168,85,247,0.08)' : undefined,
                  transition: 'background 0.12s',
                }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(f.id)}
                    onChange={() => toggleFile(f.id)}
                    style={{ accentColor: '#c4b5fd', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.filename}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {new Date(f.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || selectedIds.size === 0}
            style={{ padding: '0.55rem 1.4rem', borderRadius: 9, cursor: (analyzing || selectedIds.size === 0) ? 'not-allowed' : 'pointer', background: (analyzing || selectedIds.size === 0) ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.4)', color: '#c4b5fd', fontSize: '0.88rem', fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >
            {analyzing ? '⏳ 분析 중…' : '▶ 분석'}
          </button>
        </div>

        {analyzeErr && <ErrorMsg msg={'⚠ ' + analyzeErr} />}
        {refreshError && <ErrorMsg msg={refreshError} />}
      </div>

      {reports.length > 0
        ? reports.length === 1
          ? <EdiDashboard data={reports[0].data} />
          : <MultiReport reports={reports} activeTab={activeTab} setActiveTab={setActiveTab} />
        : !analyzing && (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>파일을 선택하고 분석 버튼을 눌러주세요.</p>
        )
      }
    </div>
  );
}


/* ════════════════════════════════════════════════════════════ */
/*  비교 요약 (복수 파일 선택 시)                               */
/* ════════════════════════════════════════════════════════════ */
function ComparisonSummary({ reports }: { reports: EdiReport[] }) {
  const maxAmt   = Math.max(...reports.map(r => r.data.totalAmount));
  const maxFinal = Math.max(...reports.map(r => r.data.totalFinalAmount));
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1rem 1.2rem' }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.85rem' }}>📊 비교 요약 <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>(단위: 천원)</span></h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 180 }}>파일</th>
              <th style={{ ...TH('left'), minWidth: 80 }}>기간</th>
              <th style={TH('right')}>총 처방액</th>
              <th style={TH('right')}>최종실적</th>
              <th style={{ ...TH('right'), minWidth: 60 }}>담당자</th>
              <th style={{ ...TH('right'), minWidth: 50 }}>CSO</th>
              <th style={{ ...TH('right'), minWidth: 60 }}>처방처</th>
              <th style={{ ...TH('right'), minWidth: 50 }}>품목</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => {
              const isTop = r.data.totalFinalAmount === maxFinal;
              return (
                <tr key={r.doc_id} style={{ background: i % 2 ? 'rgba(255,255,255,0.01)' : undefined }}>
                  <td style={{ ...TD('left'), maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.filename}>
                    {r.filename}
                  </td>
                  <td style={{ ...TD('left'), color: '#93c5fd' }}>{r.period}</td>
                  <td style={{ ...TD('right'), color: r.data.totalAmount === maxAmt ? '#4ade80' : undefined, fontWeight: r.data.totalAmount === maxAmt ? 700 : undefined }}>
                    {fmt(r.data.totalAmount)}
                  </td>
                  <td style={{ ...TD('right'), color: isTop ? '#4ade80' : undefined, fontWeight: isTop ? 700 : undefined }}>
                    {fmt(r.data.totalFinalAmount)}
                  </td>
                  <td style={TD('right')}>{(r.data.totalSpCount ?? r.data.salesPersonStats.length).toLocaleString()}</td>
                  <td style={TD('right')}>{(r.data.totalCsoCount ?? r.data.csoStats.length).toLocaleString()}</td>
                  <td style={TD('right')}>{(r.data.totalHospitalCount ?? r.data.hospitalRanking.length).toLocaleString()}</td>
                  <td style={TD('right')}>{(r.data.totalItemCount ?? r.data.itemStats.length).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  비교 보기 — 섹션별 월별 나란히 비교                        */
/* ════════════════════════════════════════════════════════════ */
type BasicStat = { name: string; amount: number; finalAmount: number };

function CompareSection({ title, reports, getStats }: {
  title: string;
  reports: EdiReport[];
  getStats: (d: EdiData) => BasicStat[];
}) {
  const [showAll, setShowAll] = useState(false);

  const fileMaps = reports.map(r => {
    const m = new Map<string, BasicStat>();
    getStats(r.data).forEach(s => m.set(s.name, s));
    return m;
  });

  const allNames = [...new Set(reports.flatMap(r => getStats(r.data).map(s => s.name)))];
  const lastMap  = fileMaps[fileMaps.length - 1];
  allNames.sort((a, b) => (lastMap.get(b)?.finalAmount ?? 0) - (lastMap.get(a)?.finalAmount ?? 0));

  if (allNames.length === 0) return null;

  const display = showAll ? allNames : allNames.slice(0, 20);
  const periods = reports.map(r => r.period || r.filename.replace(/\.[^.]+$/, ''));
  const nFiles  = reports.length;
  const BL: CSSProperties = { borderLeft: '1px solid rgba(255,255,255,0.08)' };

  return (
    <Section title={title}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...TH('left'), minWidth: 140, verticalAlign: 'middle' }}>이름</th>
              {periods.map((p, pi) => (
                <th key={pi} colSpan={2} style={{
                  padding: '0.35rem 0.7rem', textAlign: 'center',
                  color: '#93c5fd', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap',
                  borderBottom: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.02)', ...BL,
                }}>{p}</th>
              ))}
              {nFiles >= 2 && (
                <th rowSpan={2} style={{ ...TH('right'), ...BL, verticalAlign: 'middle', fontSize: '0.7rem', minWidth: 70 }}>
                  증감
                </th>
              )}
            </tr>
            <tr>
              {periods.map((_, pi) => (
                <Fragment key={pi}>
                  <th style={{ ...TH('right'), ...BL, fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>처방액</th>
                  <th style={{ ...TH('right'), fontSize: '0.7rem' }}>최종실적</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((name, ni) => {
              const vals       = fileMaps.map(m => m.get(name));
              const firstFinal = vals[0]?.finalAmount ?? 0;
              const lastFinal  = vals[nFiles - 1]?.finalAmount ?? 0;
              const delta      = firstFinal > 0 ? (lastFinal - firstFinal) / firstFinal * 100 : null;
              return (
                <tr key={name} style={{ background: ni % 2 ? 'rgba(255,255,255,0.01)' : undefined, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ ...TD('left'), maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={name}>{name}</td>
                  {vals.map((v, fi) => (
                    <Fragment key={fi}>
                      <td style={{ ...TD('right'), ...BL, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {v?.amount ? fmt(v.amount) : <span style={{ opacity: 0.25 }}>—</span>}
                      </td>
                      <td style={{ ...TD('right'), fontSize: '0.78rem', fontWeight: v?.finalAmount ? 600 : undefined }}>
                        {v?.finalAmount ? fmt(v.finalAmount) : <span style={{ opacity: 0.25 }}>—</span>}
                      </td>
                    </Fragment>
                  ))}
                  {nFiles >= 2 && (
                    <td style={{
                      ...TD('right'), ...BL, fontSize: '0.78rem', fontWeight: delta !== null ? 600 : undefined,
                      color: delta === null ? 'var(--text-muted)' : delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : 'var(--text-muted)',
                    }}>
                      {delta === null
                        ? <span style={{ opacity: 0.25 }}>—</span>
                        : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                    </td>
                  )}
                </tr>
              );
            })}
            <tr style={TR_TOTAL}>
              <td style={{ ...TD_MUTED('right'), fontWeight: 700 }}>합계</td>
              {reports.map((r, fi) => {
                const stats  = getStats(r.data);
                const totAmt = stats.reduce((s, e) => s + e.amount, 0);
                const totFin = stats.reduce((s, e) => s + e.finalAmount, 0);
                return (
                  <Fragment key={fi}>
                    <td style={{ ...TD('right', true), ...BL, fontSize: '0.78rem' }}>{fmt(totAmt)}</td>
                    <td style={{ ...TD('right', true), fontSize: '0.78rem' }}>{fmt(totFin)}</td>
                  </Fragment>
                );
              })}
              {nFiles >= 2 && <td />}
            </tr>
          </tbody>
        </table>
      </div>
      {allNames.length > 20 && (
        <MoreButton showAll={showAll} total={allNames.length} onClick={() => setShowAll(v => !v)} />
      )}
    </Section>
  );
}

function CompareView({ reports }: { reports: EdiReport[] }) {
  const hasSP  = reports.some(r => r.data.salesPersonStats.length > 0);
  const hasCso = reports.some(r => r.data.csoStats.length > 0);
  const hasHos = reports.some(r => r.data.hospitalRanking.length > 0);
  const hasItm = reports.some(r => r.data.itemStats.length > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {hasSP  && <CompareSection title="담당자별 비교" reports={reports} getStats={d => d.salesPersonStats} />}
      {hasCso && <CompareSection title="CSO별 비교"   reports={reports} getStats={d => d.csoStats} />}
      {hasHos && <CompareSection title="처방처별 비교" reports={reports} getStats={d => d.hospitalRanking} />}
      {hasItm && <CompareSection title="품목별 비교"  reports={reports} getStats={d => d.itemStats} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  복수 파일 뷰 (비교 보기 + 파일별 보기 토글)               */
/* ════════════════════════════════════════════════════════════ */
function MultiReport({ reports, activeTab, setActiveTab }: {
  reports: EdiReport[];
  activeTab: number;
  setActiveTab: (i: number) => void;
}) {
  const [compareMode, setCompareMode] = useState(true);
  const VIEWS = [['비교 보기', true], ['파일별 보기', false]] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      <ComparisonSummary reports={reports} />

      {/* 보기 모드 토글 */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {VIEWS.map(([label, mode]) => {
          const active = compareMode === mode;
          return (
            <button key={String(mode)} onClick={() => setCompareMode(mode)} style={{
              padding: '0.32rem 0.85rem', borderRadius: '7px', fontSize: '0.8rem',
              fontWeight: active ? 700 : 400,
              background: active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${active ? 'rgba(59,130,246,0.45)' : 'rgba(255,255,255,0.1)'}`,
              color: active ? '#93c5fd' : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{label}</button>
          );
        })}
      </div>

      {compareMode ? (
        <CompareView reports={reports} />
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1rem 1.2rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {reports.map((r, i) => (
              <button key={r.doc_id} onClick={() => setActiveTab(i)} style={{
                padding: '0.35rem 0.9rem', borderRadius: '8px', fontSize: '0.8rem',
                fontWeight: activeTab === i ? 700 : 400,
                background: activeTab === i ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTab === i ? 'rgba(168,85,247,0.45)' : 'rgba(255,255,255,0.1)'}`,
                color: activeTab === i ? '#c4b5fd' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
                {r.period || r.filename.replace(/\.[^.]+$/, '')}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {reports[activeTab].filename}
          </p>
          <EdiDashboard data={reports[activeTab].data} />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  대시보드 본문 (5개 테이블)                                  */
/* ════════════════════════════════════════════════════════════ */
function EdiDashboard({ data }: { data: EdiData }) {
  const hasSP    = data.salesPersonStats.length > 0;
  const hasCso   = data.csoStats.length > 0;
  const hasHos   = data.hospitalRanking.length > 0;
  const hasItem  = data.itemStats.length > 0;
  const hasPrice = data.drugPrices.length > 0;

  const { totalAmount, totalFinalAmount } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* ① 담당자별 현황 (CSO 드릴다운 통합) */}
      {hasSP && (
        <SalesPersonAccordion
          stats={data.salesPersonStats}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ② CSO별 현황 (처방처 → 품목 드릴다운 통합) */}
      {hasCso && (
        <CsoAccordion
          stats={data.csoStats}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ③ 처방처별 현황 (품목 드릴다운 통합) */}
      {hasHos && (
        <HospitalAccordion
          stats={data.hospitalRanking}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ④ 품목별 현황 (탭 2종) */}
      {hasItem && (
        <ItemSection
          stats={data.itemStats}
          hospStats={data.itemHospStats ?? []}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ⑤ 약가 */}
      {hasPrice && (
        <DrugPriceTable prices={data.drugPrices} />
      )}

      {/* 컬럼 미감지 안내 */}
      {!hasSP && !hasCso && !hasHos && !hasItem && (
        <div style={{
          padding: '2rem', textAlign: 'center', borderRadius: 14,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
          color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.7,
        }}>
          <p>담당자·CSO·거래처 컬럼을 자동으로 감지하지 못했습니다.</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
            감지된 헤더:{' '}
            <code style={{ background: 'rgba(255,255,255,0.07)', padding: '2px 6px', borderRadius: 4 }}>
              {data.headers.slice(0, 20).join(', ')}{data.headers.length > 20 ? ' …' : ''}
            </code>
          </p>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ① 담당자별 현황 + CSO → 처방처 2단 드릴다운 (아코디언)     */
/* ════════════════════════════════════════════════════════════ */
function SalesPersonAccordion({ stats, totalAmount, totalFinalAmount }: {
  stats: SalesPersonStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  // 1단: 담당자 열림 여부
  const [expandedSp,   setExpandedSp]   = useState<Set<string>>(new Set());
  // 2단: 담당자||CSO 복합키로 CSO 열림 여부
  const [expandedCsos, setExpandedCsos] = useState<Set<string>>(new Set());

  function toggleSp(name: string) {
    setExpandedSp(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleCso(spName: string, csoName: string) {
    const key = `${spName}||${csoName}`;
    setExpandedCsos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <Section title="담당자별 현황">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 120 }}>담당자</th>
              <th style={{ ...TH('left'), minWidth: 160 }}>담당CSO</th>
              <th style={{ ...TH('left'), minWidth: 150 }}>처방처</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(sp => {
              const isSpOpen = expandedSp.has(sp.name);
              const hasCsos  = sp.csos.length > 0;
              return (
                <Fragment key={sp.name}>
                  {/* ── 담당자 요약 행 ── */}
                  <tr
                    onClick={() => hasCsos && toggleSp(sp.name)}
                    style={{
                      background: 'rgba(168,85,247,0.07)',
                      cursor: hasCsos ? 'pointer' : 'default',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <td colSpan={3} style={{ ...TD('left'), fontWeight: 600, color: '#d8b4fe', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {hasCsos && (
                        <span style={{ marginRight: '0.4rem', fontSize: '0.65rem', opacity: 0.7 }}>
                          {isSpOpen ? '▼' : '▶'}
                        </span>
                      )}
                      {sp.name}
                    </td>
                    <td style={{ ...TD('right', true), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmt(sp.amount)}
                    </td>
                    <td style={{ ...TD('right'), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmt(sp.finalAmount)}
                    </td>
                  </tr>

                  {/* ── CSO 하위 행 (1단 펼침) ── */}
                  {isSpOpen && sp.csos.map(cso => {
                    const csoKey    = `${sp.name}||${cso.name}`;
                    const isCsoOpen = expandedCsos.has(csoKey);
                    const hasHos    = cso.hospitals.length > 0;
                    return (
                      <Fragment key={cso.name}>
                        <tr
                          onClick={() => hasHos && toggleCso(sp.name, cso.name)}
                          style={{
                            background: 'rgba(52,211,153,0.05)',
                            cursor: hasHos ? 'pointer' : 'default',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                          }}
                        >
                          <td colSpan={3} style={{ ...TD('left'), paddingLeft: '1.5rem', fontSize: '0.78rem', color: '#6ee7b7' }}>
                            <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                            {hasHos && (
                              <span style={{ marginRight: '0.3rem', fontSize: '0.6rem', opacity: 0.7 }}>
                                {isCsoOpen ? '▼' : '▶'}
                              </span>
                            )}
                            {cso.name}
                          </td>
                          <td style={{ ...TD('right', true), fontSize: '0.78rem' }}>{fmt(cso.amount)}</td>
                          <td style={{ ...TD('right'), fontSize: '0.78rem' }}>{fmt(cso.finalAmount)}</td>
                        </tr>

                        {/* ── 처방처 하위 행 (2단 펼침) ── */}
                        {isCsoOpen && cso.hospitals.map(h => (
                          <tr key={h.name} style={{
                            background: 'rgba(255,255,255,0.01)',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                          }}>
                            <td colSpan={3} style={{
                              ...TD('left'), paddingLeft: '3rem', fontSize: '0.76rem',
                              maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis',
                            }} title={h.name}>
                              <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                              {h.name}
                            </td>
                            <td style={{ ...TD('right', true), fontSize: '0.76rem' }}>{fmt(h.amount)}</td>
                            <td style={{ ...TD('right'), fontSize: '0.76rem' }}>{fmt(h.finalAmount)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr style={TR_TOTAL}>
              <td colSpan={3} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ② CSO별 현황 + 처방처 → 품목 2단 드릴다운 (아코디언)        */
/* ════════════════════════════════════════════════════════════ */
function CsoAccordion({ stats, totalAmount, totalFinalAmount }: {
  stats: CsoStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  // 1단: CSO 열림 여부
  const [expandedCso, setExpandedCso] = useState<Set<string>>(new Set());
  // 2단: CSO||처방처 복합키로 처방처 열림 여부
  const [expandedHos, setExpandedHos] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = search ? stats.filter(s => s.name.toLowerCase().includes(search.toLowerCase())) : stats;
  const display = showAll ? filtered : filtered.slice(0, 20);

  function toggleCso(name: string) {
    setExpandedCso(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleHos(csoName: string, hosName: string) {
    const key = `${csoName}||${hosName}`;
    setExpandedHos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <Section title="CSO별 현황" searchSlot={<SearchInput value={search} onChange={v => { setSearch(v); setShowAll(false); }} />}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 160 }}>CSO명</th>
              <th style={{ ...TH('left'), minWidth: 150 }}>처방처</th>
              <th style={{ ...TH('left'), minWidth: 180 }}>품목명</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map(cso => {
              const isCsoOpen  = expandedCso.has(cso.name);
              const hasHos     = cso.hospitals.length > 0;
              return (
                <Fragment key={cso.name}>
                  {/* ── CSO 요약 행 ── */}
                  <tr
                    onClick={() => hasHos && toggleCso(cso.name)}
                    style={{
                      background: 'rgba(52,211,153,0.07)',
                      cursor: hasHos ? 'pointer' : 'default',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <td colSpan={3} style={{ ...TD('left'), fontWeight: 600, color: '#6ee7b7', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {hasHos && (
                        <span style={{ marginRight: '0.4rem', fontSize: '0.65rem', opacity: 0.7 }}>
                          {isCsoOpen ? '▼' : '▶'}
                        </span>
                      )}
                      {cso.name}
                    </td>
                    <td style={{ ...TD('right', true), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmt(cso.amount)}
                    </td>
                    <td style={{ ...TD('right'), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmt(cso.finalAmount)}
                    </td>
                  </tr>

                  {/* ── 처방처 하위 행 (1단 펼침) ── */}
                  {isCsoOpen && cso.hospitals.map(h => {
                    const hosKey    = `${cso.name}||${h.name}`;
                    const isHosOpen = expandedHos.has(hosKey);
                    const hasItems  = h.items.length > 0;
                    return (
                      <Fragment key={h.name}>
                        <tr
                          onClick={() => hasItems && toggleHos(cso.name, h.name)}
                          style={{
                            background: 'rgba(251,146,60,0.05)',
                            cursor: hasItems ? 'pointer' : 'default',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                          }}
                        >
                          <td colSpan={3} style={{ ...TD('left'), paddingLeft: '1.5rem', fontSize: '0.78rem', color: '#fdba74' }}>
                            <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                            {hasItems && (
                              <span style={{ marginRight: '0.3rem', fontSize: '0.6rem', opacity: 0.7 }}>
                                {isHosOpen ? '▼' : '▶'}
                              </span>
                            )}
                            {h.name}
                          </td>
                          <td style={{ ...TD('right', true), fontSize: '0.78rem' }}>{fmt(h.amount)}</td>
                          <td style={{ ...TD('right'), fontSize: '0.78rem' }}>{fmt(h.finalAmount)}</td>
                        </tr>

                        {/* ── 품목 하위 행 (2단 펼침) ── */}
                        {isHosOpen && h.items.map(it => (
                          <tr key={it.name} style={{
                            background: 'rgba(255,255,255,0.01)',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                          }}>
                            <td colSpan={3} style={{
                              ...TD('left'), paddingLeft: '3rem', fontSize: '0.76rem',
                              maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis',
                            }} title={it.name}>
                              <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                              {it.name}
                            </td>
                            <td style={{ ...TD('right', true), fontSize: '0.76rem' }}>{fmt(it.amount)}</td>
                            <td style={{ ...TD('right'), fontSize: '0.76rem' }}>{fmt(it.finalAmount)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr style={TR_TOTAL}>
              <td colSpan={3} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {filtered.length > 20 && (
        <MoreButton showAll={showAll} total={filtered.length} onClick={() => setShowAll(v => !v)} />
      )}
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ③ 처방처별 현황 + 품목 → CSO 2단 드릴다운 (아코디언)       */
/* ════════════════════════════════════════════════════════════ */
function HospitalAccordion({ stats, totalAmount, totalFinalAmount }: {
  stats: HospitalStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  // 1단: 처방처 열림 여부
  const [expandedHos,   setExpandedHos]   = useState<Set<string>>(new Set());
  // 2단: 처방처||품목 복합키로 품목 열림 여부
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = search ? stats.filter(s => s.name.toLowerCase().includes(search.toLowerCase())) : stats;
  const display = showAll ? filtered : filtered.slice(0, 20);

  function toggleHos(name: string) {
    setExpandedHos(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleItem(hosName: string, itemName: string) {
    const key = `${hosName}||${itemName}`;
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <Section title="처방처별 현황" searchSlot={<SearchInput value={search} onChange={v => { setSearch(v); setShowAll(false); }} />}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 160 }}>처방처</th>
              <th style={{ ...TH('left'), minWidth: 180 }}>품목명</th>
              <th style={{ ...TH('left'), minWidth: 140 }}>CSO명</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map((h) => {
              const isHosOpen = expandedHos.has(h.name);
              const hasItems  = h.items.length > 0;
              return (
                <Fragment key={h.name}>
                  {/* ── 처방처 요약 행 ── */}
                  <tr
                    onClick={() => hasItems && toggleHos(h.name)}
                    style={{
                      background: 'rgba(251,146,60,0.07)',
                      cursor: hasItems ? 'pointer' : 'default',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <td colSpan={3} style={{ ...TD('left'), fontWeight: 600, color: '#fdba74', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {hasItems && (
                        <span style={{ marginRight: '0.4rem', fontSize: '0.65rem', opacity: 0.7 }}>
                          {isHosOpen ? '▼' : '▶'}
                        </span>
                      )}
                      {h.name}
                    </td>
                    <td style={{ ...TD('right', true), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmt(h.amount)}
                    </td>
                    <td style={{ ...TD('right'), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmt(h.finalAmount)}
                    </td>
                  </tr>

                  {/* ── 품목 하위 행 (1단 펼침) ── */}
                  {isHosOpen && h.items.map(it => {
                    const itemKey    = `${h.name}||${it.name}`;
                    const isItemOpen = expandedItems.has(itemKey);
                    const hasCsos    = it.csos.length > 0;
                    return (
                      <Fragment key={it.name}>
                        <tr
                          onClick={() => hasCsos && toggleItem(h.name, it.name)}
                          style={{
                            background: 'rgba(59,130,246,0.05)',
                            cursor: hasCsos ? 'pointer' : 'default',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                          }}
                        >
                          <td colSpan={3} style={{
                            ...TD('left'), paddingLeft: '1.5rem', fontSize: '0.78rem', color: '#93c5fd',
                            maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis',
                          }} title={it.name}>
                            <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                            {hasCsos && (
                              <span style={{ marginRight: '0.3rem', fontSize: '0.6rem', opacity: 0.7 }}>
                                {isItemOpen ? '▼' : '▶'}
                              </span>
                            )}
                            {it.name}
                          </td>
                          <td style={{ ...TD('right', true), fontSize: '0.78rem' }}>{fmt(it.amount)}</td>
                          <td style={{ ...TD('right'), fontSize: '0.78rem' }}>{fmt(it.finalAmount)}</td>
                        </tr>

                        {/* ── CSO 하위 행 (2단 펼침) ── */}
                        {isItemOpen && it.csos.map(c => (
                          <tr key={c.name} style={{
                            background: 'rgba(255,255,255,0.01)',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                          }}>
                            <td colSpan={3} style={{
                              ...TD('left'), paddingLeft: '3rem', fontSize: '0.76rem',
                              maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis',
                            }} title={c.name}>
                              <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                              {c.name}
                            </td>
                            <td style={{ ...TD('right', true), fontSize: '0.76rem' }}>{fmt(c.amount)}</td>
                            <td style={{ ...TD('right'), fontSize: '0.76rem' }}>{fmt(c.finalAmount)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr style={TR_TOTAL}>
              <td colSpan={3} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {filtered.length > 20 && (
        <MoreButton showAll={showAll} total={filtered.length} onClick={() => setShowAll(v => !v)} />
      )}
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ④ 품목별 현황 — 탭 컨테이너                                */
/* ════════════════════════════════════════════════════════════ */
function ItemSection({ stats, hospStats, totalAmount, totalFinalAmount }: {
  stats: ItemStat[];
  hospStats: IHItemStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  const [tab, setTab] = useState<0 | 1>(0);
  const [search, setSearch] = useState('');
  const TABS = ['품목 → CSO → 요양기관', '품목 → 요양기관 → 담당자 → CSO'] as const;
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.1rem 1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>품목별 현황</h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>(단위: 천원)</span>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <SearchInput value={search} onChange={v => setSearch(v)} />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
        {TABS.map((label, i) => (
          <button key={i} onClick={() => setTab(i as 0 | 1)} style={{
            padding: '0.28rem 0.75rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: tab === i ? 700 : 400,
            background: tab === i ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${tab === i ? 'rgba(59,130,246,0.45)' : 'rgba(255,255,255,0.1)'}`,
            color: tab === i ? '#93c5fd' : 'var(--text-muted)',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}>{label}</button>
        ))}
      </div>
      {tab === 0
        ? <ItemCsoAccordion stats={stats} search={search} totalAmount={totalAmount} totalFinalAmount={totalFinalAmount} />
        : <ItemHospAccordion stats={hospStats} search={search} totalAmount={totalAmount} totalFinalAmount={totalFinalAmount} />
      }
    </div>
  );
}

/* ── 뷰1: 품목 → CSO → 요양기관 ──────────────────────────── */
function ItemCsoAccordion({ stats, search, totalAmount, totalFinalAmount }: {
  stats: ItemStat[];
  search: string;
  totalAmount: number;
  totalFinalAmount: number;
}) {
  // 1단: 품목 열림 여부
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  // 2단: 품목||CSO 복합키로 CSO 열림 여부
  const [expandedCsos,  setExpandedCsos]  = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const filtered = search ? stats.filter(s => s.name.toLowerCase().includes(search.toLowerCase())) : stats;
  const display = showAll ? filtered : filtered.slice(0, 20);

  function toggleItem(name: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleCso(itemName: string, csoName: string) {
    const key = `${itemName}||${csoName}`;
    setExpandedCsos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 200 }}>품목명</th>
              <th style={{ ...TH('left'), minWidth: 150 }}>담당CSO</th>
              <th style={{ ...TH('left'), minWidth: 150 }}>처방처</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map(it => {
              const isItemOpen = expandedItems.has(it.name);
              const hasCsos    = it.csos.length > 0;
              return (
                <Fragment key={it.name}>
                  {/* ── 품목 요약 행 ── */}
                  <tr
                    onClick={() => hasCsos && toggleItem(it.name)}
                    style={{
                      background: 'rgba(59,130,246,0.07)',
                      cursor: hasCsos ? 'pointer' : 'default',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <td colSpan={3} style={{
                      ...TD('left'), fontWeight: 600, color: '#93c5fd',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={it.name}>
                      {hasCsos && (
                        <span style={{ marginRight: '0.4rem', fontSize: '0.65rem', opacity: 0.7 }}>
                          {isItemOpen ? '▼' : '▶'}
                        </span>
                      )}
                      {it.name}
                    </td>
                    <td style={{ ...TD('right', true), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmt(it.amount)}
                    </td>
                    <td style={{ ...TD('right'), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmt(it.finalAmount)}
                    </td>
                  </tr>

                  {/* ── CSO 하위 행 (1단 펼침) ── */}
                  {isItemOpen && it.csos.map(cso => {
                    const csoKey    = `${it.name}||${cso.name}`;
                    const isCsoOpen = expandedCsos.has(csoKey);
                    const hasHos    = cso.hospitals.length > 0;
                    return (
                      <Fragment key={cso.name}>
                        <tr
                          onClick={() => hasHos && toggleCso(it.name, cso.name)}
                          style={{
                            background: 'rgba(52,211,153,0.05)',
                            cursor: hasHos ? 'pointer' : 'default',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                          }}
                        >
                          <td colSpan={3} style={{ ...TD('left'), paddingLeft: '1.5rem', fontSize: '0.78rem', color: '#6ee7b7' }}>
                            <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                            {hasHos && (
                              <span style={{ marginRight: '0.3rem', fontSize: '0.6rem', opacity: 0.7 }}>
                                {isCsoOpen ? '▼' : '▶'}
                              </span>
                            )}
                            {cso.name}
                          </td>
                          <td style={{ ...TD('right', true), fontSize: '0.78rem' }}>{fmt(cso.amount)}</td>
                          <td style={{ ...TD('right'), fontSize: '0.78rem' }}>{fmt(cso.finalAmount)}</td>
                        </tr>

                        {/* ── 처방처 하위 행 (2단 펼침) ── */}
                        {isCsoOpen && cso.hospitals.map(h => (
                          <tr key={h.name} style={{
                            background: 'rgba(255,255,255,0.01)',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                          }}>
                            <td colSpan={3} style={{
                              ...TD('left'), paddingLeft: '3rem', fontSize: '0.76rem',
                              maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis',
                            }} title={h.name}>
                              <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                              {h.name}
                            </td>
                            <td style={{ ...TD('right', true), fontSize: '0.76rem' }}>{fmt(h.amount)}</td>
                            <td style={{ ...TD('right'), fontSize: '0.76rem' }}>{fmt(h.finalAmount)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr style={TR_TOTAL}>
              <td colSpan={3} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {filtered.length > 20 && (
        <MoreButton showAll={showAll} total={filtered.length} onClick={() => setShowAll(v => !v)} />
      )}
    </div>
  );
}

/* ── 뷰2: 품목 → 요양기관 → 담당자 → CSO ─────────────────── */
function ItemHospAccordion({ stats, search, totalAmount, totalFinalAmount }: {
  stats: IHItemStat[];
  search: string;
  totalAmount: number;
  totalFinalAmount: number;
}) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedHos,   setExpandedHos]   = useState<Set<string>>(new Set());
  const [expandedSps,   setExpandedSps]   = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const filtered = search ? stats.filter(s => s.name.toLowerCase().includes(search.toLowerCase())) : stats;
  const display = showAll ? filtered : filtered.slice(0, 20);

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) {
    setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 200 }}>품목명</th>
              <th style={{ ...TH('left'), minWidth: 160 }}>요양기관</th>
              <th style={{ ...TH('left'), minWidth: 120 }}>담당자</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map(it => {
              const isItemOpen = expandedItems.has(it.name);
              const hasHos = it.hospitals.length > 0;
              return (
                <Fragment key={it.name}>
                  {/* ── 품목 행 ── */}
                  <tr onClick={() => hasHos && toggle(setExpandedItems, it.name)}
                    style={{ background: 'rgba(59,130,246,0.07)', cursor: hasHos ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td colSpan={3} style={{ ...TD('left'), fontWeight: 600, color: '#93c5fd', borderBottom: '1px solid rgba(255,255,255,0.06)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.name}>
                      {hasHos && <span style={{ marginRight: '0.4rem', fontSize: '0.65rem', opacity: 0.7 }}>{isItemOpen ? '▼' : '▶'}</span>}
                      {it.name}
                    </td>
                    <td style={{ ...TD('right', true), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{fmt(it.amount)}</td>
                    <td style={{ ...TD('right'), borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{fmt(it.finalAmount)}</td>
                  </tr>

                  {/* ── 요양기관 행 (1단) ── */}
                  {isItemOpen && it.hospitals.map(h => {
                    const hosKey = `${it.name}||${h.name}`;
                    const isHosOpen = expandedHos.has(hosKey);
                    const hasSps = h.salesPersons.length > 0;
                    return (
                      <Fragment key={h.name}>
                        <tr onClick={() => hasSps && toggle(setExpandedHos, hosKey)}
                          style={{ background: 'rgba(251,146,60,0.05)', cursor: hasSps ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td colSpan={3} style={{ ...TD('left'), paddingLeft: '1.5rem', fontSize: '0.78rem', color: '#fdba74', maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.name}>
                            <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                            {hasSps && <span style={{ marginRight: '0.3rem', fontSize: '0.6rem', opacity: 0.7 }}>{isHosOpen ? '▼' : '▶'}</span>}
                            {h.name}
                          </td>
                          <td style={{ ...TD('right', true), fontSize: '0.78rem' }}>{fmt(h.amount)}</td>
                          <td style={{ ...TD('right'), fontSize: '0.78rem' }}>{fmt(h.finalAmount)}</td>
                        </tr>

                        {/* ── 담당자 행 (2단) ── */}
                        {isHosOpen && h.salesPersons.map(sp => {
                          const spKey = `${hosKey}||${sp.name}`;
                          const isSpOpen = expandedSps.has(spKey);
                          const hasCsos = sp.csos.length > 0;
                          return (
                            <Fragment key={sp.name}>
                              <tr onClick={() => hasCsos && toggle(setExpandedSps, spKey)}
                                style={{ background: 'rgba(168,85,247,0.05)', cursor: hasCsos ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                <td colSpan={3} style={{ ...TD('left'), paddingLeft: '3rem', fontSize: '0.76rem', color: '#d8b4fe' }}>
                                  <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                                  {hasCsos && <span style={{ marginRight: '0.3rem', fontSize: '0.6rem', opacity: 0.7 }}>{isSpOpen ? '▼' : '▶'}</span>}
                                  {sp.name}
                                </td>
                                <td style={{ ...TD('right', true), fontSize: '0.76rem' }}>{fmt(sp.amount)}</td>
                                <td style={{ ...TD('right'), fontSize: '0.76rem' }}>{fmt(sp.finalAmount)}</td>
                              </tr>

                              {/* ── CSO 행 (3단) ── */}
                              {isSpOpen && sp.csos.map(cso => (
                                <tr key={cso.name} style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                                  <td colSpan={3} style={{ ...TD('left'), paddingLeft: '4.5rem', fontSize: '0.74rem', color: '#6ee7b7', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }} title={cso.name}>
                                    <span style={{ opacity: 0.4, marginRight: '0.2rem', fontSize: '0.7rem' }}>└</span>
                                    {cso.name}
                                  </td>
                                  <td style={{ ...TD('right', true), fontSize: '0.74rem' }}>{fmt(cso.amount)}</td>
                                  <td style={{ ...TD('right'), fontSize: '0.74rem' }}>{fmt(cso.finalAmount)}</td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
            <tr style={TR_TOTAL}>
              <td colSpan={3} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {filtered.length > 20 && (
        <MoreButton showAll={showAll} total={filtered.length} onClick={() => setShowAll(v => !v)} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ⑧ 약가 (단위: 원, 1000으로 나누지 않음)                    */
/* ════════════════════════════════════════════════════════════ */
function DrugPriceTable({ prices }: { prices: DrugPrice[] }) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = search ? prices.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : prices;
  const display = showAll ? filtered : filtered.slice(0, 30);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '1.1rem 1.2rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>약가</h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>(단위: 원)</span>
      </div>
      <div style={{ marginBottom: '0.75rem' }}>
        <SearchInput value={search} onChange={v => { setSearch(v); setShowAll(false); }} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 200 }}>품목</th>
              <th style={TH('right')}>약가</th>
            </tr>
          </thead>
          <tbody>
            {display.map(p => (
              <tr key={p.name}>
                <td style={{ ...TD('left'), maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.name}>
                  {p.name}
                </td>
                <td style={{ ...TD('right', true) }}>{p.unitPrice.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 30 && (
        <MoreButton showAll={showAll} total={filtered.length} onClick={() => setShowAll(v => !v)} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  공용 UI                                                     */
/* ════════════════════════════════════════════════════════════ */
function Section({ title, children, searchSlot }: { title: string; children: React.ReactNode; searchSlot?: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '1.1rem 1.2rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: searchSlot ? '0.5rem' : '0.85rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>(단위: 천원)</span>
      </div>
      {searchSlot && <div style={{ marginBottom: '0.75rem' }}>{searchSlot}</div>}
      {children}
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="🔍 키워드 검색…"
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '0.42rem 0.75rem', borderRadius: '7px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'var(--text-primary)', fontSize: '0.8rem',
        outline: 'none', fontFamily: 'inherit',
      }}
    />
  );
}

function MoreButton({ showAll, total, onClick }: { showAll: boolean; total: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: '0.6rem', width: '100%', padding: '0.4rem', borderRadius: 8,
        cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        color: 'var(--text-muted)',
      }}
    >
      {showAll ? '▲ 접기' : `▼ 더보기 (전체 ${total}건)`}
    </button>
  );
}


function EmptyState({ errors }: { errors: { filename: string; message: string }[] }) {
  return (
    <div style={{
      maxWidth: 560, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center',
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16,
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🗂</div>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.6rem' }}>
        EDI 분석 대시보드
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
        <strong style={{ color: '#fbbf24' }}>문서관리 → EDI</strong> 폴더에<br />
        Excel·CSV·TXT 파일을 업로드하면<br />
        이 화면에 자동으로 분석 결과가 표시됩니다.
      </p>
      {errors.length > 0 && (
        <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {errors.map((e, i) => <ErrorMsg key={i} msg={`${e.filename}: ${e.message}`} />)}
        </div>
      )}
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p style={{
      color: '#f87171', fontSize: '0.78rem',
      background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)',
      borderRadius: 8, padding: '0.45rem 0.8rem', margin: 0,
    }}>{msg}</p>
  );
}

function LoadingOverlay() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,12,20,0.65)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>⏳</div>
        <p style={{ fontSize: '0.9rem' }}>캐시를 초기화하는 중입니다…</p>
      </div>
    </div>
  );
}
