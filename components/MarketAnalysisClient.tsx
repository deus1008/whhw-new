'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  findUbistIngredientOptions,
  searchUbistByIngredients,
  analyzeUbistItems,
  type UbistIngredientOption,
  type UbistSearchItem,
  type UbistProductAnalysis,
} from '@/app/market-analysis/actions';

/* ── URL 상태 동기화 유틸 ── */
function readUrlParams() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  return {
    q:      p.get('q') ?? '',
    ingrs:  p.getAll('ingr'),
    prods:  p.getAll('prod'),
    period: p.get('period') !== null ? Number(p.get('period')) : null,
  };
}

function writeUrlParams(params: {
  q: string;
  ingrs: string[];
  prods: string[];
  period: number;
}) {
  const p = new URLSearchParams();
  if (params.q) p.set('q', params.q);
  params.ingrs.forEach(v => p.append('ingr', v));
  params.prods.forEach(v => p.append('prod', v));
  p.set('period', String(params.period));
  window.history.replaceState(null, '', `?${p.toString()}`);
}

/* ── 스타일 상수 ─────────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px',
  background: '#f8fafc', border: '1px solid #e5e9f0',
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
  background: '#e5e9f0',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
};

/* ── 유틸 ────────────────────────────────────────────────────── */
function fmt천원(won: number): string {
  if (!won) return '0';
  return Math.round(won / 1000).toLocaleString('ko-KR');
}

function fmtCount(n: number): string {
  if (!n) return '-';
  return n.toLocaleString('ko-KR');
}

/** CSO 경쟁사 — 'CSO경쟁선택' 버튼이 이 제조사 품목을 자동 선택 */
const CSO_COMPETITORS = ['아주약품', '대웅바이오', '셀트리온', '안국약품', '동구바이오제약', '마더스제약'];

