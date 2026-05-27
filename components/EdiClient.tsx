'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { forceRefreshEdi } from '@/app/edi/actions';
import type { EdiReport } from '@/app/edi/actions';
import type { HospitalStat, ItemStat, EdiData } from '@/lib/edi/process';

/* ── 유틸 ──────────────────────────────────────────────────── */
function fmtAmt(v: number): string {
  const abs = Math.abs(v), sign = v < 0 ? '-' : '';
  if (abs >= 100_000_000) return sign + (abs / 100_000_000).toFixed(1) + '억';
  if (abs >= 10_000)      return sign + Math.round(abs / 10_000).toLocaleString() + '만';
  return sign + Math.round(abs).toLocaleString();
}
function fmtNum(v: number) { return v.toLocaleString(); }

type SortKey = 'amount' | 'count';

/* ── 메인 컴포넌트 ───────────────────────────────────────────── */
interface Props {
  reports: EdiReport[];
  errors:  { filename: string; message: string }[];
  isAdmin: boolean;
}

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

  /* ── 파일 없음 ── */
  if (reports.length === 0) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {isPending && <LoadingOverlay />}

      {/* 헤더 */}
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

        {/* 파일 선택 */}
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

        {/* 오류 */}
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

/* ── 대시보드 본문 ────────────────────────────────────────────── */
function EdiDashboard({ data }: { data: EdiData }) {
  const [hospSort, setHospSort] = useState<SortKey>('amount');
  const [itemSort, setItemSort] = useState<SortKey>('amount');

  const hasAmount   = !!data.detectedCols.amount;
  const hasCount    = !!data.detectedCols.count;
  const hasHospital = data.hospitalStats.length > 0;
  const hasItem     = data.itemStats.length > 0;

  const hospList = [...data.hospitalStats].sort((a, b) => b[hospSort] - a[hospSort]);
  const itemList = [...data.itemStats].sort((a, b) => b[itemSort] - a[itemSort]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* 감지 컬럼 안내 */}
      <ColChip cols={data.detectedCols} />

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        {hasAmount && (
          <KpiCard label="총 청구금액" value={fmtAmt(data.totalAmount)} sub={data.detectedCols.amount!} color="#d8b4fe" />
        )}
        <KpiCard
          label={hasCount ? '총 건수' : '총 행 수'}
          value={fmtNum(data.totalCount)}
          sub={data.detectedCols.count ?? '전체 레코드 수'}
          color="#93c5fd"
        />
        {hasHospital && (
          <KpiCard label="거래처 수" value={fmtNum(data.uniqueHospitals)} sub="중복 제거" color="#6ee7b7" />
        )}
        {hasItem && (
          <KpiCard label="품목 수" value={fmtNum(data.uniqueItems)} sub="중복 제거" color="#fde68a" />
        )}
      </div>

      {/* 거래처/병원별 현황 */}
      {hasHospital && (
        <Section
          title="거래처 / 병원별 현황"
          sortKey={hospSort}
          onSort={setHospSort}
          hasAmount={hasAmount}
          hasCount={hasCount || !hasAmount}
        >
          <StatsTable
            rows={hospList}
            sortKey={hospSort}
            total={data.totalAmount || data.totalCount}
            useAmount={hasAmount}
            color="#a78bfa"
          />
        </Section>
      )}

      {/* 품목별 현황 */}
      {hasItem && (
        <Section
          title="품목별 처방 현황"
          sortKey={itemSort}
          onSort={setItemSort}
          hasAmount={hasAmount}
          hasCount={hasCount || !hasAmount}
        >
          <StatsTable
            rows={itemList}
            sortKey={itemSort}
            total={data.totalAmount || data.totalCount}
            useAmount={hasAmount}
            color="#34d399"
          />
        </Section>
      )}

      {/* 분석 불가 안내 */}
      {!hasHospital && !hasItem && (
        <div style={{
          padding: '2rem', textAlign: 'center', borderRadius: 14,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
          color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.7,
        }}>
          <p>거래처·품목 컬럼을 자동으로 감지하지 못했습니다.</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
            감지된 컬럼: <code style={{ background: 'rgba(255,255,255,0.07)', padding: '2px 6px', borderRadius: 4 }}>
              {data.headers.join(', ') || '없음'}
            </code>
          </p>
          <p style={{ marginTop: '0.4rem', fontSize: '0.75rem' }}>
            거래처 컬럼명 예시: 거래처명, 기관명, 요양기관명 / 품목 컬럼명 예시: 품목명, 약품명
          </p>
        </div>
      )}
    </div>
  );
}

