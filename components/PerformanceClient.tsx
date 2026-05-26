'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

/* ── 타입 정의 ───────────────────────────────────────────────── */
interface StaffStat {
  name: string;
  prev: number;
  current: number;
  diff: number;
  diffPct: number;
}
interface ItemStat {
  name: string;
  prev: number;
  current: number;
  diff: number;
  diffPct: number;
}
interface CatStat { type: string; amount: number; }

interface PerfData {
  filename: string;
  period: string;
  prevPeriod: string;
  totalCurrent: number;
  totalPrev: number;
  totalDiff: number;
  totalDiffPct: number;
  sogeupAmount: number;
  prescriptionCount: number;
  staffStats: StaffStat[];
  topIncreased: ItemStat[];
  topDecreased: ItemStat[];
  hospitalStats: CatStat[];
  rxTypes: CatStat[];
  dealerStats: CatStat[];
}

// 이력: { '2026.03': PerfData, '2026.04': PerfData, ... }
type History = Record<string, PerfData>;

const LS_KEY = 'performance_history_v2';

/* ── 유틸 함수 ───────────────────────────────────────────────── */
function excelDateToYM(serial: number): string {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0');
}

function fmtAmt(val: number, unit: '억' | '만' | 'auto' = 'auto'): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (unit === '억' || (unit === 'auto' && abs >= 100_000_000))
    return sign + (abs / 100_000_000).toFixed(1) + '억';
  if (unit === '만' || (unit === 'auto' && abs >= 10_000))
    return sign + Math.round(abs / 10_000).toLocaleString() + '만';
  return sign + Math.round(abs).toLocaleString();
}

function fmtPct(val: number): string {
  const sign = val > 0 ? '+' : '';
  return sign + (val * 100).toFixed(1) + '%';
}

function diffColor(v: number): string {
  if (v > 0) return '#4ade80';
  if (v < 0) return '#f87171';
  return 'var(--text-muted)';
}

function saveHistory(hist: History) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(hist)); } catch { /* quota */ }
}

/* ── Raw 데이터 처리 ─────────────────────────────────────────── */
function processRaw(rows: Record<string, unknown>[], filename: string): PerfData {
  const norm: Record<string, unknown>[] = rows.map(r => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k.trim()] = v;
    return o;
  });

  const months = [...new Set(norm.map(r => r['실적월'] as number))]
    .filter(m => typeof m === 'number' && m > 40000)
    .sort((a, b) => a - b);

  if (months.length === 0) throw new Error('"raw" 시트에서 실적월 데이터를 찾을 수 없습니다.');

  const curM  = months[months.length - 1];
  const prevM = months.length >= 2 ? months[months.length - 2] : null;

  const curRows: Record<string, unknown>[]    = [];
  const prevRows: Record<string, unknown>[]   = [];
  const sogeupRows: Record<string, unknown>[] = [];

  for (const r of norm) {
    const m = r['실적월'];
    const t = r['실적구분'];
    if (m === curM  && t === '당월분') curRows.push(r);
    else if (m === prevM && t === '당월분') prevRows.push(r);
    else if (m === curM  && t === '소급분') sogeupRows.push(r);
  }

  const sumAmt = (arr: Record<string, unknown>[]) =>
    arr.reduce((s, r) => s + (Number(r['처방금액']) || 0), 0);

  function aggregateBy(arr: Record<string, unknown>[], key: string): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of arr) {
      const k = String(r[key] ?? '');
      m.set(k, (m.get(k) ?? 0) + (Number(r['처방금액']) || 0));
    }
    return m;
  }

  const curStaff  = aggregateBy(curRows, '현담당자');
  const prevStaff = aggregateBy(prevRows, '현담당자');
  const allStaff  = new Set([...curStaff.keys(), ...prevStaff.keys()]);
  const staffStats: StaffStat[] = [...allStaff].map(name => {
    const cur  = curStaff.get(name)  ?? 0;
    const prev = prevStaff.get(name) ?? 0;
    return { name, prev, current: cur, diff: cur - prev, diffPct: prev ? (cur - prev) / prev : 0 };
  }).sort((a, b) => b.current - a.current);

  const curItem  = aggregateBy(curRows,  '품목명');
  const prevItem = aggregateBy(prevRows, '품목명');
  const allItems = new Set([...curItem.keys(), ...prevItem.keys()]);
  const itemStats: ItemStat[] = [...allItems].map(name => {
    const cur  = curItem.get(name)  ?? 0;
    const prev = prevItem.get(name) ?? 0;
    return { name, prev, current: cur, diff: cur - prev, diffPct: prev ? (cur - prev) / prev : 0 };
  });
  const topIncreased = itemStats.filter(x => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 10);
  const topDecreased = itemStats.filter(x => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 10);

  const toCat = (m: Map<string, number>): CatStat[] =>
    [...m.entries()].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount);

  const totalCurrent = sumAmt(curRows);
  const totalPrev    = sumAmt(prevRows);

  return {
    filename,
    period:    excelDateToYM(curM),
    prevPeriod: prevM ? excelDateToYM(prevM) : '',
    totalCurrent,
    totalPrev,
    totalDiff:    totalCurrent - totalPrev,
    totalDiffPct: totalPrev ? (totalCurrent - totalPrev) / totalPrev : 0,
    sogeupAmount: sumAmt(sogeupRows),
    prescriptionCount: new Set(curRows.map(r => r['처방처코드'])).size,
    staffStats,
    topIncreased,
    topDecreased,
    hospitalStats: toCat(aggregateBy(curRows, '병원구분')),
    rxTypes:       toCat(aggregateBy(curRows, '품목구분')),
    dealerStats:   toCat(aggregateBy(curRows, '판매대행처명')).slice(0, 15),
  };
}