/* ── 월별 꺾은선 차트 (SVG inline) ──────────────────────────── */
function LineChart({ products, periods }: {
  products: { name: string; color: string; values: (number | null)[] }[];
  periods: string[];
}) {
  const W = 820, H = 230, PAD_L = 58, PAD_B = 46, PAD_T = 20, PAD_R = 20;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const allVals = products.flatMap(p => p.values).filter((v): v is number => v != null);
  const maxVal  = Math.max(...allVals, 1);

  const n   = periods.length;
  const xOf = (i: number) => n <= 1 ? PAD_L + chartW / 2 : PAD_L + (chartW / (n - 1)) * i;
  const yOf = (v: number) => PAD_T + chartH * (1 - v / maxVal);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* Y축 격자 */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = PAD_T + chartH * (1 - t);
        return (
          <g key={t}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
              stroke="#f1f5f9" strokeWidth={1} />
            {t > 0 && (
              <text x={PAD_L - 5} y={y + 4} textAnchor="end"
                fontSize={9} fill="#94a3b8">
                {fmt천원(maxVal * t)}
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
              fontSize={8.5} fill="#64748b">
              {label}
            </text>
            {yearChanged && (
              <>
                <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + chartH}
                  stroke="#d7dce5" strokeWidth={1} strokeDasharray="3,3" />
                <text x={x + 3} y={PAD_T + 9} textAnchor="start"
                  fontSize={8} fill="#94a3b8">
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
        stroke="#d7dce5" strokeWidth={1} />
      {/* Y축 */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + chartH}
        stroke="#d7dce5" strokeWidth={1} />
      {/* Y축 레이블 */}
      <text x={12} y={PAD_T + chartH / 2} textAnchor="middle"
        fontSize={9} fill="#94a3b8"
        transform={`rotate(-90,12,${PAD_T + chartH / 2})`}>
        천원
      </text>
    </svg>
  );
}

const PRODUCT_COLORS = [
  '#2563eb','#059669','#b45309','#db2777','#7c3aed',
  '#059669','#dc2626','#c2410c','#0891b2','#d9f99d',
];

/* ── 메인 컴포넌트 ───────────────────────────────────────────── */
export default function MarketAnalysisClient() {
  const [inputVal,          setInputVal]         = useState('');
  const [query,             setQuery]            = useState('');
  // 1단계: 성분명 후보
  const [ingredientOptions, setIngredientOptions] = useState<UbistIngredientOption[]>([]);
  const [selectedIngr,      setSelectedIngr]     = useState<Set<string>>(new Set());
  const [isSearching,       startSearchTransition] = useTransition();
  // 2단계: 품목 목록
  const [results,           setResults]          = useState<UbistSearchItem[]>([]);
  const [selected,          setSelected]         = useState<Set<string>>(new Set());
  const [ingrPickMode,      setIngrPickMode]     = useState(true);   // 성분: true=전체 후보에서 선택, false=선택 성분만 표시
  const [pickMode,          setPickMode]         = useState(true);   // 품목: true=전체목록에서 선택, false=선택 품목만 표시
  const [isLoadingProducts, startProductTransition] = useTransition();
  // 3단계: 분석
  const [analysis,    setAnalysis]    = useState<UbistProductAnalysis[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error,       setError]       = useState('');
  const [periodLimit, setPeriodLimit] = useState(12);

  /* ── URL → 상태 복원 (마운트 1회) ── */
  useEffect(() => {
    const saved = readUrlParams();
    if (!saved || !saved.q) return;

    setInputVal(saved.q);
    setQuery(saved.q);
    if (saved.period !== null) setPeriodLimit(saved.period);

    (async () => {
      const opts = await findUbistIngredientOptions(saved.q);
      setIngredientOptions(opts);

      if (saved.ingrs.length === 0) return;
      setSelectedIngr(new Set(saved.ingrs));

      const items = await searchUbistByIngredients(saved.ingrs);
      setResults(items);

      if (saved.prods.length === 0) return;
      setSelected(new Set(saved.prods));

      const data = await analyzeUbistItems(saved.prods);
      setAnalysis(data);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 상태 → URL 동기화 ── */
  useEffect(() => {
    if (!query) return;
    writeUrlParams({
      q:     query,
      ingrs: Array.from(selectedIngr),
      prods: Array.from(selected),
      period: periodLimit,
    });
  }, [query, selectedIngr, selected, periodLimit]);

  /* ── 1단계: 성분명 후보 검색 ── */
  function handleSearch() {
    const q = inputVal.trim();
    if (!q) return;
    setQuery(q);
    setError('');
    setAnalysis(null);
    setIngredientOptions([]);
    setSelectedIngr(new Set());
    setResults([]);
    setSelected(new Set());
    setIngrPickMode(true);
    setPickMode(true);
    startSearchTransition(async () => {
      const opts = await findUbistIngredientOptions(q);
      setIngredientOptions(opts);
      if (opts.length === 0) setError(`'${q}'에 해당하는 성분·제품을 찾을 수 없습니다. 다른 검색어를 입력해 보세요.`);
    });
  }

  /* ── 2단계: 성분 선택 → 품목 자동 조회 ── */
  function toggleIngredient(ing: string) {
    const next = new Set(selectedIngr);
    if (next.has(ing)) next.delete(ing); else next.add(ing);

    setSelectedIngr(next);
    setSelected(new Set());
    setPickMode(true);
    setAnalysis(null);

    if (next.size === 0) {
      setResults([]);
      setIngrPickMode(true);   // 성분이 비면 다시 전체 후보에서 선택
      return;
    }

    startProductTransition(async () => {
      const items = await searchUbistByIngredients(Array.from(next));
      setResults(items);
    });
  }

  /* ── 선택 토글 ── */
  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSelected(next);
    if (next.size === 0) setPickMode(true);   // 선택이 비면 다시 전체 목록에서 선택
  }

  /* ── CSO 경쟁사 품목 자동 선택 ──
     제조사 표기가 다양('동구 바이오'·'마더스'·'셀트리온제약' 등)해 양방향 포함 매칭.
     빈 제조사는 제외(빈 문자열이 모든 값에 포함되어 오매칭되는 것 방지). */
  function selectCsoCompetitors() {
    const norm = (s: string) => (s ?? '').replace(/[\s()]/g, '');
    const matched = results
      .filter(r => {
        const m = norm(r.manufacturer ?? '');
        if (!m) return false;
        return CSO_COMPETITORS.some(c => { const cn = norm(c); return m.includes(cn) || cn.includes(m); });
      })
      .map(r => r.product_name);
    setSelected(new Set(matched));
  }

  /* ── 분석 ── */
  async function handleAnalyze() {
    if (!selected.size) return;
    setIsAnalyzing(true);
    setError('');
    try {
      const data = await analyzeUbistItems(Array.from(selected));
      setAnalysis(data);
    } catch {
      setError('분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
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
      {/* ── Step 1: 검색 + 성분명 칩 ── */}
      <div className="auth-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
          의약품명 또는 성분명을 입력하면 성분 목록이 표시됩니다.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="예: 아나빅스, 암로디핀, 티아렌..."
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button style={primaryBtn} onClick={handleSearch} disabled={isSearching}>
            {isSearching ? '검색 중…' : '검색'}
          </button>
        </div>

        {/* 성분명 후보 칩 목록 */}
        {ingredientOptions.length > 0 && (
          <div style={{ marginTop: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>
                {(!ingrPickMode && selectedIngr.size > 0)
                  ? <>선택 성분 <span style={{ color: '#059669' }}>{selectedIngr.size}개</span></>
                  : <>성분 선택{selectedIngr.size > 0 && (
                      <span style={{ marginLeft: '0.5rem', color: '#059669' }}>— {selectedIngr.size}개 선택됨</span>
                    )}</>}
                {isLoadingProducts && (
                  <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>품목 조회 중…</span>
                )}
              </p>
              {selectedIngr.size > 0 && (
                (!ingrPickMode)
                  ? <button
                      onClick={() => { setSelectedIngr(new Set()); setResults([]); setSelected(new Set()); setAnalysis(null); setIngrPickMode(true); setPickMode(true); }}
                      style={{ padding: '0.3rem 0.7rem', borderRadius: '8px', fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #e5e9f0', color: 'var(--text-muted)', minHeight: 'auto' }}
                    >↺ 초기화</button>
                  : <button
                      onClick={() => setIngrPickMode(false)}
                      style={{ padding: '0.3rem 0.7rem', borderRadius: '8px', fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer', background: 'rgba(129,140,248,0.25)', border: '1px solid rgba(129,140,248,0.5)', color: '#c7d2fe', fontWeight: 600, minHeight: 'auto' }}
                    >선택 완료 ({selectedIngr.size})</button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {(!ingrPickMode && selectedIngr.size
                ? ingredientOptions.filter(o => selectedIngr.has(o.ingredient_name))
                : ingredientOptions).map(opt => {
                const active = selectedIngr.has(opt.ingredient_name);
                return (
                  <button
                    key={opt.ingredient_name}
                    onClick={() => toggleIngredient(opt.ingredient_name)}
                    style={{
                      padding: '0.3rem 0.65rem', borderRadius: '999px',
                      border: active ? '1px solid rgba(99,102,241,0.5)' : '1px solid #f1f5f9',
                      fontSize: '0.75rem', fontFamily: 'inherit', cursor: 'pointer',
                      background: active ? 'rgba(99,102,241,0.45)' : '#f1f5f9',
                      color: active ? '#c7d2fe' : 'var(--text-muted)',
                      fontWeight: active ? 700 : 400,
                      transition: 'all 0.12s',
                    }}
                  >
                    {opt.ingredient_name}
                    <span style={{ marginLeft: '0.3rem', opacity: 0.6, fontSize: '0.7rem' }}>
                      {opt.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: 품목 목록 + 선택 ── */}
      {results.length > 0 && (
        <div className="auth-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {(!pickMode && selected.size > 0)
                ? <>선택 품목 <span style={{ color: '#059669' }}>{selected.size}개</span></>
                : <>품목 {results.length}개{selected.size > 0 && (
                    <span style={{ marginLeft: '0.6rem', color: '#059669' }}>— {selected.size}개 선택됨</span>
                  )}</>}
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(!pickMode && selected.size > 0) ? (
                /* 선택 품목만 보이는 상태 — 초기화로 다시 선택 */
                <button
                  onClick={() => { setSelected(new Set()); setPickMode(true); }}
                  style={{ ...disabledBtn, background: '#f1f5f9', cursor: 'pointer', color: 'var(--text-muted)', border: '1px solid #e5e9f0', fontSize: '0.8rem', padding: '0.4rem 0.8rem', minHeight: 'auto' }}
                >
                  ↺ 초기화
                </button>
              ) : (
                /* 전체 목록에서 선택하는 상태 */
                <>
                  <button
                    style={{ ...disabledBtn, ...(results.length > 0 ? { background: 'rgba(129,140,248,0.15)', cursor: 'pointer', color: '#4f46e5', border: '1px solid rgba(129,140,248,0.35)' } : {}), fontSize: '0.8rem', padding: '0.4rem 0.8rem', minHeight: 'auto' }}
                    onClick={selectCsoCompetitors}
                    title="아주약품·대웅바이오·셀트리온·안국약품·동구바이오제약·마더스제약 품목 선택"
                  >
                    밴치마킹대상
                  </button>
                  <button
                    style={selected.size > 0 ? primaryBtn : disabledBtn}
                    onClick={() => setPickMode(false)}
                    disabled={selected.size === 0}
                  >
                    선택 완료 ({selected.size})
                  </button>
                </>
              )}
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
            // 선택 완료 상태(pickMode=false, 선택 있음)면 선택 품목만, 아니면 전체(선택 상단 고정)
            const visibleResults  = (!pickMode && selectedItems.length)
              ? selectedItems
              : [...selectedItems, ...unselectedItems];
            return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '320px', overflowY: 'auto' }}>
            {visibleResults.map(item => (
              <label key={item.product_name} style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.5rem 0.7rem', borderRadius: '8px', cursor: 'pointer',
                background: selected.has(item.product_name) ? 'rgba(99,102,241,0.15)' : '#ffffff',
                border: `1px solid ${selected.has(item.product_name) ? 'rgba(99,102,241,0.4)' : '#f1f5f9'}`,
                transition: 'all 0.1s',
              }}>
                <input
                  type="checkbox"
                  checked={selected.has(item.product_name)}
                  onChange={() => toggle(item.product_name)}
                  style={{ accentColor: '#4f46e5', width: 16, height: 16, flexShrink: 0 }}
                />
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>
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
                    borderRadius: '999px', color: '#4f46e5', whiteSpace: 'nowrap', flexShrink: 0,
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

      {/* ── 오류 메시지 ── */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem' }}>
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
                월별 처방액 추이 (천원)
              </p>
              {/* 기간 선택 — 세그먼트 컨트롤 */}
              <div style={{
                display: 'inline-flex',
                background: '#f1f5f9',
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
                fontSize: '0.72rem', color: '#475569',
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
              <div className="auth-card" style={{ padding: '1rem' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                  기간별 처방액 (천원)
                </p>
                <div className="resp-table" style={{ overflowX: 'auto' }}>
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
                      <th style={{ ...TH_R, color: '#b45309' }}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPeriods.map((p, pi) => (
                      <tr key={p} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ ...TD_L, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{p}</td>
                        {sortedAnalysis.map((_, i) => (
                          <td key={i} style={TD_R}>
                            {prodMaps[i][p] != null ? fmt천원(prodMaps[i][p]) : '-'}
                          </td>
                        ))}
                        <td style={{ ...TD_R, fontWeight: 700, color: '#b45309' }}>
                          {fmt천원(rowTotals[pi])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid #d7dce5' }}>
                      <td style={{ ...TD_L, fontWeight: 700, color: '#475569' }}>합계</td>
                      {colTotals.map((v, i) => (
                        <td key={i} style={{ ...TD_R, fontWeight: 700, color: '#475569' }}>
                          {fmt천원(v)}
                        </td>
                      ))}
                      <td style={{ ...TD_R, fontWeight: 700, color: '#b45309' }}>
                        {fmt천원(grandTotal)}
                      </td>
                    </tr>
                    <tr style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ ...TD_L, color: 'var(--text-muted)', fontWeight: 600 }}>점유율</td>
                      {colTotals.map((v, i) => (
                        <td key={i} style={{ ...TD_R, color: 'var(--text-muted)' }}>
                          {grandTotal > 0 ? `${Math.round(v / grandTotal * 100)}%` : '-'}
                        </td>
                      ))}
                      <td style={{ ...TD_R, color: 'var(--text-muted)' }}>100%</td>
                    </tr>
                  </tfoot>
                </table>
                </div>
                <div className="resp-cards">
                  {displayPeriods.map((p, pi) => (
                    <div key={p} className="mcard">
                      <div className="mcard-head">
                        <span className="mcard-title">{p}</span>
                      </div>
                      {sortedAnalysis.map((prod, i) => (
                        <div key={i} className="mcard-row">
                          <span className="mcard-k">{prod.product_name}</span>
                          <span className="mcard-v">
                            {prodMaps[i][p] != null ? fmt천원(prodMaps[i][p]) : '-'}
                          </span>
                        </div>
                      ))}
                      <div className="mcard-row">
                        <span className="mcard-k">합계</span>
                        <span className="mcard-v">{fmt천원(rowTotals[pi])}</span>
                      </div>
                    </div>
                  ))}
                  <div className="mcard">
                    <div className="mcard-head">
                      <span className="mcard-title">합계 · 점유율</span>
                    </div>
                    {sortedAnalysis.map((prod, i) => (
                      <div key={i} className="mcard-row">
                        <span className="mcard-k">{prod.product_name}</span>
                        <span className="mcard-v">
                          {fmt천원(colTotals[i])}
                          {' '}({grandTotal > 0 ? Math.round(colTotals[i] / grandTotal * 100) : 0}%)
                        </span>
                      </div>
                    ))}
                    <div className="mcard-row">
                      <span className="mcard-k">전체</span>
                      <span className="mcard-v">{fmt천원(grandTotal)} (100%)</span>
                    </div>
                  </div>
                </div>
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
  borderBottom: '1px solid #e5e9f0',
  whiteSpace: 'nowrap',
};
const TH_R: React.CSSProperties = {
  ...TH_L, textAlign: 'right', minWidth: 72,
};
const TD_L: React.CSSProperties = {
  padding: '0.45rem 0.6rem', color: '#111827', fontSize: '0.78rem',
  whiteSpace: 'nowrap',
};
const TD_R: React.CSSProperties = {
  ...TD_L, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
};
