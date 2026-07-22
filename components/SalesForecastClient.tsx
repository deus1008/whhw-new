'use client';

import { useState, useMemo, useCallback } from 'react';
import { proposeForecast, saveForecast, deleteForecast, getActuals, refineForecast } from '@/app/sales-forecast/actions';
import { deriveYears, paybackPeriod, trendForecast } from '@/lib/sales-forecast/derive';
import CommaNumberInput from '@/components/CommaNumberInput';
import type { MarketData, ForecastPlan, ForecastYear } from '@/lib/sales-forecast/types';

export type SavedForecast = {
  id: string;
  ingredient_key: string;
  product_name: string;
  insurance_code: string | null;
  launch_price: number | null;
  insurance_price: number | null;
  price_factor: number;
  cost_ratio: number | null;
  commission_rate: number | null;
  pack_units: { label: string; tabsPerBox: number }[];
  manufacturing_lot: number | null;
  dev_cost: number | null;
  years: ForecastYear[];
  ai_rationale: string | null;
  status: 'draft' | 'confirmed';
  updated_at: string;
};

/* ── 표 스타일(DiseaseLearningClient 이식) ── */
const TH: React.CSSProperties = { padding: '0.4rem 0.6rem', textAlign: 'left', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.1)' };
const TD: React.CSSProperties = { padding: '0.45rem 0.6rem', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.76rem', verticalAlign: 'middle' };
const NUM: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const eok = (n: number | null | undefined) => n == null ? '-' : (n / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const won = (n: number | null | undefined) => n == null ? '-' : Math.round(n).toLocaleString('ko-KR');
const pct = (n: number | null | undefined, d = 1) => n == null ? '-' : `${(n * 100).toFixed(d)}%`;

type Tab = 'market' | 'build' | 'compare';

export default function SalesForecastClient({ saved, canEdit }: { saved: SavedForecast[]; canEdit: boolean }) {
  const [tab, setTab] = useState<Tab>('market');
  const [savedList, setSavedList] = useState(saved);

  // 공유 상태: 선택 성분·시장데이터
  const [ingredientKey, setIngredientKey] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {([['market', '시장분석'], ['build', 'SF 산출'], ['compare', '실적비교']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding: '0.5rem 1.1rem', borderRadius: '9px', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid', fontWeight: tab === k ? 700 : 500,
              borderColor: tab === k ? 'rgba(147,197,253,0.45)' : 'rgba(255,255,255,0.12)',
              background: tab === k ? 'rgba(147,197,253,0.14)' : 'rgba(255,255,255,0.03)',
              color: tab === k ? '#93c5fd' : 'rgba(255,255,255,0.5)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'market' && (
        <MarketTab ingredientKey={ingredientKey} setIngredientKey={setIngredientKey} market={market} setMarket={setMarket} onGoBuild={() => setTab('build')} />
      )}
      {tab === 'build' && (
        <BuildTab market={market} ingredientKey={ingredientKey} canEdit={canEdit}
          onSaved={(f) => { setSavedList(prev => [f, ...prev.filter(x => x.id !== f.id)]); setTab('compare'); }} />
      )}
      {tab === 'compare' && (
        <CompareTab saved={savedList} canEdit={canEdit}
          onDeleted={(id) => setSavedList(prev => prev.filter(x => x.id !== id))}
          onUpdated={(f) => setSavedList(prev => prev.map(x => x.id === f.id ? f : x))} />
      )}
    </div>
  );
}

/* ══════════════ 시장분석 탭 ══════════════ */
function MarketTab({ ingredientKey, setIngredientKey, market, setMarket, onGoBuild }: {
  ingredientKey: string | null; setIngredientKey: (k: string | null) => void;
  market: MarketData | null; setMarket: (m: MarketData | null) => void; onGoBuild: () => void;
}) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (q.trim().length < 2) return;
    setSearching(true); setErr(null);
    try {
      const res = await fetch(`/api/sales-forecast?mode=ingredients&q=${encodeURIComponent(q.trim())}`);
      const j = await res.json();
      setList(j.ingredients ?? []);
    } catch { setErr('검색 실패'); } finally { setSearching(false); }
  }, [q]);

  const loadMarket = useCallback(async (key: string) => {
    setIngredientKey(key); setLoading(true); setErr(null); setMarket(null);
    try {
      const res = await fetch(`/api/sales-forecast?mode=market&key=${encodeURIComponent(key)}`);
      const j = await res.json();
      if (j.error) setErr(j.error); else setMarket(j.market);
    } catch { setErr('시장 데이터 조회 실패'); } finally { setLoading(false); }
  }, [setIngredientKey, setMarket]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="성분 검색 (예: finasteride, rosuvastatin)"
          style={{ flex: 1, minWidth: 240, padding: '0.55rem 0.9rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '9px', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={search} disabled={searching}
          style={{ padding: '0.55rem 1.1rem', borderRadius: '9px', border: '1px solid rgba(147,197,253,0.4)', background: 'rgba(147,197,253,0.14)', color: '#93c5fd', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          {searching ? '검색 중…' : '검색'}
        </button>
      </div>

      {list.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {list.map(ing => (
            <button key={ing} onClick={() => loadMarket(ing)}
              style={{ padding: '0.35rem 0.7rem', borderRadius: '7px', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid', borderColor: ingredientKey === ing ? 'rgba(110,231,183,0.45)' : 'rgba(255,255,255,0.12)',
                background: ingredientKey === ing ? 'rgba(110,231,183,0.14)' : 'rgba(255,255,255,0.03)',
                color: ingredientKey === ing ? '#6ee7b7' : 'rgba(255,255,255,0.55)' }}>
              {ing}
            </button>
          ))}
        </div>
      )}

      {err && <div style={{ color: '#fca5a5', fontSize: '0.8rem' }}>{err}</div>}
      {loading && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', padding: '1rem 0' }}>시장 데이터 집계 중…</div>}

      {market && <MarketTable market={market} onGoBuild={onGoBuild} />}
    </div>
  );
}

function MarketTable({ market, onGoBuild }: { market: MarketData; onGoBuild: () => void }) {
  const { years, products, marketTotalByYear, referenceShare, avgCommission, note } = market;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Stat label="경쟁 품목" value={`${products.length}개`} color="#93c5fd" />
        <Stat label={`${years[years.length - 1] ?? '-'}년 시장`} value={`${eok(marketTotalByYear[years[years.length - 1]])}억`} color="#6ee7b7" />
        <Stat label="대조약 점유율" value={pct(referenceShare)} color="#fbbf24" />
        <Stat label="평균 수수료율" value={pct(avgCommission, 0)} color="#f9a8d4" />
        <button onClick={onGoBuild} style={{ marginLeft: 'auto', padding: '0.4rem 0.9rem', borderRadius: '8px', border: '1px solid rgba(147,197,253,0.4)', background: 'rgba(147,197,253,0.14)', color: '#93c5fd', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>이 성분으로 SF 산출 →</button>
      </div>

      {note && <div style={{ fontSize: '0.75rem', color: 'rgba(251,191,36,0.85)', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: '8px', padding: '0.55rem 0.8rem' }}>⚠ {note}</div>}

      <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              <th style={{ ...TH, textAlign: 'center' }}>#</th>
              <th style={TH}>제품</th>
              <th style={TH}>제조사</th>
              <th style={{ ...TH, ...NUM }}>약가</th>
              <th style={{ ...TH, ...NUM }}>수수료율</th>
              {years.map(y => <th key={y} style={{ ...TH, ...NUM }}>{y}(억)</th>)}
              <th style={{ ...TH, ...NUM }}>Share</th>
              <th style={{ ...TH, ...NUM }}>CAGR</th>
            </tr>
          </thead>
          <tbody>
            {/* 시장 합계 — 헤더 바로 밑에 고정 */}
            <tr style={{ background: 'rgba(147,197,253,0.08)', fontWeight: 700, borderBottom: '2px solid rgba(147,197,253,0.25)' }}>
              <td style={TD}></td>
              <td style={{ ...TD, color: '#93c5fd' }} colSpan={3}>시장 합계</td>
              <td style={TD}></td>
              {years.map(y => <td key={y} style={{ ...TD, ...NUM, color: '#93c5fd' }}>{eok(marketTotalByYear[y])}</td>)}
              <td style={TD} colSpan={2}></td>
            </tr>
            {products.map((p, i) => (
              <tr key={`${p.product_name}|${p.manufacturer}`} style={{ background: p.is_reference ? 'rgba(251,191,36,0.08)' : i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ ...TD, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>{i + 1}</td>
                <td style={{ ...TD, color: p.is_reference ? '#fbbf24' : '#e2e8f0', fontWeight: p.is_reference ? 600 : 400 }}>
                  {p.product_name}{p.is_reference && <span style={{ fontSize: '0.62rem', marginLeft: 4 }}>대조약</span>}
                </td>
                <td style={{ ...TD, color: 'rgba(255,255,255,0.5)' }}>{p.manufacturer ?? '-'}</td>
                <td style={{ ...TD, ...NUM }}>{p.price != null ? `${won(p.price)}원` : '-'}</td>
                <td style={{ ...TD, ...NUM, color: p.commission_rate != null ? '#f9a8d4' : 'rgba(255,255,255,0.25)' }}>{pct(p.commission_rate, 0)}</td>
                {years.map(y => <td key={y} style={{ ...TD, ...NUM }}>{p.amountByYear[y] ? eok(p.amountByYear[y]) : '-'}</td>)}
                <td style={{ ...TD, ...NUM, color: '#a5f3fc' }}>{pct(p.share)}</td>
                <td style={{ ...TD, ...NUM, color: p.cagr != null ? (p.cagr >= 0 ? '#6ee7b7' : '#fca5a5') : 'rgba(255,255,255,0.25)' }}>{p.cagr != null ? pct(p.cagr, 0) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════ SF 산출 탭 ══════════════ */
const DEFAULT_PACKS = [{ label: '30T', tabsPerBox: 30 }, { label: '100T', tabsPerBox: 100 }];

function BuildTab({ market, ingredientKey, canEdit, onSaved }: {
  market: MarketData | null; ingredientKey: string | null; canEdit: boolean;
  onSaved: (f: SavedForecast) => void;
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [productName, setProductName] = useState('');
  const [insuranceCode, setInsuranceCode] = useState('');
  const [launchPrice, setLaunchPrice] = useState<number>(700);
  const [insurancePrice, setInsurancePrice] = useState<number>(700);
  const [priceFactor, setPriceFactor] = useState<number>(0.93);
  const [costRatio, setCostRatio] = useState<number>(0.5);
  const [commissionRate, setCommissionRate] = useState<number>(0.5);
  const [packs] = useState(DEFAULT_PACKS);
  const [lot, setLot] = useState<number>(500000);
  const [devCost, setDevCost] = useState<number>(0);
  const [years, setYears] = useState<ForecastYear[]>([]);
  const [rationale, setRationale] = useState('');
  const [proposing, setProposing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selProdIdx, setSelProdIdx] = useState<number>(-1);   // 기존품목: 선택된 시장 제품

  // 가격 기준: 신규발매는 발매예상약가, 기존품목은 선택 제품의 약가
  const priceBasis = mode === 'new' ? launchPrice : insurancePrice;
  const plan: ForecastPlan = useMemo(() => ({
    launchPrice, insurancePrice: priceBasis, priceFactor, costRatio, commissionRate,
    packUnits: packs, manufacturingLot: lot, devCost,
  }), [launchPrice, priceBasis, priceFactor, costRatio, commissionRate, packs, lot, devCost]);

  const derived = useMemo(() => deriveYears(years, plan), [years, plan]);
  const payback = useMemo(() => paybackPeriod(devCost || null, derived), [devCost, derived]);

  // 신규발매: AI 시장 제안
  async function onPropose() {
    if (!ingredientKey) { setMsg('먼저 시장분석 탭에서 성분을 선택하세요'); return; }
    setProposing(true); setMsg(null);
    const r = await proposeForecast(ingredientKey, plan);
    setProposing(false);
    if (!r.ok || !r.proposal) { setMsg(r.error ?? 'AI 제안 실패'); return; }
    setYears(r.proposal.years);
    setRationale(r.proposal.rationale);
  }

  // 기존품목: 시장 제품 선택 → 약가·수수료율·보험코드·품목명 자동 채움
  function pickExisting(idx: number) {
    setSelProdIdx(idx);
    const p = market?.products[idx];
    if (!p) return;
    setProductName(p.product_name);
    setInsuranceCode(p.insurance_code ?? '');
    if (p.price != null) { setInsurancePrice(p.price); setLaunchPrice(p.price); }
    if (p.commission_rate != null) setCommissionRate(p.commission_rate);
    setYears([]); setRationale('');
  }

  // 기존품목: 처방트렌드 자동산출 (모멘텀 반영)
  function onTrend() {
    const p = market?.products[selProdIdx];
    if (!market || !p) { setMsg('대상 제품을 선택하세요'); return; }
    setYears(trendForecast(p.amountByYear, market.years, p.cagr, p.recentGrowth));
    const c = p.cagr, r = p.recentGrowth;
    setRationale(`${p.product_name}의 과거 처방트렌드(${market.years[0]}~${market.years[market.years.length - 1]})를 기준으로 향후 5년 추정. `
      + `${c == null ? '장기추세 산정불가' : `CAGR ${(c * 100).toFixed(0)}%`}`
      + `${r == null ? '' : ` · 최근 YoY ${(r * 100).toFixed(0)}%(${r >= (c ?? 0) ? '가속' : '감속'})`}`
      + ` 반영, 이후 연차는 장기추세로 평균회귀.`);
  }

  // 기존품목: AI 보정
  async function onRefine() {
    if (!ingredientKey || !years.length) { setMsg('먼저 트렌드를 산출하세요'); return; }
    setProposing(true); setMsg(null);
    const r = await refineForecast(ingredientKey, productName || '해당 품목', years);
    setProposing(false);
    if (!r.ok || !r.years) { setMsg(r.error ?? 'AI 보정 실패'); return; }
    setYears(r.years);
    setRationale(prev => `${prev}\n[AI 보정] ${r.rationale ?? ''}`);
  }

  function editAmount(y: number, v: number) {
    setYears(prev => prev.map(row => row.y === y ? { ...row, amount: v } : row));
  }

  async function onSave(status: 'draft' | 'confirmed') {
    if (!ingredientKey) { setMsg('성분 미선택'); return; }
    if (!productName.trim()) { setMsg('당사 품목명을 입력하세요'); return; }
    if (!years.length) { setMsg('예측을 먼저 생성하세요'); return; }
    setSaving(true); setMsg(null);
    const r = await saveForecast({
      ingredient_key: ingredientKey, product_name: productName.trim(),
      insurance_code: insuranceCode.trim() || null,
      launch_price: launchPrice, insurance_price: insurancePrice, price_factor: priceFactor,
      cost_ratio: costRatio, commission_rate: commissionRate, pack_units: packs,
      manufacturing_lot: lot, dev_cost: devCost || null, years,
      ai_rationale: rationale || null, market_snapshot: market ?? null, status,
    });
    setSaving(false);
    if (!r.ok || !r.id) { setMsg(r.error ?? '저장 실패'); return; }
    onSaved({
      id: r.id, ingredient_key: ingredientKey, product_name: productName.trim(),
      insurance_code: insuranceCode.trim() || null, launch_price: launchPrice,
      insurance_price: insurancePrice, price_factor: priceFactor, cost_ratio: costRatio,
      commission_rate: commissionRate, pack_units: packs, manufacturing_lot: lot,
      dev_cost: devCost || null, years, ai_rationale: rationale || null, status,
      updated_at: new Date().toISOString(),
    });
  }

  if (!ingredientKey) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: '12px' }}>
      먼저 <b style={{ color: '#93c5fd' }}>시장분석</b> 탭에서 성분을 선택하세요.
    </div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>대상 성분: <b style={{ color: '#6ee7b7' }}>{ingredientKey}</b></div>

      {/* 유형 선택 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([['new', '신규 발매품목', '예상약가·원가·수수료 입력 → AI 시장 제안'], ['existing', '기존 품목', '제품 선택 → 처방트렌드 자동산출']] as [typeof mode, string, string][]).map(([k, label, hint]) => (
          <button key={k} onClick={() => { setMode(k); setYears([]); setRationale(''); setMsg(null); }} title={hint}
            style={{ padding: '0.45rem 1rem', borderRadius: 9, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid', fontWeight: mode === k ? 700 : 500,
              borderColor: mode === k ? 'rgba(110,231,183,0.45)' : 'rgba(255,255,255,0.12)',
              background: mode === k ? 'rgba(110,231,183,0.14)' : 'rgba(255,255,255,0.03)',
              color: mode === k ? '#6ee7b7' : 'rgba(255,255,255,0.5)' }}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'new' ? (
        <>
          {/* 신규발매 입력 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.6rem' }}>
            <Field label="당사 품목명"><input value={productName} onChange={e => setProductName(e.target.value)} style={inp} placeholder="예: 아주피나스테리드정" /></Field>
            <Field label="발매예상약가(원)"><CommaNumberInput value={launchPrice} onChange={setLaunchPrice} style={inp} /></Field>
            <Field label="원가율(0~1)"><input type="number" step="0.01" value={costRatio} onChange={e => setCostRatio(+e.target.value)} style={inp} /></Field>
            <Field label="예상수수료율(0~1)"><input type="number" step="0.01" value={commissionRate} onChange={e => setCommissionRate(+e.target.value)} style={inp} /></Field>
            <Field label="개발비(원)"><CommaNumberInput value={devCost} onChange={setDevCost} style={inp} allowEmpty /></Field>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={onPropose} disabled={proposing}
              style={{ padding: '0.55rem 1.2rem', borderRadius: '9px', border: '1px solid rgba(167,139,250,0.45)', background: 'rgba(167,139,250,0.16)', color: '#c4b5fd', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              {proposing ? 'AI 분석 중…' : '🤖 AI 예측 제안'}
            </button>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>순공급가 = {won(priceBasis / 1.1 * priceFactor)}원 / 정 (발매예상약가 기준)</span>
          </div>
        </>
      ) : (
        <>
          {/* 기존품목: 제품 선택 → 약가·수수료율 자동, 트렌드 산출 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.6rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: '1 / -1' }}>
              <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)' }}>대상 제품(시장 목록에서 선택)</span>
              <select value={selProdIdx} onChange={e => pickExisting(+e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                <option value={-1}>— 제품 선택 —</option>
                {(market?.products ?? []).map((p, i) => (
                  <option key={i} value={i}>{p.product_name} ({p.manufacturer ?? '-'}) · 약가 {p.price != null ? p.price.toLocaleString('ko-KR') : '-'}</option>
                ))}
              </select>
            </label>
            <Field label="약가(원, 자동)"><CommaNumberInput value={insurancePrice} onChange={setInsurancePrice} style={inp} /></Field>
            <Field label="수수료율(0~1, 자동)"><input type="number" step="0.01" value={commissionRate} onChange={e => setCommissionRate(+e.target.value)} style={inp} /></Field>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={onTrend} disabled={selProdIdx < 0}
              style={{ padding: '0.55rem 1.2rem', borderRadius: '9px', border: '1px solid rgba(110,231,183,0.45)', background: 'rgba(110,231,183,0.16)', color: '#6ee7b7', fontSize: '0.85rem', cursor: selProdIdx < 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, opacity: selProdIdx < 0 ? 0.5 : 1 }}>
              📈 처방트렌드 자동산출
            </button>
            <button onClick={onRefine} disabled={!years.length || proposing}
              style={{ padding: '0.55rem 1.2rem', borderRadius: '9px', border: '1px solid rgba(167,139,250,0.45)', background: 'rgba(167,139,250,0.16)', color: '#c4b5fd', fontSize: '0.85rem', cursor: !years.length ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 600, opacity: !years.length ? 0.5 : 1 }}>
              {proposing ? 'AI 보정 중…' : '🤖 AI 보정'}
            </button>
            {selProdIdx >= 0 && market?.products[selProdIdx] && (
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
                최근 실적: {market.years.map(y => `${y} ${eok(market.products[selProdIdx].amountByYear[y] ?? 0)}억`).join(' · ')}
              </span>
            )}
          </div>
        </>
      )}

      {msg && <div style={{ color: '#fca5a5', fontSize: '0.8rem' }}>{msg}</div>}

      {rationale && (
        <div style={{ fontSize: '0.78rem', lineHeight: 1.7, color: 'rgba(255,255,255,0.65)', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '10px', padding: '0.7rem 0.95rem', whiteSpace: 'pre-wrap' }}>
          <b style={{ color: '#c4b5fd' }}>산출 근거</b><br />{rationale}
        </div>
      )}

      {years.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={TH}>구분</th>
                {derived.map(d => <th key={d.y} style={{ ...TH, ...NUM }}>{d.y}Y</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...TD, color: '#93c5fd', fontWeight: 600 }}>금액(원)</td>
                {derived.map(d => (
                  <td key={d.y} style={{ ...TD, ...NUM }}>
                    <CommaNumberInput value={d.amount} onChange={v => editAmount(d.y, v)}
                      style={{ width: 110, textAlign: 'right', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#e2e8f0', fontSize: '0.74rem', padding: '2px 6px', fontFamily: 'inherit' }} />
                  </td>
                ))}
              </tr>
              <tr><td style={{ ...TD, color: 'rgba(255,255,255,0.5)' }}>금액(억)</td>{derived.map(d => <td key={d.y} style={{ ...TD, ...NUM }}>{eok(d.amount)}</td>)}</tr>
              <tr><td style={{ ...TD, color: 'rgba(255,255,255,0.5)' }}>성장률</td>{derived.map(d => <td key={d.y} style={{ ...TD, ...NUM, color: d.growth == null ? 'rgba(255,255,255,0.25)' : d.growth >= 0 ? '#6ee7b7' : '#fca5a5' }}>{d.growth == null ? '-' : pct(d.growth, 0)}</td>)}</tr>
              {/* 정 수량·박스·마진은 순공급가·원가율·포장 입력이 필요한 신규발매 전용 */}
              {mode === 'new' && <>
                <tr><td style={{ ...TD, color: 'rgba(255,255,255,0.5)' }}>정 수량</td>{derived.map(d => <td key={d.y} style={{ ...TD, ...NUM }}>{won(d.tablets)}</td>)}</tr>
                {packs.map(pk => (
                  <tr key={pk.label}><td style={{ ...TD, color: 'rgba(255,255,255,0.4)' }}>{pk.label} 박스</td>{derived.map(d => <td key={d.y} style={{ ...TD, ...NUM }}>{won(d.boxesByPack[pk.label])}</td>)}</tr>
                ))}
                <tr><td style={{ ...TD, color: 'rgba(255,255,255,0.5)' }}>마진(억)</td>{derived.map(d => <td key={d.y} style={{ ...TD, ...NUM, color: '#a5f3fc' }}>{eok(d.grossProfit)}</td>)}</tr>
              </>}
            </tbody>
          </table>
        </div>
      )}

      {years.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Stat label="5년 누적매출" value={`${eok(derived.reduce((s, d) => s + d.amount, 0))}억`} color="#93c5fd" />
          {mode === 'new' && (
            <Stat label="개발비 회수" value={payback == null ? '5년내 미회수' : payback <= 0 ? '즉시' : `${payback.toFixed(1)}년`} color="#fbbf24" />
          )}
          {canEdit ? (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={() => onSave('draft')} disabled={saving} style={btn('#93c5fd')}>{saving ? '저장 중…' : '초안 저장'}</button>
              <button onClick={() => onSave('confirmed')} disabled={saving} style={btn('#6ee7b7')}>확정 저장</button>
            </div>
          ) : <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>저장 권한 없음(조회 전용)</span>}
        </div>
      )}
    </div>
  );
}

/* ══════════════ 실적비교 탭 ══════════════ */
function CompareTab({ saved, canEdit, onDeleted, onUpdated }: { saved: SavedForecast[]; canEdit: boolean; onDeleted: (id: string) => void; onUpdated: (f: SavedForecast) => void }) {
  const [selId, setSelId] = useState<string | null>(saved[0]?.id ?? null);
  const [actuals, setActuals] = useState<{ byYear: Record<string, number>; byMonth: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 입력값 수정(결과값 유지) — 허가 시점에 제품명·보험코드 확정 등
  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState(''); const [eCode, setECode] = useState('');
  const [eLaunch, setELaunch] = useState(0); const [ePrice, setEPrice] = useState(0);
  const [eCost, setECost] = useState(0); const [eComm, setEComm] = useState(0); const [eDev, setEDev] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false); const [editErr, setEditErr] = useState<string | null>(null);

  const sel = saved.find(s => s.id === selId) ?? null;

  function startEdit(f: SavedForecast) {
    setEName(f.product_name); setECode(f.insurance_code ?? '');
    setELaunch(f.launch_price ?? 0); setEPrice(f.insurance_price ?? 0);
    setECost(f.cost_ratio ?? 0); setEComm(f.commission_rate ?? 0); setEDev(f.dev_cost ?? 0);
    setEditErr(null); setEditing(true);
  }
  async function saveEdit() {
    if (!sel) return;
    if (!eName.trim()) { setEditErr('제품명을 입력하세요'); return; }
    setSavingEdit(true); setEditErr(null);
    const r = await saveForecast({
      id: sel.id, ingredient_key: sel.ingredient_key, product_name: eName.trim(),
      insurance_code: eCode.trim() || null,
      launch_price: eLaunch || null, insurance_price: ePrice || null, price_factor: sel.price_factor,
      cost_ratio: eCost || null, commission_rate: eComm || null, pack_units: sel.pack_units,
      manufacturing_lot: sel.manufacturing_lot, dev_cost: eDev || null,
      years: sel.years, ai_rationale: sel.ai_rationale, market_snapshot: null, status: sel.status,
    });
    setSavingEdit(false);
    if (!r.ok) { setEditErr(r.error ?? '저장 실패'); return; }
    onUpdated({
      ...sel, product_name: eName.trim(), insurance_code: eCode.trim() || null,
      launch_price: eLaunch || null, insurance_price: ePrice || null,
      cost_ratio: eCost || null, commission_rate: eComm || null, dev_cost: eDev || null,
      updated_at: new Date().toISOString(),
    });
    setEditing(false);
  }

  const load = useCallback(async (f: SavedForecast) => {
    setActuals(null); setErr(null);
    if (!f.insurance_code) { setErr('이 SF에 보험코드가 없어 실측을 매칭할 수 없습니다(미출시 품목 등).'); return; }
    setLoading(true);
    const r = await getActuals(f.insurance_code);
    setLoading(false);
    if (!r.ok) { setErr(r.error ?? '실측 조회 실패'); return; }
    setActuals({ byYear: r.byYear ?? {}, byMonth: r.byMonth ?? {} });
  }, []);

  if (!saved.length) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: '12px' }}>저장된 SF가 없습니다. <b style={{ color: '#93c5fd' }}>SF 산출</b> 탭에서 먼저 저장하세요.</div>;
  }

  const actualYears = actuals ? Object.keys(actuals.byYear).sort() : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {saved.map(s => (
          <button key={s.id} onClick={() => { setSelId(s.id); load(s); }}
            style={{ padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid',
              borderColor: selId === s.id ? 'rgba(147,197,253,0.45)' : 'rgba(255,255,255,0.12)',
              background: selId === s.id ? 'rgba(147,197,253,0.14)' : 'rgba(255,255,255,0.03)',
              color: selId === s.id ? '#93c5fd' : 'rgba(255,255,255,0.55)' }}>
            {s.product_name}<span style={{ marginLeft: 5, fontSize: '0.62rem', opacity: 0.6 }}>{s.status === 'confirmed' ? '확정' : '초안'}</span>
          </button>
        ))}
      </div>

      {sel && (
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>
          성분 <b style={{ color: '#6ee7b7' }}>{sel.ingredient_key}</b> · 품목 <b style={{ color: '#e2e8f0' }}>{sel.product_name}</b>
          {sel.insurance_code && <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.4)' }}>· 보험코드 {sel.insurance_code}</span>}
          {sel.ai_rationale && <div style={{ marginTop: 6, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)' }}>{sel.ai_rationale}</div>}
        </div>
      )}

      {/* 입력값 수정 — 예측 결과(연도별 금액)는 유지, 제품명·보험코드 등 입력만 수정 */}
      {sel && editing && (
        <div style={{ border: '1px solid rgba(147,197,253,0.25)', background: 'rgba(147,197,253,0.05)', borderRadius: 10, padding: '0.8rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#93c5fd', fontWeight: 600 }}>입력값 수정 (예측 결과는 그대로 유지됩니다)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.6rem' }}>
            <Field label="제품명"><input value={eName} onChange={e => setEName(e.target.value)} style={inp} placeholder="허가 확정 제품명" /></Field>
            <Field label="보험코드(실적매칭)"><input value={eCode} onChange={e => setECode(e.target.value)} style={inp} placeholder="9자리" /></Field>
            <Field label="발매예상약가(원)"><CommaNumberInput value={eLaunch} onChange={setELaunch} style={inp} allowEmpty /></Field>
            <Field label="약가(원)"><CommaNumberInput value={ePrice} onChange={setEPrice} style={inp} allowEmpty /></Field>
            <Field label="원가율(0~1)"><input type="number" step="0.01" value={eCost} onChange={e => setECost(+e.target.value)} style={inp} /></Field>
            <Field label="수수료율(0~1)"><input type="number" step="0.01" value={eComm} onChange={e => setEComm(+e.target.value)} style={inp} /></Field>
            <Field label="개발비(원)"><CommaNumberInput value={eDev} onChange={setEDev} style={inp} allowEmpty /></Field>
          </div>
          {editErr && <div style={{ color: '#fca5a5', fontSize: '0.78rem' }}>{editErr}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={saveEdit} disabled={savingEdit} style={btn('#6ee7b7')}>{savingEdit ? '저장 중…' : '저장'}</button>
            <button onClick={() => setEditing(false)} disabled={savingEdit} style={btn('rgba(255,255,255,0.4)')}>취소</button>
          </div>
        </div>
      )}

      {err && <div style={{ color: '#fca5a5', fontSize: '0.8rem' }}>{err}</div>}
      {loading && <div style={{ color: 'rgba(255,255,255,0.4)' }}>실측 집계 중…</div>}

      {/* 예측 vs 실측 */}
      {sel && (
        <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={TH}>구분</th>
                {sel.years.map(y => <th key={y.y} style={{ ...TH, ...NUM }}>{y.y}Y</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ ...TD, color: '#93c5fd', fontWeight: 600 }}>예측(억)</td>{sel.years.map(y => <td key={y.y} style={{ ...TD, ...NUM }}>{eok(y.amount)}</td>)}</tr>
              {actuals && (() => {
                // 실측 연도를 예측 연차에 순서대로 정렬(1Y=가장 이른 실측연도)
                const actArr = actualYears.map(y => actuals.byYear[y]);
                return <>
                  <tr><td style={{ ...TD, color: '#6ee7b7', fontWeight: 600 }}>실측(억)</td>{sel.years.map((y, i) => <td key={y.y} style={{ ...TD, ...NUM }}>{actArr[i] != null ? eok(actArr[i]) : '-'}</td>)}</tr>
                  <tr><td style={{ ...TD, color: 'rgba(255,255,255,0.5)' }}>편차</td>{sel.years.map((y, i) => {
                    const a = actArr[i];
                    if (a == null || !y.amount) return <td key={y.y} style={{ ...TD, ...NUM, color: 'rgba(255,255,255,0.25)' }}>-</td>;
                    const dev = (a - y.amount) / y.amount;
                    const alert = Math.abs(dev) > 0.2;
                    return <td key={y.y} style={{ ...TD, ...NUM, color: alert ? '#fbbf24' : dev >= 0 ? '#6ee7b7' : '#fca5a5', fontWeight: alert ? 700 : 400 }}>{dev >= 0 ? '+' : ''}{pct(dev, 0)}{alert && ' ⚠'}</td>;
                  })}</tr>
                </>;
              })()}
            </tbody>
          </table>
        </div>
      )}
      {actuals && (
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
          실측 연도: {actualYears.join(', ') || '없음'} (연차 1Y부터 순서대로 대응). |편차|&gt;20%는 이상징후(⚠)로 표시 — 재예측을 검토하세요.
        </div>
      )}

      {sel && canEdit && !editing && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => startEdit(sel)}
            style={{ padding: '0.35rem 0.8rem', borderRadius: 7, border: '1px solid rgba(147,197,253,0.4)', background: 'rgba(147,197,253,0.1)', color: '#93c5fd', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            입력값 수정
          </button>
          <button onClick={async () => { if (confirm('이 SF를 삭제할까요?')) { const r = await deleteForecast(sel.id); if (r.ok) { onDeleted(sel.id); setSelId(null); setActuals(null); } } }}
            style={{ padding: '0.35rem 0.8rem', borderRadius: 7, border: '1px solid rgba(248,113,113,0.3)', background: 'transparent', color: '#fca5a5', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

/* ── 소품 ── */
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '0.4rem 0.8rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      <div style={{ fontSize: '0.92rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <span style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)' }}>{label}</span>{children}
  </label>;
}
const inp: React.CSSProperties = { width: '100%', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: '#e2e8f0', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit' };
function btn(color: string): React.CSSProperties {
  return { padding: '0.4rem 0.9rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 };
}
