'use client';

import React, { useState, useEffect } from 'react';

type ApprovalData = {
  filename: string;
  meta: {
    sheetNames: string[];
    mainSheetName: string;
    totalCount: number;
    uniqueDiseases: number;
    uniqueIngredients: number;
    csoCount: number;
    csoCompanyCount: number;
    topIngredientName: string;
    topIngredientCompanyCount: number;
    topIngredientTotalCount: number;
    pipelineCount: number;
    columnsDetected: Record<string, string | null>;
  };
  diseaseBreakdown:     { name: string; count: number }[];
  approvalTypeBreakdown: { name: string; count: number }[];
  topIngredients:       { name: string; count: number }[];
  cumulativeIngredients: { name: string; count: number }[];
  pipeline: { disease: string; ingredient: string; ownStatus: string; thisMonth: string }[];
  warnings: string[];
};

type FileInfo = { id: string; filename: string; createdAt: string };

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  padding: '1.25rem',
  marginBottom: '1rem',
};

const TH: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.72rem',
  color: 'var(--text-muted)',
  fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '0.45rem 0.75rem',
  fontSize: '0.8rem',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  color: 'var(--text-primary)',
};

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

function extractPeriod(filename: string): string {
  const m1 = filename.match(/(\d{4})년?\s*(\d{1,2})월/);
  if (m1) return `${m1[1]}년 ${m1[2]}월`;
  const m2 = filename.match(/(\d{4})[.\-](\d{2})/);
  if (m2) return `${m2[1]}년 ${parseInt(m2[2])}월`;
  const m3 = filename.match(/_(\d{2})\.(\d{2})/);
  if (m3) return `20${m3[1]}년 ${parseInt(m3[2])}월`;
  return '';
}

