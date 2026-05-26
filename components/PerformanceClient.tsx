'use client';

import { useState, useTransition, useRef, useCallback } from 'react';
import { uploadPerformanceData, deletePerformanceReport } from '@/app/performance/actions';
import type { PerformanceReport } from '@/app/performance/page';
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
  reports: PerformanceReport[];
  isAdmin: boolean;
}

export default function PerformanceClient({ reports, isAdmin }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    reports[0]?.period ?? '',
  );
  const [error,   setError]   = useState('');
  const [toast,   setToast]   = useState<{ msg: string; kind: 'add' | 'update' } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef   = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, kind: 'add' | 'update') {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  /* ── 파일 업로드 ── */
  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('xlsx / xls 파일만 업로드할 수 있습니다.');
      return;
    }
    setError('');
    const fd = new FormData();
    fd.append('file', file);

    startTransition(async () => {
      const result = await uploadPerformanceData(fd);
      if (result.error) {
        setError(result.error);
      } else if (result.period) {
        const isUpdate = reports.some(r => r.period === result.period);
        showToast(
          isUpdate
            ? `${result.period} 실적이 업데이트되었습니다.`
            : `${result.period} 실적이 추가되었습니다.`,
          isUpdate ? 'update' : 'add',
        );
        setSelectedPeriod(result.period);
      }
    });
  }, [reports]);

  /* ── 이력 삭제 ── */
  function handleDelete(period: string) {
    if (!confirm(`${period} 실적 이력을 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const result = await deletePerformanceReport(period);
      if (result.error) setError(result.error);
      else if (selectedPeriod === period) {
        const remaining = reports.filter(r => r.period !== period);
        setSelectedPeriod(remaining[0]?.period ?? '');
      }
    });
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const selectedData = reports.find(r => r.period === selectedPeriod);

  /* ── 데이터 없을 때 ── */
  if (reports.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
          📊 마감분석 대시보드
        </h2>
        {isAdmin ? (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
              아직 업로드된 실적이 없습니다.<br />
              마감분석 파일의 <strong style={{ color: '#93c5fd' }}>raw 시트</strong>가 포함된 엑셀 파일을 업로드하세요.
            </p>
            <DropZone
              dragging={dragging} inputRef={inputRef}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onInputChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </>
        ) : (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '1rem',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12, padding: '1.5rem' }}>
            관리자가 아직 실적 데이터를 업로드하지 않았습니다.<br />
            데이터가 업로드되면 이 화면에서 분석 결과를 확인할 수 있습니다.
          </p>
        )}
        {error && <ErrorMsg msg={error} />}
        {isPending && <LoadingOverlay />}
      </div>
    );
  }

  /* ── 대시보드 ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: 'fixed', top: '5rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '0.6rem 1.2rem', borderRadius: 10, whiteSpace: 'nowrap',
          background: toast.kind === 'add' ? 'rgba(16,185,129,0.18)' : 'rgba(59,130,246,0.18)',
          border: `1px solid ${toast.kind === 'add' ? 'rgba(16,185,129,0.35)' : 'rgba(59,130,246,0.35)'}`,
          color: toast.kind === 'add' ? '#6ee7b7' : '#93c5fd',
          fontSize: '0.82rem', fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.kind === 'add' ? '✅ ' : '🔄 '}{toast.msg}
        </div>
      )}

      {isPending && <LoadingOverlay />}

      {/* 헤더 */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              📊 마감분석 대시보드
            </h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              이력 {reports.length}개 저장됨
              {!isAdmin && ' · 관리자가 업로드한 분석 결과입니다.'}
            </p>
          </div>

          {/* 관리자만 업로드 버튼 표시 */}
          {isAdmin && (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={isPending}
              style={{
                padding: '0.38rem 0.9rem', borderRadius: 8, cursor: isPending ? 'not-allowed' : 'pointer',
                background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
                color: isPending ? 'rgba(147,197,253,0.5)' : '#93c5fd',
                fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              {isPending ? '처리 중…' : '↑ 파일 업로드'}
            </button>
          )}
          <input
            ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </div>

        {/* 관리자 드래그드롭 영역 (업로드 버튼 클릭 외 드래그도 지원) */}
        {isAdmin && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{
              border: `1px dashed ${dragging ? '#60a5fa' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8, padding: '0.5rem 1rem', textAlign: 'center',
              fontSize: '0.73rem', color: dragging ? '#93c5fd' : 'rgba(107,122,153,0.5)',
              background: dragging ? 'rgba(59,130,246,0.05)' : 'transparent',
              transition: 'all 0.2s', cursor: 'default',
            }}
          >
            또는 파일을 여기에 드래그하세요
          </div>
        )}

        {/* 월 탭 */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>실적월</span>
          {reports.map(r => (
            <div key={r.period} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setSelectedPeriod(r.period)}
                style={{
                  padding: '0.28rem 0.75rem',
                  borderRadius: isAdmin ? '7px 0 0 7px' : '7px',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem',
                  fontWeight: r.period === selectedPeriod ? 700 : 400,
                  background: r.period === selectedPeriod ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${r.period === selectedPeriod ? 'rgba(59,130,246,0.45)' : 'rgba(255,255,255,0.1)'}`,
                  borderRight: isAdmin ? 'none' : undefined,
                  color: r.period === selectedPeriod ? '#93c5fd' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {r.period}
              </button>
              {/* 관리자만 삭제 버튼 */}
              {isAdmin && (
                <button
                  onClick={() => handleDelete(r.period)}
                  title={`${r.period} 이력 삭제`}
                  disabled={isPending}
                  style={{
                    padding: '0.28rem 0.4rem', borderRadius: '0 7px 7px 0',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.65rem',
                    background: r.period === selectedPeriod ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${r.period === selectedPeriod ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.08)'}`,
                    color: 'rgba(255,255,255,0.3)', transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 선택된 월의 업데이트 시각 */}
        {selectedData && (
          <p style={{ fontSize: '0.7rem', color: 'rgba(107,122,153,0.7)', margin: 0 }}>
            📄 {selectedData.filename} · 업로드: {new Date(selectedData.updated_at).toLocaleString('ko-KR')}
          </p>
        )}

        {error && <ErrorMsg msg={error} />}
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
function LoadingOverlay() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,12,20,0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>⏳</div>
        <p style={{ fontSize: '0.9rem' }}>분석 중…</p>
        <p style={{ fontSize: '0.76rem', marginTop: '0.3rem' }}>대용량 파일은 수 초가 걸릴 수 있습니다.</p>
      </div>
    </div>
  );
}

function DropZone({ dragging, inputRef, onDragOver, onDragLeave, onDrop, onInputChange }: {
  dragging: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#60a5fa' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 16, padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer',
          background: dragging ? 'rgba(59,130,246,0.07)' : 'rgba(255,255,255,0.02)',
          transition: 'all 0.2s',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.8rem' }}>📂</div>
        <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.3rem' }}>
          파일을 여기에 드래그하거나 클릭하여 업로드
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          .xlsx / .xls 형식 · raw 시트 포함 필수
        </p>
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onInputChange} />
    </>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p style={{ color: '#f87171', fontSize: '0.82rem', textAlign: 'center',
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 8, padding: '0.6rem 1rem', marginTop: '0.5rem' }}>
      ⚠ {msg}
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
                        <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg,#3b82f6,#60a5fa)',
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