/* ── 감지 컬럼 배지 ─────────────────────────────────────────── */
function ColChip({ cols }: { cols: EdiData['detectedCols'] }) {
  const detected = Object.entries(cols).filter(([, v]) => v);
  if (!detected.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>감지된 컬럼</span>
      {detected.map(([k, v]) => (
        <span key={k} style={{
          padding: '0.2rem 0.6rem', borderRadius: 6, fontSize: '0.7rem',
          background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.22)',
          color: '#d8b4fe',
        }}>
          {k === 'amount' ? '금액' : k === 'count' ? '건수' : k === 'hospital' ? '거래처' : k === 'item' ? '품목' : '날짜'}: {v}
        </span>
      ))}
    </div>
  );
}

/* ── 섹션 헤더 (정렬 버튼 포함) ─────────────────────────────── */
function Section({
  title, sortKey, onSort, hasAmount, hasCount, children
}: {
  title: string; sortKey: SortKey; onSort: (k: SortKey) => void;
  hasAmount: boolean; hasCount: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.1rem 1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>{title}</h3>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {hasAmount && (
            <SortBtn label="금액순" active={sortKey === 'amount'} onClick={() => onSort('amount')} />
          )}
          {hasCount && (
            <SortBtn label="건수순" active={sortKey === 'count'} onClick={() => onSort('count')} />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function SortBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.25rem 0.65rem', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: '0.72rem', fontWeight: active ? 600 : 400,
      background: active ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
      color: active ? '#d8b4fe' : 'var(--text-muted)',
    }}>{label}</button>
  );
}

/* ── 통계 테이블 ─────────────────────────────────────────────── */
function StatsTable({
  rows, sortKey, total, useAmount, color,
}: {
  rows: (HospitalStat | ItemStat)[]; sortKey: SortKey;
  total: number; useAmount: boolean; color: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? rows : rows.slice(0, 20);
  const maxVal  = rows[0] ? rows[0][sortKey] : 1;

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <th style={{ padding: '0.45rem 0.7rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>명칭</th>
              {useAmount && <th style={{ padding: '0.45rem 0.7rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>금액</th>}
              <th style={{ padding: '0.45rem 0.7rem', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>건수</th>
              <th style={{ padding: '0.45rem 0.7rem', color: 'var(--text-muted)', fontWeight: 500, minWidth: 120 }}>비중</th>
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => {
              const val   = row[sortKey];
              const share = total > 0 ? (val / total * 100) : 0;
              const pct   = maxVal  > 0 ? (val / maxVal * 100) : 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.5rem 0.7rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.name}>
                    {row.name}
                  </td>
                  {useAmount && (
                    <td style={{ padding: '0.5rem 0.7rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {fmtAmt(row.amount)}
                    </td>
                  )}
                  <td style={{ padding: '0.5rem 0.7rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                    {fmtNum(row.count)}
                  </td>
                  <td style={{ padding: '0.5rem 0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{
                          height: '100%', borderRadius: 3, background: color,
                          width: `${pct.toFixed(1)}%`, opacity: 0.75,
                        }} />
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 38, textAlign: 'right' }}>
                        {share.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 20 && (
        <button
          onClick={() => setShowAll(v => !v)}
          style={{
            marginTop: '0.6rem', width: '100%', padding: '0.4rem', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            color: 'var(--text-muted)',
          }}
        >
          {showAll ? '▲ 접기' : `▼ 전체 보기 (${rows.length}건)`}
        </button>
      )}
    </div>
  );
}

/* ── 공용 컴포넌트 ───────────────────────────────────────────── */
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.1rem 1.2rem' }}>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: '1.45rem', fontWeight: 700, color, lineHeight: 1.1, marginBottom: '0.3rem' }}>{value}</p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</p>
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