function getPeriodRange(period: string): string {
  const m = period.match(/(\d{4})년 (\d{1,2})월/);
  if (!m) return '';
  const year = parseInt(m[1]);
  const month = parseInt(m[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return `${year}-${mm}-01 ~ ${mm}-${lastDay}`;
}

export default function ApprovalClient({ allFiles }: { allFiles: FileInfo[] }) {
  const files = allFiles ?? [];
  const [selectedId, setSelectedId]   = useState<string>(files[0]?.id ?? '');
  const [dropOpen,   setDropOpen]     = useState(false);
  const [data,       setData]         = useState<ApprovalData | null>(null);
  const [loading,    setLoading]      = useState(files.length > 0);
  const [fetchError, setFetchError]   = useState(false);

  async function loadFile(id: string) {
    setData(null);
    setFetchError(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/approval-data?id=${encodeURIComponent(id)}`);
      if (res.ok) setData(await res.json());
      else setFetchError(true);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const firstId = files[0]?.id;
    if (!firstId) return;
    loadFile(firstId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFileChange(id: string) {
    if (id === selectedId) { setDropOpen(false); return; }
    setSelectedId(id);
    setDropOpen(false);
    loadFile(id);
  }

  const selectedFile = files.find(f => f.id === selectedId);
  const period       = selectedFile ? extractPeriod(selectedFile.filename) : '';
  const periodRange  = getPeriodRange(period);

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
          50% { opacity: 0.65; }
        }
      `}</style>

      {/* ── 파일 선택 ── */}
      <div style={{ position: 'relative', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setDropOpen(o => !o)}
          style={{
            width: '100%', padding: '0.75rem 1rem',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px', color: '#fff',
            fontSize: '0.85rem', textAlign: 'left', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.5rem' }}>
            {selectedFile?.filename ?? '파일 선택'}
          </span>
          <span style={{ opacity: 0.5, fontSize: '0.68rem', flexShrink: 0 }}>{dropOpen ? '▲' : '▼'}</span>
        </button>

        {dropOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
            background: '#0f1824', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px', overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            maxHeight: '280px', overflowY: 'auto',
          }}>
            {files.map(f => (
              <button
                key={f.id}
                onClick={() => handleFileChange(f.id)}
                style={{
                  width: '100%', padding: '0.65rem 1rem',
                  background: f.id === selectedId ? 'rgba(79,142,247,0.15)' : 'transparent',
                  border: 'none',
                  color: f.id === selectedId ? '#7eb3ff' : 'rgba(255,255,255,0.8)',
                  fontSize: '0.82rem', textAlign: 'left', cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {f.filename}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 기간 헤더 ── */}
      <div style={{ marginBottom: '1rem', textAlign: 'center', minHeight: '1.2rem' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Skel w="240px" h="0.75rem" />
          </div>
        ) : data ? (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {period && <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{period}</span>}
            {periodRange && <span> &nbsp;·&nbsp; 집계기간 {periodRange} · 식약처 허가/신고 기준</span>}
            {data.meta.totalCount > 0 && (
              <span style={{ marginLeft: '0.4rem', color: '#7eb3ff', fontWeight: 600 }}>
                · 총 {data.meta.totalCount}품목
              </span>
            )}
          </div>
        ) : null}
      </div>

      {/* ── 오류 ── */}
      {fetchError && !loading && (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.6rem', opacity: 0.6 }}>⚠️</div>
          <div style={{ marginBottom: '0.4rem', color: '#fca5a5' }}>파일을 불러오는 중 오류가 발생했습니다.</div>
          <div style={{ fontSize: '0.78rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
            파일 형식이 지원되지 않거나 일시적인 오류일 수 있습니다.
          </div>
          <button
            onClick={() => selectedId && loadFile(selectedId)}
            style={{
              padding: '0.45rem 1.2rem', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.35)',
              color: '#7eb3ff', fontSize: '0.82rem',
            }}
          >
            다시 시도
          </button>
        </div>
      )}

      {/* ── 스켈레톤 로딩 ── */}
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
            <div key={i} style={{ ...CARD }}>
              <Skel w="130px" h="0.85rem" />
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {[...Array(5)].map((_, j) => <Skel key={j} w={`${75 + Math.random() * 20}%`} />)}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── 데이터 표시 ── */}
      {!loading && !fetchError && data && (
        <>
          {/* 파싱 경고 */}
          {data.warnings.length > 0 && (
            <div style={{
              fontSize: '0.72rem', color: '#fbbf24', marginBottom: '0.75rem',
              padding: '0.5rem 0.75rem', background: 'rgba(251,191,36,0.08)',
              borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)',
            }}>
              ⚠ {data.warnings.join(' · ')}
            </div>
          )}

          {/* 컬럼 미탐지 경고 */}
          {data.meta.totalCount > 0 && !data.meta.columnsDetected.diseaseCol && (
            <div style={{
              fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.75rem',
              padding: '0.5rem 0.75rem', background: 'rgba(148,163,184,0.08)',
              borderRadius: '8px', border: '1px solid rgba(148,163,184,0.15)',
            }}>
              ℹ 질환군 컬럼을 자동 인식하지 못했습니다. 실제 컬럼명: {Object.keys(data.meta.columnsDetected).map(k => `${k}=${data.meta.columnsDetected[k] ?? '미탐지'}`).join(', ')}
            </div>
          )}

          {/* 요약 카드 4개 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <SummaryCard
              label="총 허가 품목"
              value={String(data.meta.totalCount)}
              unit="품목"
              sub={`${data.meta.uniqueDiseases}개 질환군 · ${data.meta.uniqueIngredients}개 성분`}
              color="#7eb3ff"
            />
            <SummaryCard
              label="최다 집중 성분"
              value={String(data.meta.topIngredientTotalCount || '-')}
              unit={data.meta.topIngredientTotalCount ? '품목' : undefined}
              sub={data.meta.topIngredientName
                ? `${data.meta.topIngredientName}${data.meta.topIngredientCompanyCount > 0 ? ` (${data.meta.topIngredientCompanyCount}개사)` : ''}`
                : '성분명 컬럼 미탐지'}
              color="#a78bfa"
            />
            <SummaryCard
              label="CSO사 품목"
              value={String(data.meta.csoCount)}
              unit="품목"
              sub={`${data.meta.csoCompanyCount}개사 · 전체 ${data.meta.totalCount > 0 ? Math.round(data.meta.csoCount / data.meta.totalCount * 100) : 0}%`}
              color="#34d399"
            />
            <SummaryCard
              label="파이프라인 현황"
              value={String(data.meta.pipelineCount)}
              unit="건"
              sub={data.meta.pipelineCount > 0 ? '아래 테이블 참조' : '파이프라인 시트 없음'}
              color="#fb923c"
            />
          </div>

          {/* 질환군별 + 허가유형별 (2열 그리드) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '0.75rem', marginBottom: '0' }}>

            {/* 질환군별 */}
            <div style={CARD}>
              <SectionTitle>질환군별 허가 품목 (품목수 순)</SectionTitle>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={TH}>질환군</th>
                      <th style={{ ...TH, textAlign: 'right' }}>품목수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.diseaseBreakdown.length > 0 ? data.diseaseBreakdown.map((row, i) => (
                      <tr key={row.name}>
                        <td style={TD}>{row.name}</td>
                        <td style={{ ...TD, textAlign: 'right', color: i === 0 ? '#f87171' : '#7eb3ff', fontWeight: i === 0 ? 700 : 400 }}>
                          {row.count}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={2} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)' }}>질환군 컬럼 미탐지</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 허가유형별 */}
            <div style={CARD}>
              <SectionTitle>허가유형별 분포</SectionTitle>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={TH}>허가유형</th>
                      <th style={{ ...TH, textAlign: 'right' }}>품목수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.approvalTypeBreakdown.length > 0 ? data.approvalTypeBreakdown.map((row, i) => (
                      <tr key={row.name}>
                        <td style={TD}>{row.name}</td>
                        <td style={{ ...TD, textAlign: 'right', color: i === 0 ? '#f87171' : '#7eb3ff', fontWeight: i === 0 ? 700 : 400 }}>
                          {row.count}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={2} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)' }}>허가유형 컬럼 미탐지</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 허가 성분 누계 TOP 5 */}
          <div style={CARD}>
            <SectionTitle>
              허가 성분 누계 TOP 5
              {data.cumulativeIngredients === data.topIngredients && data.meta.sheetNames.length === 1 && (
                <span style={{ fontSize: '0.68rem', fontWeight: 400, WebkitTextFillColor: 'var(--text-muted)', backgroundImage: 'none' }}>
                  &nbsp;(이달 데이터 기준 — 누계 시트 없음)
                </span>
              )}
            </SectionTitle>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, width: '2rem', textAlign: 'center' }}>순위</th>
                    <th style={TH}>성분명</th>
                    <th style={{ ...TH, textAlign: 'right' }}>허가 누계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cumulativeIngredients.length > 0 ? data.cumulativeIngredients.map((row, i) => (
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

          {/* 파이프라인 현황 */}
          {data.pipeline.length > 0 && (
            <div style={CARD}>
              <SectionTitle>파이프라인 현황</SectionTitle>
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
                    {data.pipeline.map((row, i) => {
                      const isLaunch = row.ownStatus.includes('발매');
                      const isDev    = row.ownStatus.includes('개발') || row.ownStatus.includes('진행');
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : undefined }}>
                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>{row.disease}</td>
                          <td style={TD}>{row.ingredient}</td>
                          <td style={{
                            ...TD, whiteSpace: 'nowrap',
                            color:      isLaunch ? '#f87171' : isDev ? '#60a5fa' : 'var(--text-primary)',
                            fontWeight: (isLaunch || isDev) ? 600 : 400,
                          }}>
                            {row.ownStatus}
                          </td>
                          <td style={{ ...TD, fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)' }}>
                            {row.thisMonth}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 전체 데이터 없음 */}
          {data.meta.totalCount === 0 && data.pipeline.length === 0 && (
            <div style={{ ...CARD, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2rem' }}>
              파싱된 데이터가 없습니다. 파일 형식이나 시트 구조를 확인해주세요.<br />
              <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>시트: {data.meta.sheetNames.join(', ')}</span>
            </div>
          )}
        </>
      )}
    </>
  );
}
