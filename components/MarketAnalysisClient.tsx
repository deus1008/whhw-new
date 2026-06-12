'use client';

import { useState, useTransition } from 'react';
import {
  searchUbistItems,
  analyzeUbistItems,
  type UbistSearchItem,
  type UbistProductAnalysis,
} from '@/app/market-analysis/actions';

/* ── 스타일 상수 ─────────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)', fontSize: '16px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', minHeight: '44px',
};

const primaryBtn: React.CSSProperties = {
  padding: '0.62rem 1.4rem', borderRadius: '10px', border: 'none', fontFamily: 'inherit',
  background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))',
  color: '#fff', fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minHeight: '44px',
  whiteSpace: 'nowrap',
};

const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  background: 'rgba(255,255,255,0.1)',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
};

const ALL_HOSP_TYPES = ['상급종합병원', '종합병원', '병원', '의원', '보건소', '기타'] as const;
type HospType = typeof ALL_HOSP_TYPES[number];

/* ── 유틸 ────────────────────────────────────────────────────── */
function fmt백만(won: number): string {
  const mil = won / 1_000_000;
  if (mil === 0) return '0';
  if (mil < 1)   return mil.toFixed(2);
  if (mil < 10)  return mil.toFixed(1);
  return Math.round(mil).toLocaleString('ko-KR');
}

function fmtCount(n: number): string {
  if (!n) return '-';
  return n.toLocaleString('ko-KR');
}

