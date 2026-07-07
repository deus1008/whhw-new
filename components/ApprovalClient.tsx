'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { PeriodResult, CombinedData } from '@/app/api/approval-data/route';

type AllData = {
  periods:     PeriodResult[];
  combined:    CombinedData;
  failedCount: number;
};

type FileInfo = { id: string; filename: string; createdAt: string };

/* ── 공통 스타일 ── */
const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem',
};
const TH: React.CSSProperties = {
  padding: '0.5rem 0.75rem', fontSize: '0.72rem',
  color: 'var(--text-muted)', fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  textAlign: 'left', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '0.45rem 0.75rem', fontSize: '0.8rem',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  color: 'var(--text-primary)',
};

/* ── 서브 컴포넌트 ── */
function Skel({ w = '100%', h = '0.85rem' }: { w?: string; h?: string }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: '5px',
      background: 'rgba(255,255,255,0.09)',
      animation: 'skel-pulse 1.4s ease-in-out infinite',
    }} />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem',
      background: 'linear-gradient(135deg,#fff 0%,#a8c4ff 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
    }}>{children}</h3>
  );
}

function SummaryCard({ label, value, unit, sub, color }: {
  label: string; value: string; unit?: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px', padding: '0.9rem 1rem',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
        <span style={{ fontSize: '1.7rem', fontWeight: 700, color: color ?? '#fff', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.45)' }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

function BreakdownTable({
  title, rows, countLabel = '품목수',
}: { title: string; rows: { name: string; count: number }[]; countLabel?: string }) {
  return (
    <div style={CARD}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>구분</th>
              <th style={{ ...TH, textAlign: 'right' }}>{countLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row, i) => (
              <tr key={row.name}>
                <td style={TD}>{row.name}</td>
                <td style={{ ...TD, textAlign: 'right', color: i === 0 ? '#f87171' : '#7eb3ff', fontWeight: i === 0 ? 700 : 400 }}>
                  {row.count}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={2} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)' }}>데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IngredientsTable({ rows, title }: { rows: { name: string; count: number }[]; title: string }) {
  return (
    <div style={CARD}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: '2.2rem', textAlign: 'center' }}>순위</th>
              <th style={TH}>성분명</th>
              <th style={{ ...TH, textAlign: 'right' }}>허가 건수</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row, i) => (
              <tr key={row.name}>
                <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{i + 1}</td>
                <td style={TD}>{row.name}</td>
                <td style={{ ...TD, textAlign: 'right', color: i === 0 ? '#f87171' : '#7eb3ff', fontWeight: i === 0 ? 700 : 400 }}>
                  {row.count}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={3} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)' }}>데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PipelineTable({ rows, periodLabel }: {
  rows: PeriodResult['pipeline']; periodLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={CARD}>
      <SectionTitle>파이프라인 현황{periodLabel && ` (${periodLabel} 기준)`}</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>질환군</th>
              <th style={TH}>성분명</th>
              <th style={TH}>자사 현황</th>
              <th style={TH}>최근 동향</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isLaunch = row.ownStatus.includes('발매');
              const isDev    = row.ownStatus.includes('개발') || row.ownStatus.includes('진행');
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : undefined }}>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>{row.disease}</td>
                  <td style={TD}>{row.ingredient}</td>
                  <td style={{
                    ...TD, whiteSpace: 'nowrap',
                    color: isLaunch ? '#f87171' : isDev ? '#60a5fa' : 'var(--text-primary)',
                    fontWeight: (isLaunch || isDev) ? 600 : 400,
                  }}>{row.ownStatus}</td>
                  <td style={{ ...TD, fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)' }}>{row.thisMonth}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── 월별 추이 바차트 ── */
function MonthlyTrend({ trend }: { trend: CombinedData['monthlyTrend'] }) {
  if (trend.length === 0) return null;
  const maxCount = Math.max(...trend.map(t => t.count), 1);
  return (
    <div style={CARD}>
      <SectionTitle>월별 허가 품목 추이</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {trend.map(item => {
          const pct = (item.count / maxCount) * 100;
          const label = formatPeriod(item.period) || item.filename.replace(/\.[^.]+$/, '');
          return (
            <div key={item.period || item.filename} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '80px', flexShrink: 0 }}>
                {label}
              </span>
              <div style={{
                flex: 1, background: 'rgba(255,255,255,0.06)',
                borderRadius: '4px', height: '10px', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: 'linear-gradient(90deg,#4f8ef7,#7c3aed)',
                  borderRadius: '4px',
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: '#7eb3ff', minWidth: '52px', textAlign: 'right', flexShrink: 0 }}>
                {item.count}품목
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 포맷 유틸 ── */
function formatPeriod(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  return `${m[1]}년 ${parseInt(m[2])}월`;
}

function getPeriodRange(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const year = parseInt(m[1]), month = parseInt(m[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const mm = m[2];
  return `${year}-${mm}-01 ~ ${mm}-${lastDay}`;
}

/* ── 메인 컴포넌트 ── */
export default function ApprovalClient({ allFiles }: { allFiles: FileInfo[] }) {
  const files = allFiles ?? [];
  const [allData,     setAllData]     = useState<AllData | null>(null);
  const [loading,     setLoading]     = useState(files.length > 0);
  const [fetchError,  setFetchError]  = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('전체');

  const ids = useMemo(() => files.map(f => f.id).join(','), [files]);

  async function loadAll() {
    if (!ids) return;
    setAllData(null);
    setFetchError(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/approval-data?ids=${encodeURIComponent(ids)}`);
      if (res.ok) {
        const data = await res.json() as AllData;
        setAllData(data);
        setSelectedPeriod('전체');
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (files.length > 0) loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 현재 표시할 데이터 */
  const displayData = useMemo(() => {
    if (!allData) return null;
    if (selectedPeriod === '전체') return null; // combined 별도 처리
    return allData.periods.find(p => p.period === selectedPeriod) ?? null;
  }, [allData, selectedPeriod]);

  const isCombined = selectedPeriod === '전체';
  const combined   = allData?.combined;

  if (files.length === 0) {
    return (
      <div style={{ ...CARD, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2.5rem' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.6rem', opacity: 0.4 }}>📄</div>
        문서관리 &gt; 허가현황 폴더에 업로드된 파일이 없습니다.
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes skel-pulse {
          0%, 100% { opacity: 0.3; }
          50%       { opacity: 0.65; }
        }
      `}</style>

      {/* ── 기간 선택 탭 ── */}
      {(loading || allData) && (
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} style={{ borderRadius: '100px', overflow: 'hidden' }}>
                <Skel w={i === 0 ? '60px' : '90px'} h='32px' />
              </div>
            ))
          ) : (
            ['전체', ...(allData?.periods.map(p => p.period) ?? [])].map(p => (
              <button
                key={p}
                onClick={() => setSelectedPeriod(p)}
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: '100px', cursor: 'pointer',
                  border: '1px solid',
                  borderColor: selectedPeriod === p ? 'rgba(79,142,247,0.5)' : 'rgba(255,255,255,0.1)',
                  background: selectedPeriod === p ? 'rgba(79,142,247,0.15)' : 'transparent',
                  color: selectedPeriod === p ? '#7eb3ff' : 'var(--text-muted)',
                  fontSize: '0.8rem', fontWeight: selectedPeriod === p ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {p === '전체' ? `전체 (${allData?.periods.length ?? 0}개월)` : formatPeriod(p)}
              </button>
            ))
          )}
        </div>
      )}

      {/* ── 기간 헤더 ── */}
      {!loading && allData && (
        <div style={{ marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {isCombined ? (
            <>
              <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                {allData.periods.length}개월 통합
              </span>
              {allData.periods.length > 0 && (
                <span> · {formatPeriod(allData.periods[0].period)} ~ {formatPeriod(allData.periods[allData.periods.length - 1].period)}</span>
              )}
              <span style={{ color: '#7eb3ff', fontWeight: 600 }}> · 총 {combined?.meta.totalCount ?? 0}품목</span>
            </>
          ) : displayData ? (
            <>
              <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{formatPeriod(displayData.period)}</span>
              {displayData.period && <span> · 집계기간 {getPeriodRange(displayData.period)}</span>}
              <span style={{ color: '#7eb3ff', fontWeight: 600 }}> · 총 {displayData.meta.totalCount}품목</span>
            </>
          ) : null}
        </div>
      )}

      {/* ── 오류 ── */}
      {fetchError && !loading && (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.6rem', opacity: 0.6 }}>⚠️</div>
          <div style={{ marginBottom: '0.4rem', color: '#fca5a5' }}>파일을 불러오는 중 오류가 발생했습니다.</div>
          <div style={{ fontSize: '0.78rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
            파일 형식이 지원되지 않거나 일시적인 네트워크 오류일 수 있습니다.
          </div>
          <button onClick={loadAll} style={{
            padding: '0.45rem 1.2rem', borderRadius: '8px', cursor: 'pointer',
            background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.35)',
            color: '#7eb3ff', fontSize: '0.82rem',
          }}>
            다시 시도
          </button>
        </div>
      )}

      {/* ── 스켈레톤 ── */}
      {loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '0.9rem 1rem' }}>
                <Skel w="55%" h="0.65rem" />
                <div style={{ marginTop: '0.5rem' }}><Skel w="70%" h="1.5rem" /></div>
                <div style={{ marginTop: '0.35rem' }}><Skel w="80%" h="0.6rem" /></div>
              </div>
            ))}
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={CARD}>
              <Skel w="130px" h="0.85rem" />
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {[...Array(5)].map((_, j) => <Skel key={j} />)}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── 데이터 표시 ── */}
      {!loading && !fetchError && allData && (
        <>
          {/* 파일 파싱 실패 경고 */}
          {allData.failedCount > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(251,191,36,0.08)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
              ⚠ {allData.failedCount}개 파일을 불러오지 못했습니다.
            </div>
          )}

          {/* ═══ 전체 통합 뷰 ═══ */}
          {isCombined && combined && (
            <>
              {/* 요약 카드 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <SummaryCard
                  label="총 허가 품목 (합산)"
                  value={String(combined.meta.totalCount)}
                  unit="품목"
                  sub={`${combined.meta.uniqueDiseases}개 질환군 · ${combined.meta.uniqueIngredients}개 성분`}
                  color="#7eb3ff"
                />
                <SummaryCard
                  label="최다 집중 성분"
                  value={String(combined.meta.topIngredientTotalCount || '-')}
                  unit={combined.meta.topIngredientTotalCount ? '건' : undefined}
                  sub={combined.meta.topIngredientName || '성분명 컬럼 미탐지'}
                  color="#a78bfa"
                />
                <SummaryCard
                  label="CSO사 품목 (합산)"
                  value={String(combined.meta.csoCount)}
                  unit="품목"
                  sub={`전체 ${combined.meta.totalCount > 0 ? Math.round(combined.meta.csoCount / combined.meta.totalCount * 100) : 0}%`}
                  color="#34d399"
                />
                <SummaryCard
                  label="파이프라인 현황"
                  value={String(combined.meta.pipelineCount)}
                  unit="건"
                  sub={`최신 월 기준`}
                  color="#fb923c"
                />
              </div>

              {/* 월별 추이 */}
              <MonthlyTrend trend={combined.monthlyTrend} />

              {/* 질환군별 + 허가유형별 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '0.75rem', marginBottom: '0' }}>
                <BreakdownTable title="질환군별 허가 품목 (누적)" rows={combined.diseaseBreakdown} />
                <BreakdownTable title="허가유형별 분포 (누적)" rows={combined.approvalTypeBreakdown} />
              </div>

              {/* 성분 누계 TOP 5 */}
              <IngredientsTable
                title={`성분별 허가 누계 TOP 5 (${allData.periods.length}개월 합산)`}
                rows={combined.topIngredients}
              />

              {/* 파이프라인 (최신 월) */}
              {combined.pipeline.length > 0 && (
                <PipelineTable
                  rows={combined.pipeline}
                  periodLabel={
                    [...allData.periods].reverse().find(p => p.pipeline.length > 0)
                      ? formatPeriod([...allData.periods].reverse().find(p => p.pipeline.length > 0)!.period)
                      : ''
                  }
                />
              )}
            </>
          )}

          {/* ═══ 개별 월 뷰 ═══ */}
          {!isCombined && displayData && (
            <>
              {/* 파싱 경고 */}
              {displayData.warnings.length > 0 && (
                <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(251,191,36,0.08)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
                  ⚠ {displayData.warnings.join(' · ')}
                </div>
              )}

              {/* 요약 카드 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <SummaryCard
                  label="총 허가 품목"
                  value={String(displayData.meta.totalCount)}
                  unit="품목"
                  sub={`${displayData.meta.uniqueDiseases}개 질환군 · ${displayData.meta.uniqueIngredients}개 성분`}
                  color="#7eb3ff"
                />
                <SummaryCard
                  label="최다 집중 성분"
                  value={String(displayData.meta.topIngredientTotalCount || '-')}
                  unit={displayData.meta.topIngredientTotalCount ? '품목' : undefined}
                  sub={displayData.meta.topIngredientName
                    ? `${displayData.meta.topIngredientName}${displayData.meta.topIngredientCompanyCount > 0 ? ` (${displayData.meta.topIngredientCompanyCount}개사)` : ''}`
                    : '성분명 컬럼 미탐지'}
                  color="#a78bfa"
                />
                <SummaryCard
                  label="CSO사 품목"
                  value={String(displayData.meta.csoCount)}
                  unit="품목"
                  sub={`${displayData.meta.csoCompanyCount}개사 · 전체 ${displayData.meta.totalCount > 0 ? Math.round(displayData.meta.csoCount / displayData.meta.totalCount * 100) : 0}%`}
                  color="#34d399"
                />
                <SummaryCard
                  label="파이프라인 현황"
                  value={String(displayData.meta.pipelineCount)}
                  unit="건"
                  sub={displayData.meta.pipelineCount > 0 ? '아래 테이블 참조' : '파이프라인 시트 없음'}
                  color="#fb923c"
                />
              </div>

              {/* 질환군별 + 허가유형별 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '0.75rem', marginBottom: '0' }}>
                <BreakdownTable title="질환군별 허가 품목 (품목수 순)" rows={displayData.diseaseBreakdown} />
                <BreakdownTable title="허가유형별 분포" rows={displayData.approvalTypeBreakdown} />
              </div>

              {/* 성분 누계 */}
              <IngredientsTable
                title={`허가 성분 누계 TOP 5${displayData.cumulativeIngredients !== displayData.topIngredients ? '' : ' (이달 기준)'}`}
                rows={displayData.cumulativeIngredients}
              />

              {/* 파이프라인 */}
              <PipelineTable rows={displayData.pipeline} periodLabel={formatPeriod(displayData.period)} />

              {displayData.meta.totalCount === 0 && displayData.pipeline.length === 0 && (
                <div style={{ ...CARD, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.85rem' }}>
                  파싱된 데이터가 없습니다. 파일 형식이나 시트 구조를 확인해주세요.
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