/* ── 메인 컴포넌트 ───────────────────────────────────────────── */
export default function PerformanceClient() {
  const [history,        setHistory]        = useState<History>({});
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');
  const [dragging,       setDragging]       = useState(false);
  const [toast,          setToast]          = useState<{ msg: string; kind: 'add' | 'update' } | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* localStorage 복원 */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const hist: History = JSON.parse(saved);
        setHistory(hist);
        const latest = Object.keys(hist).sort().at(-1) ?? null;
        setSelectedPeriod(latest);
      }
    } catch { /* ignore */ }
  }, []);

  function showToast(msg: string, kind: 'add' | 'update') {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  /* 파일 처리 */
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('xlsx / xls 파일만 업로드할 수 있습니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const XLSX = await import('xlsx');
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });

      if (!wb.SheetNames.includes('raw'))
        throw new Error('"raw" 시트를 찾을 수 없습니다. 올바른 마감분석 파일인지 확인해 주세요.');

      const rows   = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['raw'], { defval: '' });
      const result = processRaw(rows, file.name);
      const period = result.period;

      setHistory(prev => {
        const isUpdate = period in prev;
        const updated  = { ...prev, [period]: result };
        saveHistory(updated);
        showToast(
          isUpdate
            ? `${period} 실적이 새 데이터로 업데이트되었습니다.`
            : `${period} 실적이 이력에 추가되었습니다.`,
          isUpdate ? 'update' : 'add',
        );
        return updated;
      });
      setSelectedPeriod(period);
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* 월 이력 삭제 */
  function deletePeriod(period: string) {
    if (!confirm(`${period} 실적 이력을 삭제하시겠습니까?`)) return;
    setHistory(prev => {
      const updated = { ...prev };
      delete updated[period];
      saveHistory(updated);
      return updated;
    });
    setHistory(prev => {
      const remaining = Object.keys(prev).sort();
      if (selectedPeriod === period) {
        setSelectedPeriod(remaining.at(-1) ?? null);
      }
      return prev;
    });
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const periods        = Object.keys(history).sort().reverse(); // 최신순
  const hasHistory     = periods.length > 0;
  const selectedData   = selectedPeriod ? history[selectedPeriod] : null;

  /* ── 업로드 화면 (이력 없을 때) ── */
  if (!hasHistory && !loading) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem 1rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.3rem', fontWeight: 700,
          marginBottom: '0.4rem', color: 'var(--text-primary)' }}>
          📊 마감분석 대시보드
        </h2>
        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
          마감분석 파일의 <strong style={{ color: '#93c5fd' }}>raw 시트</strong>가 포함된 엑셀 파일을 업로드하면<br />
          자동으로 분석 대시보드를 생성합니다.
        </p>
        <DropZone dragging={dragging} inputRef={inputRef}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onInputChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        {error && <ErrorMsg msg={error} />}
      </div>
    );
  }

  /* ── 로딩 ── */
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>데이터 분석 중...</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.4rem' }}>
          대용량 파일은 수 초가 걸릴 수 있습니다.
        </p>
      </div>
    );
  }

  /* ── 대시보드 (이력 있을 때) ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: 'fixed', top: '5rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '0.6rem 1.2rem', borderRadius: 10,
          background: toast.kind === 'add' ? 'rgba(16,185,129,0.18)' : 'rgba(59,130,246,0.18)',
          border: `1px solid ${toast.kind === 'add' ? 'rgba(16,185,129,0.35)' : 'rgba(59,130,246,0.35)'}`,
          color: toast.kind === 'add' ? '#6ee7b7' : '#93c5fd',
          fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.kind === 'add' ? '✅ ' : '🔄 '}{toast.msg}
        </div>
      )}

      {/* 헤더 + 월 탭 */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1rem 1.2rem',
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              📊 마감분석 대시보드
            </h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              이력 {periods.length}개 · 동일 월 업로드 시 덮어쓰기 / 신규 월 업로드 시 이력 추가
            </p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            style={{
              padding: '0.38rem 0.9rem', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
              color: '#93c5fd', fontSize: '0.78rem', fontFamily: 'inherit', fontWeight: 600,
            }}
          >
            ↑ 파일 업로드
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </div>

        {/* 월 탭 */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>실적월</span>
          {periods.map(p => (
            <div key={p} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setSelectedPeriod(p)}
                style={{
                  padding: '0.28rem 0.75rem',
                  borderRadius: '7px 0 0 7px',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.8rem', fontWeight: p === selectedPeriod ? 700 : 400,
                  background: p === selectedPeriod ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${p === selectedPeriod ? 'rgba(59,130,246,0.45)' : 'rgba(255,255,255,0.1)'}`,
                  borderRight: 'none',
                  color: p === selectedPeriod ? '#93c5fd' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {p}
              </button>
              <button
                onClick={() => deletePeriod(p)}
                title={`${p} 이력 삭제`}
                style={{
                  padding: '0.28rem 0.4rem',
                  borderRadius: '0 7px 7px 0',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.65rem',
                  background: p === selectedPeriod ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${p === selectedPeriod ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: 'rgba(255,255,255,0.3)',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {error && <ErrorMsg msg={error} />}
      </div>

      {/* 선택된 월 대시보드 */}
      {selectedData
        ? <Dashboard data={selectedData} />
        : <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>월을 선택하세요.</p>
      }
    </div>
  );
}

/* ── 업로드 드롭존 ───────────────────────────────────────────── */
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
          .xlsx / .xls 형식 지원 · raw 시트 포함 필수
        </p>
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onInputChange} />
    </>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p style={{ marginTop: '0.75rem', color: '#f87171', fontSize: '0.82rem', textAlign: 'center',
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 8, padding: '0.6rem 1rem' }}>
      ⚠ {msg}
    </p>
  );
}

/* ── 대시보드 컴포넌트 ────────────────────────────────────────── */
function Dashboard({ data }: { data: PerfData }) {
  const maxStaff = Math.max(...data.staffStats.map(s => s.current));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* 파일명 */}
      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
        📄 {data.filename}
        {data.prevPeriod && <span> · 전월: {data.prevPeriod} → 당월: <strong style={{ color: '#93c5fd' }}>{data.period}</strong></span>}
      </p>

      {/* KPI 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <KpiCard label="당월 처방금액" value={fmtAmt(data.totalCurrent)} sub={`${data.period} 당월분`} color="#93c5fd" />
        <KpiCard
          label="전월 대비"
          value={fmtAmt(data.totalDiff)}
          sub={`${fmtPct(data.totalDiffPct)} (${data.prevPeriod || '-'} → ${data.period})`}
          color={diffColor(data.totalDiff)}
        />
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
              {data.staffStats.map(s => (
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
                        <div style={{
                          height: '100%', borderRadius: 3,
                          width: maxStaff > 0 ? `${(s.current / maxStaff * 100).toFixed(1)}%` : '0%',
                          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                        }} />
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

      {/* 병원구분 + 원외원내 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <Section title="병원구분별 처방현황">
          <BarChart items={data.hospitalStats} color="#06b6d4" />
        </Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Section title="원외 / 원내 구분">
            <BarChart items={data.rxTypes} color="#a78bfa" />
          </Section>
          <Section title="소급분 현황">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <Row label="소급분 금액"     value={fmtAmt(data.sogeupAmount)} />
              <Row label="당월분 대비 비율"
                value={data.totalCurrent > 0
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

/* ── 서브 컴포넌트 ────────────────────────────────────────────── */
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
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
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
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', width: labelWidth,
            flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.type}>
            {item.type}
          </span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ height: '100%', borderRadius: 4,
              width: max > 0 ? `${(item.amount / max * 100).toFixed(1)}%` : '0%',
              background: color, opacity: 0.8 }} />
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
