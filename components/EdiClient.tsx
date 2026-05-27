'use client';

import { useState, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { forceRefreshEdi } from '@/app/edi/actions';
import type { EdiReport } from '@/app/edi/actions';
import type { EdiData, SalesPersonStat, CsoStat, HospitalStat, ItemStat, DrugPrice } from '@/lib/edi/process';

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

/* ── Props ──────────────────────────────────────────────────── */
interface Props {
  reports: EdiReport[];
  errors:  { filename: string; message: string }[];
  isAdmin: boolean;
}

/* ════════════════════════════════════════════════════════════ */
/*  메인 컴포넌트                                               */
/* ════════════════════════════════════════════════════════════ */
export default function EdiClient({ reports, errors, isAdmin }: Props) {
  const [selectedDocId, setSelectedDocId] = useState(reports[0]?.doc_id ?? '');
  const [isPending, startTransition] = useTransition();
  const [refreshError, setRefreshError] = useState('');
  const router = useRouter();

  function handleRefresh() {
    setRefreshError('');
    startTransition(async () => {
      const r = await forceRefreshEdi();
      if (r.error) setRefreshError(r.error);
      else router.refresh();
    });
  }

  const selected = reports.find(r => r.doc_id === selectedDocId);

  if (reports.length === 0) {
    return <EmptyState errors={errors} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {isPending && <LoadingOverlay />}

      {/* 파일 선택 헤더 */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1rem 1.2rem',
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              🗂 EDI 분석 대시보드
            </h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              📁 문서관리 → <strong style={{ color: '#fbbf24' }}>EDI</strong> 폴더의 파일을 자동 분석합니다
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={handleRefresh} disabled={isPending}
              title="캐시를 지우고 파일을 다시 분석합니다"
              style={{
                padding: '0.38rem 0.9rem', borderRadius: 8, cursor: isPending ? 'not-allowed' : 'pointer',
                background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.28)',
                color: isPending ? 'rgba(251,191,36,0.4)' : '#fbbf24',
                fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              {isPending ? '처리 중…' : '🔄 재분석'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>파일 선택</span>
          {reports.map(r => {
            const active = r.doc_id === selectedDocId;
            return (
              <button
                key={r.doc_id}
                onClick={() => setSelectedDocId(r.doc_id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '0.6rem', padding: '0.55rem 0.9rem', borderRadius: 9,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  background: active ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? 'rgba(168,85,247,0.42)' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  fontSize: '0.82rem', fontWeight: active ? 600 : 400,
                  color: active ? '#d8b4fe' : 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>
                  🗂 {r.filename}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {r.period && `${r.period} · `}{new Date(r.updated_at).toLocaleDateString('ko-KR')}
                </span>
              </button>
            );
          })}
        </div>

        {errors.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {errors.map((e, i) => <ErrorMsg key={i} msg={`⚠ ${e.filename}: ${e.message}`} />)}
          </div>
        )}
        {refreshError && <ErrorMsg msg={refreshError} />}
      </div>

      {selected
        ? <EdiDashboard data={selected.data} />
        : <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>파일을 선택하세요.</p>
      }
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  대시보드 본문 (5개 테이블)                                  */
/* ════════════════════════════════════════════════════════════ */
function EdiDashboard({ data }: { data: EdiData }) {
  const hasSP      = data.salesPersonStats.length > 0;
  const hasCso     = data.csoStats.length > 0;
  const hasHos     = data.hospitalRanking.length > 0;
  const hasDrill   = hasSP && data.salesPersonStats.some(sp => sp.csos.length > 0);
  const hasDetail  = hasCso && data.csoStats.some(c => c.hospitals.length > 0);
  const hasItem    = data.itemStats.length > 0;
  const hasItemCso = hasItem && data.itemStats.some(it => it.csos.length > 0);
  const hasPrice   = data.drugPrices.length > 0;

  const { totalAmount, totalFinalAmount } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* 요약 바 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '1.2rem',
        padding: '0.75rem 1rem',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, fontSize: '0.82rem',
      }}>
        {data.period && (
          <span style={{ color: 'var(--text-muted)' }}>
            기간&nbsp;<strong style={{ color: 'var(--text-primary)' }}>{data.period}</strong>
          </span>
        )}
        {totalAmount > 0 && (
          <span style={{ color: 'var(--text-muted)' }}>
            총 처방액&nbsp;<strong style={{ color: '#d8b4fe' }}>{fmt(totalAmount)}</strong>
            <span style={{ fontSize: '0.68rem' }}>&nbsp;천원</span>
          </span>
        )}
        {totalFinalAmount > 0 && (
          <span style={{ color: 'var(--text-muted)' }}>
            총 최종실적&nbsp;<strong style={{ color: '#6ee7b7' }}>{fmt(totalFinalAmount)}</strong>
            <span style={{ fontSize: '0.68rem' }}>&nbsp;천원</span>
          </span>
        )}
        <ColChips cols={data.detectedCols} />
      </div>

      {/* ① 담당자별 현황 */}
      {hasSP && (
        <SalesPersonTable
          stats={data.salesPersonStats}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ② 담당자 × CSO 드릴다운 */}
      {hasDrill && (
        <SalesPersonCsoTable
          stats={data.salesPersonStats}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ③ CSO별 순위 */}
      {hasCso && (
        <CsoRankTable
          stats={data.csoStats}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ④ CSO × 거래처 상세 */}
      {hasDetail && (
        <CsoDetailTable
          stats={data.csoStats}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ⑤ 처방처별 현황 */}
      {hasHos && (
        <HospitalRankTable
          stats={data.hospitalRanking}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ⑥ 품목별 현황 */}
      {hasItem && (
        <ItemRankTable
          stats={data.itemStats}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ⑦ 품목/CSO 드릴다운 */}
      {hasItemCso && (
        <ItemCsoTable
          stats={data.itemStats}
          totalAmount={totalAmount}
          totalFinalAmount={totalFinalAmount}
        />
      )}

      {/* ⑧ 약가 */}
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
/*  ① 담당자별 현황                                             */
/* ════════════════════════════════════════════════════════════ */
function SalesPersonTable({ stats, totalAmount, totalFinalAmount }: {
  stats: SalesPersonStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  return (
    <Section title="담당자별 현황">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={TH('left')}>담당자</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(sp => (
              <tr key={sp.name}>
                <td style={TD('left')}>{sp.name}</td>
                <td style={TD('right', true)}>{fmt(sp.amount)}</td>
                <td style={TD('right')}>{fmt(sp.finalAmount)}</td>
              </tr>
            ))}
            <tr style={TR_TOTAL}>
              <td style={{ ...TD('left'), fontWeight: 700, color: 'var(--text-muted)' }}>총합계</td>
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
/*  ② 담당자 × CSO 드릴다운                                     */
/* ════════════════════════════════════════════════════════════ */
function SalesPersonCsoTable({ stats, totalAmount, totalFinalAmount }: {
  stats: SalesPersonStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  // CSO 정보가 있는 담당자만
  const filtered = stats.filter(sp => sp.csos.length > 0);
  if (!filtered.length) return null;

  return (
    <Section title="담당자 × CSO 드릴다운">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 80 }}>담당자</th>
              <th style={{ ...TH('left'), minWidth: 160 }}>담당CSO</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(sp => (
              <Fragment key={sp.name}>
                {sp.csos.map((cso, ci) => (
                  <tr key={cso.name}>
                    <td style={{ ...TD('left'), color: ci === 0 ? 'var(--text-primary)' : 'transparent', userSelect: ci === 0 ? undefined : 'none' }}>
                      {sp.name}
                    </td>
                    <td style={TD('left')}>{cso.name}</td>
                    <td style={TD('right', true)}>{fmt(cso.amount)}</td>
                    <td style={TD('right')}>{fmt(cso.finalAmount)}</td>
                  </tr>
                ))}
                {/* 소계 */}
                <tr style={TR_SUBTOTAL}>
                  <td
                    colSpan={2}
                    style={{ ...TD_MUTED('right'), fontSize: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    소계
                  </td>
                  <td style={{ ...TD('right', true), borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {fmt(sp.amount)}
                  </td>
                  <td style={{ ...TD('right'), fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {fmt(sp.finalAmount)}
                  </td>
                </tr>
              </Fragment>
            ))}
            <tr style={TR_TOTAL}>
              <td colSpan={2} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
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
/*  ③ CSO별 순위                                               */
/* ════════════════════════════════════════════════════════════ */
function CsoRankTable({ stats, totalAmount, totalFinalAmount }: {
  stats: CsoStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? stats : stats.slice(0, 20);

  return (
    <Section title="CSO별 순위">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), width: 36 }}>#</th>
              <th style={{ ...TH('left'), minWidth: 180 }}>CSO명</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map((cso, i) => (
              <tr key={cso.name}>
                <td style={TD_MUTED('left')}>{i + 1}</td>
                <td style={TD('left')}>{cso.name}</td>
                <td style={TD('right', true)}>{fmt(cso.amount)}</td>
                <td style={TD('right')}>{fmt(cso.finalAmount)}</td>
              </tr>
            ))}
            <tr style={TR_TOTAL}>
              <td colSpan={2} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {stats.length > 20 && (
        <MoreButton showAll={showAll} total={stats.length} onClick={() => setShowAll(v => !v)} />
      )}
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ④ CSO × 거래처 상세 (아코디언)                             */
/* ════════════════════════════════════════════════════════════ */
function CsoDetailTable({ stats, totalAmount, totalFinalAmount }: {
  stats: CsoStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll]   = useState(false);
  const display = showAll ? stats : stats.slice(0, 15);

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <Section title="CSO × 거래처 상세">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 180 }}>CSO명</th>
              <th style={{ ...TH('left'), minWidth: 160 }}>거래처</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map(cso => {
              const isOpen = expanded.has(cso.name);
              const hasHospitals = cso.hospitals.length > 0;
              return (
                <Fragment key={cso.name}>
                  {/* CSO 요약 행 */}
                  <tr
                    onClick={() => hasHospitals && toggle(cso.name)}
                    style={{
                      background: 'rgba(168,85,247,0.07)',
                      cursor: hasHospitals ? 'pointer' : 'default',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <td colSpan={2} style={{ ...TD('left'), fontWeight: 600, color: '#d8b4fe', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {hasHospitals && (
                        <span style={{ marginRight: '0.4rem', fontSize: '0.65rem', opacity: 0.7 }}>
                          {isOpen ? '▼' : '▶'}
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
                  {/* 거래처 상세 (펼쳤을 때) */}
                  {isOpen && cso.hospitals.map(h => (
                    <tr key={h.name} style={{ background: 'rgba(255,255,255,0.015)' }}>
                      <td style={{ ...TD_MUTED('left'), paddingLeft: '1.4rem', fontSize: '0.75rem' }}>└</td>
                      <td style={{ ...TD('left'), fontSize: '0.78rem' }}>{h.name}</td>
                      <td style={{ ...TD('right', true), fontSize: '0.78rem' }}>{fmt(h.amount)}</td>
                      <td style={{ ...TD('right'), fontSize: '0.78rem' }}>{fmt(h.finalAmount)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr style={TR_TOTAL}>
              <td colSpan={2} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {stats.length > 15 && (
        <MoreButton showAll={showAll} total={stats.length} onClick={() => setShowAll(v => !v)} />
      )}
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ⑤ 처방처별 현황                                             */
/* ════════════════════════════════════════════════════════════ */
function HospitalRankTable({ stats, totalAmount, totalFinalAmount }: {
  stats: HospitalStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? stats : stats.slice(0, 20);

  return (
    <Section title="처방처별 현황">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), width: 36 }}>#</th>
              <th style={{ ...TH('left'), minWidth: 180 }}>처방처</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map((h, i) => (
              <tr key={h.name}>
                <td style={TD_MUTED('left')}>{i + 1}</td>
                <td style={TD('left')}>{h.name}</td>
                <td style={TD('right', true)}>{fmt(h.amount)}</td>
                <td style={TD('right')}>{fmt(h.finalAmount)}</td>
              </tr>
            ))}
            <tr style={TR_TOTAL}>
              <td colSpan={2} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {stats.length > 20 && (
        <MoreButton showAll={showAll} total={stats.length} onClick={() => setShowAll(v => !v)} />
      )}
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ⑥ 품목별 현황                                               */
/* ════════════════════════════════════════════════════════════ */
function ItemRankTable({ stats, totalAmount, totalFinalAmount }: {
  stats: ItemStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? stats : stats.slice(0, 20);

  return (
    <Section title="품목별 현황">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), width: 36 }}>#</th>
              <th style={{ ...TH('left'), minWidth: 200 }}>품목</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map((it, i) => (
              <tr key={it.name}>
                <td style={TD_MUTED('left')}>{i + 1}</td>
                <td style={{ ...TD('left'), maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.name}>
                  {it.name}
                </td>
                <td style={TD('right', true)}>{fmt(it.amount)}</td>
                <td style={TD('right')}>{fmt(it.finalAmount)}</td>
              </tr>
            ))}
            <tr style={TR_TOTAL}>
              <td colSpan={2} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {stats.length > 20 && (
        <MoreButton showAll={showAll} total={stats.length} onClick={() => setShowAll(v => !v)} />
      )}
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ⑦ 품목/CSO 드릴다운 (아코디언)                             */
/* ════════════════════════════════════════════════════════════ */
function ItemCsoTable({ stats, totalAmount, totalFinalAmount }: {
  stats: ItemStat[];
  totalAmount: number;
  totalFinalAmount: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll]   = useState(false);
  const display = showAll ? stats : stats.slice(0, 15);

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <Section title="품목/CSO 드릴다운">
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ ...TH('left'), minWidth: 200 }}>품목/CSO</th>
              <th style={{ ...TH('left'), minWidth: 160 }}>담당CSO</th>
              <th style={TH('right')}>처방액</th>
              <th style={TH('right')}>최종실적</th>
            </tr>
          </thead>
          <tbody>
            {display.map(it => {
              const isOpen = expanded.has(it.name);
              const hasCsos = it.csos.length > 0;
              return (
                <Fragment key={it.name}>
                  {/* 품목 요약 행 */}
                  <tr
                    onClick={() => hasCsos && toggle(it.name)}
                    style={{
                      background: 'rgba(59,130,246,0.07)',
                      cursor: hasCsos ? 'pointer' : 'default',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <td colSpan={2} style={{ ...TD('left'), fontWeight: 600, color: '#93c5fd', borderBottom: '1px solid rgba(255,255,255,0.06)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.name}>
                      {hasCsos && (
                        <span style={{ marginRight: '0.4rem', fontSize: '0.65rem', opacity: 0.7 }}>
                          {isOpen ? '▼' : '▶'}
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
                  {/* CSO 상세 (펼쳤을 때) */}
                  {isOpen && it.csos.map(c => (
                    <tr key={c.name} style={{ background: 'rgba(255,255,255,0.015)' }}>
                      <td style={{ ...TD_MUTED('left'), paddingLeft: '1.4rem', fontSize: '0.75rem' }}>└</td>
                      <td style={{ ...TD('left'), fontSize: '0.78rem' }}>{c.name}</td>
                      <td style={{ ...TD('right', true), fontSize: '0.78rem' }}>{fmt(c.amount)}</td>
                      <td style={{ ...TD('right'), fontSize: '0.78rem' }}>{fmt(c.finalAmount)}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr style={TR_TOTAL}>
              <td colSpan={2} style={{ ...TD_MUTED('right'), fontWeight: 700 }}>총합계</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalAmount)}</td>
              <td style={{ ...TD('right'), fontWeight: 700 }}>{fmt(totalFinalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {stats.length > 15 && (
        <MoreButton showAll={showAll} total={stats.length} onClick={() => setShowAll(v => !v)} />
      )}
    </Section>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  ⑧ 약가 (단위: 원, 1000으로 나누지 않음)                    */
/* ════════════════════════════════════════════════════════════ */
function DrugPriceTable({ prices }: { prices: DrugPrice[] }) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? prices : prices.slice(0, 30);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '1.1rem 1.2rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>약가</h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>(단위: 원)</span>
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
      {prices.length > 30 && (
        <MoreButton showAll={showAll} total={prices.length} onClick={() => setShowAll(v => !v)} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/*  공용 UI                                                     */
/* ════════════════════════════════════════════════════════════ */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '1.1rem 1.2rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>(단위: 천원)</span>
      </div>
      {children}
    </div>
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

function ColChips({ cols }: { cols: EdiData['detectedCols'] }) {
  const labelMap: Record<string, string> = {
    amount: '처방액', finalAmount: '최종실적',
    salesperson: '담당자', cso: 'CSO', hospital: '거래처', date: '날짜',
  };
  const detected = Object.entries(cols).filter(([, v]) => v);
  if (!detected.length) return null;
  return (
    <>
      {detected.map(([k, v]) => (
        <span key={k} style={{
          padding: '0.18rem 0.55rem', borderRadius: 5, fontSize: '0.68rem',
          background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.22)',
          color: '#d8b4fe', whiteSpace: 'nowrap',
        }}>
          {labelMap[k] ?? k}:{' '}<span style={{ opacity: 0.75 }}>{v}</span>
        </span>
      ))}
    </>
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