/* ── 월별 꺾은선 차트 (SVG inline) ──────────────────────────── */
function LineChart({ products, periods }: {
  products: { name: string; color: string; values: (number | null)[] }[];
  periods: string[];
}) {
  const W = 640, H = 230, PAD_L = 58, PAD_B = 46, PAD_T = 20, PAD_R = 20;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const allVals = products.flatMap(p => p.values).filter((v): v is number => v != null);
  const maxVal  = Math.max(...allVals, 1);

  const n   = periods.length;
  const xOf = (i: number) => n <= 1 ? PAD_L + chartW / 2 : PAD_L + (chartW / (n - 1)) * i;
  const yOf = (v: number) => PAD_T + chartH * (1 - v / maxVal);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
      {/* Y축 격자 */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = PAD_T + chartH * (1 - t);
        return (
          <g key={t}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
              stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            {t > 0 && (
              <text x={PAD_L - 5} y={y + 4} textAnchor="end"
                fontSize={9} fill="rgba(255,255,255,0.4)">
                {fmt백만(maxVal * t)}
              </text>
            )}
          </g>
        );
      })}

      {/* X축 레이블 + 연도 경계선 */}
      {periods.map((p, i) => {
        const x        = xOf(i);
        const label    = p.slice(2).replace('-', '.');         // "2025-03" → "25.03"
        const thisYear = p.slice(0, 4);
        const prevYear = i > 0 ? periods[i - 1].slice(0, 4) : null;
        const yearChanged = prevYear !== null && thisYear !== prevYear;
        return (
          <g key={p}>
            <text x={x} y={H - PAD_B + 14} textAnchor="middle"
              fontSize={8.5} fill="rgba(255,255,255,0.5)">
              {label}
            </text>
            {yearChanged && (
              <>
                <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + chartH}
                  stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3,3" />
                <text x={x + 3} y={PAD_T + 9} textAnchor="start"
                  fontSize={8} fill="rgba(255,255,255,0.3)">
                  {thisYear}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* 꺾은선 + 점 */}
      {products.map(prod => {
        let d = '';
        let gap = true;
        prod.values.forEach((v, i) => {
          if (v == null) { gap = true; return; }
          d += (gap ? `M${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}` : `L${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`) + ' ';
          gap = false;
        });
        return (
          <g key={prod.name}>
            {d && <path d={d.trim()} fill="none" stroke={prod.color} strokeWidth={2.2}
              strokeLinejoin="round" strokeLinecap="round" />}
            {prod.values.map((v, i) => v != null ? (
              <circle key={i} cx={xOf(i)} cy={yOf(v)} r={3.5}
                fill={prod.color} stroke="rgba(12,12,28,0.9)" strokeWidth={1.2} />
            ) : null)}
          </g>
        );
      })}

      {/* X축 */}
      <line x1={PAD_L} y1={PAD_T + chartH} x2={W - PAD_R} y2={PAD_T + chartH}
        stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      {/* Y축 */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + chartH}
        stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      {/* Y축 레이블 */}
      <text x={12} y={PAD_T + chartH / 2} textAnchor="middle"
        fontSize={9} fill="rgba(255,255,255,0.4)"
        transform={`rotate(-90,12,${PAD_T + chartH / 2})`}>
        백만원
      </text>
    </svg>
  );
}

const PRODUCT_COLORS = [
  '#93c5fd','#86efac','#fde68a','#f9a8d4','#c4b5fd',
  '#6ee7b7','#fca5a5','#fdba74','#a5f3fc','#d9f99d',
];

/* ── 메인 컴포넌트 ───────────────────────────────────────────── */
export default function MarketAnalysisClient() {
  const [query,       setQuery]       = useState('');
  const [inputVal,    setInputVal]    = useState('');
  const [results,     setResults]     = useState<UbistSearchItem[]>([]);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [analysis,    setAnalysis]    = useState<UbistProductAnalysis[] | null>(null);
  const [searched,    setSearched]    = useState(false);
  const [isPending,   startTransition] = useTransition();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error,          setError]          = useState('');
  const [periodLimit,    setPeriodLimit]    = useState(12);   // 0 = 전체
  const [selectedHosp,   setSelectedHosp]  = useState<Set<HospType>>(new Set(ALL_HOSP_TYPES));

  /* ── 검색 ── */
  function handleSearch() {
    const q = inputVal.trim();
    if (!q) return;
    setQuery(q);
    setError('');
    setAnalysis(null);
    startTransition(async () => {
      const items = await searchUbistItems(q);
      setResults(items);
      setSearched(true);
      setSelected(new Set());
      if (items.length === 0) setError('검색 결과가 없습니다. Ubist 폴더에 데이터를 먼저 업로드해 주세요.');
    });
  }

  /* ── 선택 토글 ── */
  function toggle(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === results.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map(r => r.product_name)));
    }
  }

  /* ── 분석 ── */
  async function handleAnalyze() {
    if (!selected.size) return;
    setIsAnalyzing(true);
    setError('');
    try {
      // 전체 선택이면 필터 없음, 일부 선택이면 해당 종별만
      const hospFilter = selectedHosp.size === ALL_HOSP_TYPES.length
        ? []
        : Array.from(selectedHosp);
      const data = await analyzeUbistItems(Array.from(selected), hospFilter);
      setAnalysis(data);
    } catch {
      setError('분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  /* ── 종별 토글 ── */
  function toggleHosp(t: HospType) {
    setSelectedHosp(prev => {
      // 전체 선택 상태에서 개별 항목 클릭 → 해당 항목만 선택
      if (prev.size === ALL_HOSP_TYPES.length) return new Set([t]);
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
        // 마지막 항목 해제 시 전체 선택으로 복귀
        if (next.size === 0) return new Set(ALL_HOSP_TYPES);
      } else {
        next.add(t);
        // 모두 선택되면 전체 선택 상태로 복귀
        if (next.size === ALL_HOSP_TYPES.length) return new Set(ALL_HOSP_TYPES);
      }
      return next;
    });
  }
  function toggleAllHosp() {
    setSelectedHosp(new Set(ALL_HOSP_TYPES));
  }

  /* ── 전체 기간 수집 ── */
  const allPeriods = analysis
    ? Array.from(new Set(analysis.flatMap(p => p.periods.map(r => r.period))))
        .filter(Boolean).sort()
    : [];

  /* ── 표시 기간 (최근 N개월, 0=전체) ── */
  const displayPeriods = periodLimit === 0
    ? allPeriods
    : allPeriods.slice(-periodLimit);

  /* ── 합계 기준 내림차순 정렬 ── */
  const sortedAnalysis = analysis
    ? [...analysis].sort((a, b) => {
        const sum = (prod: typeof a) => {
          const pm = Object.fromEntries(prod.periods.map(r => [r.period, r.total_amount]));
          return displayPeriods.reduce((s, p) => s + (pm[p] ?? 0), 0);
        };
        return sum(b) - sum(a);
      })
    : [];

  /* ── 꺾은선 차트 데이터 (월별 × 제품별) ── */
  const lineProducts = sortedAnalysis.map((prod, i) => {
    const periodMap = Object.fromEntries(prod.periods.map(r => [r.period, r.total_amount]));
    return {
      name:   prod.product_name,
      color:  PRODUCT_COLORS[i % PRODUCT_COLORS.length],
      values: displayPeriods.map(p => periodMap[p] ?? null),
    };
  });

  return (
    <div>
      {/* ── Step 1: 검색 ── */}
      <div className="auth-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
          의약품명 또는 성분명을 입력한 후 검색하세요.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="예: 아나빅스, 암로디핀, 티아렌..."
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button style={primaryBtn} onClick={handleSearch} disabled={isPending}>
            {isPending ? '검색 중…' : '검색'}
          </button>
        </div>
      </div>

      {/* ── Step 2: 검색 결과 + 선택 ── */}
      {searched && results.length > 0 && (
        <div className="auth-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span style={{ color: '#a5b4fc', fontWeight: 700 }}>"{query}"</span> 검색 결과 {results.length}개
              {selected.size > 0 && (
                <span style={{ marginLeft: '0.6rem', color: '#86efac' }}>— {selected.size}개 선택됨</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                style={{ ...disabledBtn, ...(results.length > 0 ? { background: 'rgba(255,255,255,0.08)', cursor: 'pointer', color: 'var(--text-muted)' } : {}), fontSize: '0.8rem', padding: '0.4rem 0.8rem', minHeight: 'auto' }}
                onClick={toggleAll}
              >
                {selected.size === results.length ? '전체 해제' : '전체 선택'}
              </button>
              <button
                style={selected.size > 0 ? primaryBtn : disabledBtn}
                onClick={handleAnalyze}
                disabled={selected.size === 0 || isAnalyzing}
              >
                {isAnalyzing ? '분석 중…' : `분석 (${selected.size}개)`}
              </button>
            </div>
          </div>

          {/* 결과 목록 — 선택 항목 상단 고정, 미선택 항목 하단 */}
          {(() => {
            const selectedItems   = results.filter(r =>  selected.has(r.product_name));
            const unselectedItems = results.filter(r => !selected.has(r.product_name));
            const visibleResults  = [...selectedItems, ...unselectedItems];
            return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '320px', overflowY: 'auto' }}>
            {visibleResults.map(item => (
              <label key={item.product_name} style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.5rem 0.7rem', borderRadius: '8px', cursor: 'pointer',
                background: selected.has(item.product_name) ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected.has(item.product_name) ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                transition: 'all 0.1s',
              }}>
                <input
                  type="checkbox"
                  checked={selected.has(item.product_name)}
                  onChange={() => toggle(item.product_name)}
                  style={{ accentColor: '#818cf8', width: 16, height: 16, flexShrink: 0 }}
                />
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                  {item.product_name}
                </span>
                {item.ingredient_name && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {item.ingredient_name}
                  </span>
                )}
                {item.manufacturer && (
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.7rem', padding: '0.1rem 0.45rem',
                    background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: '999px', color: '#a5b4fc', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {item.manufacturer}
                  </span>
                )}
              </label>
            ))}
          </div>
            );
          })()}
        </div>
      )}

      {/* ── Step 2.5: 종별 선택 ── */}
      {searched && results.length > 0 && (
        <div className="auth-card" style={{ marginBottom: '1rem', padding: '0.65rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              종별
            </span>
            {/* 전체선택 */}
            <div style={{
              display: 'inline-flex',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '8px',
              padding: '2px',
              gap: '2px',
              flexWrap: 'wrap',
            }}>
              <button
                onClick={toggleAllHosp}
                style={{
                  padding: '0.18rem 0.55rem', borderRadius: '6px', border: 'none',
                  fontSize: '0.72rem', fontFamily: 'inherit', cursor: 'pointer',
                  background: selectedHosp.size === ALL_HOSP_TYPES.length
                    ? 'rgba(99,102,241,0.45)' : 'transparent',
                  color: selectedHosp.size === ALL_HOSP_TYPES.length
                    ? '#c7d2fe' : 'var(--text-muted)',
                  fontWeight: selectedHosp.size === ALL_HOSP_TYPES.length ? 700 : 400,
                  transition: 'all 0.12s',
                }}
              >
                전체
              </button>
              {ALL_HOSP_TYPES.map(t => {
                const active = selectedHosp.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleHosp(t)}
                    style={{
                      padding: '0.18rem 0.55rem', borderRadius: '6px', border: 'none',
                      fontSize: '0.72rem', fontFamily: 'inherit', cursor: 'pointer',
                      background: active && selectedHosp.size < ALL_HOSP_TYPES.length
                        ? 'rgba(99,102,241,0.45)' : 'transparent',
                      color: active && selectedHosp.size < ALL_HOSP_TYPES.length
                        ? '#c7d2fe' : 'var(--text-muted)',
                      fontWeight: active && selectedHosp.size < ALL_HOSP_TYPES.length ? 700 : 400,
                      transition: 'all 0.12s',
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 오류 메시지 ── */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* ── Step 3: 분석 결과 ── */}
      {analysis && analysis.length > 0 && (
        <>
          {/* 월별 처방액 꺾은선 차트 */}
          <div className="auth-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>
                월별 처방액 추이 (백만원)
              </p>
              {/* 기간 선택 — 세그먼트 컨트롤 */}
              <div style={{
                display: 'inline-flex',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '8px',
                padding: '2px',
                gap: '2px',
              }}>
                {([3, 6, 12, 0] as const).map(n => {
                  const active = periodLimit === n;
                  const label  = n === 0 ? '전체' : `${n}개월`;
                  return (
                    <button
                      key={n}
                      onClick={() => setPeriodLimit(n)}
                      style={{
                        padding: '0.18rem 0.55rem', borderRadius: '6px', border: 'none',
                        fontSize: '0.72rem', fontFamily: 'inherit', cursor: 'pointer',
                        background: active ? 'rgba(99,102,241,0.45)' : 'transparent',
                        color: active ? '#c7d2fe' : 'var(--text-muted)',
                        fontWeight: active ? 700 : 400,
                        transition: 'all 0.12s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <LineChart periods={displayPeriods} products={lineProducts} />
          </div>

          {/* 범례 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
            {sortedAnalysis.map((p, i) => (
              <span key={p.product_name} style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)',
              }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: PRODUCT_COLORS[i % PRODUCT_COLORS.length], flexShrink: 0 }} />
                {p.product_name}
                {p.manufacturer && (
                  <span style={{ color: 'var(--text-muted)' }}>({p.manufacturer})</span>
                )}
              </span>
            ))}
          </div>

          {/* 기간별 피벗 테이블 — 행: 기간, 열: 제품 */}
          {(() => {
            // 제품별 periodMap 미리 계산
            const prodMaps = sortedAnalysis.map(prod =>
              Object.fromEntries(prod.periods.map(r => [r.period, r.total_amount]))
            );
            // 열합계: 제품별 표시기간 합산
            const colTotals = sortedAnalysis.map((_, i) =>
              displayPeriods.reduce((s, p) => s + (prodMaps[i][p] ?? 0), 0)
            );
            // 행합계: 기간별 전체 제품 합산
            const rowTotals = displayPeriods.map(p =>
              sortedAnalysis.reduce((s, _, i) => s + (prodMaps[i][p] ?? 0), 0)
            );
            const grandTotal = colTotals.reduce((s, v) => s + v, 0);

            return (
              <div className="auth-card" style={{ padding: '1rem', overflowX: 'auto' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                  기간별 처방액 (백만원)
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th style={TH_L}>기간</th>
                      {sortedAnalysis.map((prod, i) => (
                        <th key={prod.product_name} style={TH_R}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: PRODUCT_COLORS[i % PRODUCT_COLORS.length], flexShrink: 0, display: 'inline-block' }} />
                            {prod.product_name}
                          </span>
                          {prod.manufacturer && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                              {prod.manufacturer}
                            </div>
                          )}
                        </th>
                      ))}
                      <th style={{ ...TH_R, color: '#fde68a' }}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPeriods.map((p, pi) => (
                      <tr key={p} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ ...TD_L, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{p}</td>
                        {sortedAnalysis.map((_, i) => (
                          <td key={i} style={TD_R}>
                            {prodMaps[i][p] != null ? fmt백만(prodMaps[i][p]) : '-'}
                          </td>
                        ))}
                        <td style={{ ...TD_R, fontWeight: 700, color: '#fde68a' }}>
                          {fmt백만(rowTotals[pi])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                      <td style={{ ...TD_L, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>합계</td>
                      {colTotals.map((v, i) => (
                        <td key={i} style={{ ...TD_R, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                          {fmt백만(v)}
                        </td>
                      ))}
                      <td style={{ ...TD_R, fontWeight: 700, color: '#fde68a' }}>
                        {fmt백만(grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </>
      )}

      {/* 데이터 없음 */}
      {analysis && analysis.length === 0 && (
        <div className="auth-card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          선택한 품목에 대한 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}

/* ── 테이블 셀 스타일 ── */
const TH_L: React.CSSProperties = {
  textAlign: 'left', padding: '0.5rem 0.6rem',
  color: 'var(--text-muted)', fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  whiteSpace: 'nowrap',
};
const TH_R: React.CSSProperties = {
  ...TH_L, textAlign: 'right', minWidth: 72,
};
const TD_L: React.CSSProperties = {
  padding: '0.45rem 0.6rem', color: '#fff', fontSize: '0.78rem',
  whiteSpace: 'nowrap',
};
const TD_R: React.CSSProperties = {
  ...TD_L, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
};
