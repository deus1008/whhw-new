'use client';

import { useState, useTransition } from 'react';
import {
  findIngredientOptions,
  getDrugsByExactIngredient,
  getCommissionRates,
  type DrugResult,
  type CommissionRate,
  type SimRow,
} from '@/app/commission/actions';

/* ── 제품 기본명 추출 (브랜드명만, 함량·규격 제외) ─────── */
// "크레트롤정10/5밀리그램_(1정)" → "크레트롤정"
// "크레트롤정 10/10mg (에제티미브/로수바스타틴)" → "크레트롤정"
function extractProductBase(name: string): string {
  const cleaned = name
    .replace(/[\(（][^)）]*[\)）]/g, '')   // 괄호 제거
    .replace(/[\s_\/]+/g, '');              // 공백·_·/ 제거
  // 한글+영문자가 끝나는 지점까지 (숫자 앞까지)
  const m = cleaned.match(/^([가-힣a-zA-Z]+)/);
  return (m ? m[1] : cleaned.slice(0, 8)).toLowerCase();
}

/* ── 회사명 정규화 ───────────────────────────────────────── */
function cleanCompany(name: string): string {
  return name
    .replace(/\(주\)|\(유\)|\(합\)|\(사\)/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/주식회사|유한회사|합자회사/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

// 계열사·동일법인 별칭 (양방향으로 동일 회사로 취급)
const COMPANY_ALIASES: Record<string, string[]> = {
  '아주얼라이언스': ['아주약품'],
  '아주약품':       ['아주얼라이언스'],
};

function companyVariants(name: string): string[] {
  const base = cleanCompany(name);
  const set  = new Set<string>([base]);
  if (base.startsWith('한국')) set.add(base.slice(2));
  if (base.endsWith('코리아'))  set.add(base.slice(0, -3));
  if (base.endsWith('제약'))    set.add(base.slice(0, -2));
  if (base.endsWith('얼라이언스')) set.add(base.replace('얼라이언스', ''));
  // 명시적 계열사 별칭 추가 (아주약품 ↔ 아주얼라이언스 등)
  for (const alias of (COMPANY_ALIASES[base] ?? [])) set.add(alias);
  return Array.from(set).filter(v => v.length >= 2);
}

/* ── 수수료율 매핑 (제품명 우선, 회사명 보조) ───────────── */
function matchRate(manufacturer: string | null, itemName: string | null, rates: CommissionRate[]): number {
  if (rates.length === 0) return 0;

  // ── 1순위: 제품 기본명 일치 ───────────────────────────
  // 수수료율 파일의 company_name이 CSO파트너사(=제조사와 다를 수 있음)이므로
  // 제품명으로 먼저 매칭
  if (itemName) {
    const itemBase = extractProductBase(itemName);
    for (const r of rates) {
      if (!r.product_name) continue;
      const rBase = extractProductBase(r.product_name);
      if (itemBase === rBase || itemBase.includes(rBase) || rBase.includes(itemBase)) {
        return r.rate;
      }
    }
  }

  // ── 2순위: 회사명 일치 (제품명 없는 행 / 단순 회사 수수료율) ──
  if (manufacturer) {
    const mfVars = companyVariants(manufacturer);
    // 정확 일치
    for (const r of rates) {
      const rVars = companyVariants(r.company_name);
      if (mfVars.some(m => rVars.some(rv => m === rv))) return r.rate;
    }
    // 포함 일치
    for (const r of rates) {
      const rVars = companyVariants(r.company_name);
      if (mfVars.some(m => rVars.some(rv => m.includes(rv) || rv.includes(m)))) return r.rate;
    }
  }

  return 0;
}

function won(n: number) { return n.toLocaleString('ko-KR') + '원'; }

/* ── 수수료율 입력 ───────────────────────────────────────── */
function RateInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" value={value} min={0} max={100} step={0.1}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{
        width: '60px', padding: '0.2rem 0.4rem',
        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '5px', color: '#fbbf24', fontSize: '0.82rem',
        fontFamily: 'inherit', textAlign: 'right',
      }}
    />
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────── */
export default function CommissionClient({
  initialRates,
  sourceFile,
}: {
  initialRates: CommissionRate[];
  sourceFile: string | null;
}) {
  const [rates] = useState<CommissionRate[]>(initialRates);

  /* 입력 */
  const [query,    setQuery]    = useState('');
  const [quantity, setQuantity] = useState<number>(30);

  /* 1단계: 성분명 후보 */
  const [options,      setOptions]      = useState<{ ingredient_name: string; count: number }[]>([]);
  const [selectedIng,  setSelectedIng]  = useState<string | null>(null);
  const [phase1Done,   setPhase1Done]   = useState(false);
  const [searching1,   startSearch1]    = useTransition();

  /* 2단계: 결과 */
  const [rows,         setRows]         = useState<SimRow[]>([]);
  const [rateOverrides, setRateOverrides] = useState<Record<number, number>>({});
  const [searching2,   startSearch2]    = useTransition();

  const [error, setError] = useState('');

  /* ── 1단계 검색 ─────────────────────────────────────────── */
  function handleSearch() {
    if (!query.trim()) { setError('성분명 또는 제품명을 입력하세요.'); return; }
    setError('');
    setOptions([]);
    setSelectedIng(null);
    setRows([]);
    setRateOverrides({});
    setPhase1Done(false);

    startSearch1(async () => {
      const opts = await findIngredientOptions(query);
      setOptions(opts);
      setPhase1Done(true);
      if (opts.length === 0) setError('검색 결과가 없습니다. 성분명 또는 제품명을 확인하세요.');
      // 결과 1개면 자동 선택
      if (opts.length === 1) loadDrugs(opts[0].ingredient_name);
    });
  }

  /* ── 2단계: 성분명 선택 후 제품 조회 ───────────────────── */
  function loadDrugs(ingredientName: string) {
    setSelectedIng(ingredientName);
    setRows([]);
    setRateOverrides({});

    startSearch2(async () => {
      const drugs = await getDrugsByExactIngredient(ingredientName);
      if (drugs.length === 0) { setError('해당 성분의 약가 데이터가 없습니다.'); return; }
      setRows(calcRows(drugs, quantity, {}));
    });
  }

  /* ── 행 계산 ─────────────────────────────────────────────── */
  function calcRows(drugs: DrugResult[], qty: number, overrides: Record<number, number>): SimRow[] {
    return drugs
      .map((d, i) => {
        const dbRate     = matchRate(d.manufacturer, d.item_name, rates);
        const rate       = overrides[i] ?? dbRate;
        const matched    = dbRate > 0;
        const prescriptionAmount = (d.max_price ?? 0) * qty;
        const settlementAmount   = Math.round(prescriptionAmount * rate / 100);
        return { ...d, quantity: qty, commission_rate: rate, prescription_amount: prescriptionAmount, settlement_amount: settlementAmount, rate_matched: matched };
      })
      .sort((a, b) => b.settlement_amount - a.settlement_amount);
  }

  /* ── 수수료율 개별 수정 ──────────────────────────────────── */
  function handleRateChange(idx: number, newRate: number) {
    const updated = { ...rateOverrides, [idx]: newRate };
    setRateOverrides(updated);
    setRows(prev =>
      prev
        .map((r, i) => i !== idx ? r : { ...r, commission_rate: newRate, settlement_amount: Math.round(r.prescription_amount * newRate / 100) })
        .sort((a, b) => b.settlement_amount - a.settlement_amount)
    );
  }

  /* ── 수량 변경 → 재계산 ─────────────────────────────────── */
  function handleQuantityChange(q: number) {
    setQuantity(q);
    if (rows.length > 0) {
      setRows(prev =>
        prev
          .map((r, i) => {
            const rate = rateOverrides[i] ?? r.commission_rate;
            const pa = (r.max_price ?? 0) * q;
            return { ...r, quantity: q, commission_rate: rate, prescription_amount: pa, settlement_amount: Math.round(pa * rate / 100) };
          })
          .sort((a, b) => b.settlement_amount - a.settlement_amount)
      );
    }
  }

  /* ── CSV 내보내기 ────────────────────────────────────────── */
  function exportCsv() {
    const header = ['제약사','제품명','규격','보험코드','약가(원)','수량','처방액(원)','수수료율(%)','정산액(원)'];
    const dataRows = rows.map(r => [r.manufacturer??'', r.item_name, r.standard??'', r.item_code??'', r.max_price??0, r.quantity, r.prescription_amount, r.commission_rate, r.settlement_amount]);
    const csv = [header, ...dataRows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`수수료시뮬레이션_${query}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const inputStyle: React.CSSProperties = {
    padding: '0.6rem 0.85rem', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit',
  };
  const thStyle: React.CSSProperties = {
    padding: '0.55rem 0.75rem', fontSize: '0.75rem', fontWeight: 700,
    color: 'var(--text-muted)', textAlign: 'left',
    background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', fontSize: '0.82rem',
    borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle',
  };

  return (
    <div style={{ width: '100%' }}>

      {/* ── 검색 입력 ──────────────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px', padding: '1.4rem 1.6rem', marginBottom: '1.2rem',
        display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end',
      }}>
        <div style={{ flex: '2 1 220px' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            성분명 또는 제품명 <span style={{ color: '#f87171' }}>*</span>
            <span style={{ fontWeight: 400, marginLeft: '0.5rem', color: 'rgba(148,163,184,0.7)' }}>
              성분명 입력 시 동일 함량 필터 · 제품명 입력 시 동일 성분+함량의 타사 제품 포함
            </span>
          </label>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="예: 암로디핀베실산염, 노바스크정, 에소메프라졸"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div style={{ flex: '0 1 130px' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            처방예상수량 <span style={{ fontSize: '0.7rem' }}>(정/캡슐)</span>
          </label>
          <input
            type="number" value={quantity} min={1}
            onChange={e => handleQuantityChange(parseInt(e.target.value) || 1)}
            style={{ ...inputStyle, width: '100%', color: '#fbbf24', fontWeight: 600 }}
          />
        </div>

        <button
          onClick={handleSearch} disabled={searching1}
          style={{
            padding: '0.6rem 1.6rem', borderRadius: '8px', fontSize: '0.88rem',
            fontWeight: 700, cursor: searching1 ? 'not-allowed' : 'pointer',
            border: '1px solid rgba(139,92,246,0.45)', background: 'rgba(139,92,246,0.22)', color: '#c4b5fd',
          }}
        >
          {searching1 ? '검색 중…' : '🔍 검색'}
        </button>
      </div>

      {error && <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1rem' }}>⚠ {error}</p>}

      {/* ── 1단계: 성분명(함량) 선택 ──────────────────────── */}
      {phase1Done && options.length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '1rem 1.2rem', marginBottom: '1.2rem',
        }}>
          <p style={{ margin: '0 0 0.7rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            ② 성분명(함량) 선택 — 동일 성분+함량의 전 제약사 제품이 조회됩니다
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {options.map(opt => {
              const isSelected = selectedIng === opt.ingredient_name;
              return (
                <button
                  key={opt.ingredient_name}
                  onClick={() => loadDrugs(opt.ingredient_name)}
                  disabled={searching2}
                  style={{
                    padding: '0.4rem 0.85rem', borderRadius: '100px', fontSize: '0.8rem',
                    fontWeight: isSelected ? 700 : 500, cursor: 'pointer',
                    border: isSelected ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.12)',
                    background: isSelected ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                    color: isSelected ? '#c4b5fd' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.ingredient_name}
                  <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', opacity: 0.6 }}>({opt.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {searching2 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>제품 조회 중…</p>
      )}

      {/* ── 2단계: 결과 테이블 ───────────────────────────── */}
      {rows.length > 0 && (
        <div>
          {/* 요약 + 내보내기 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: '#c4b5fd' }}>{selectedIng}</strong>
              </span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {rows.length}개 제약사
              </span>
            </div>
            <button onClick={exportCsv} style={{
              padding: '0.35rem 0.9rem', borderRadius: '7px', fontSize: '0.78rem',
              border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.12)',
              color: '#a5b4fc', cursor: 'pointer',
            }}>📥 CSV 내보내기</button>
          </div>

          {/* 테이블 */}
          <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>제약사</th>
                  <th style={thStyle}>제품명</th>
                  <th style={thStyle}>규격</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>약가(원)</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>수량</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>처방액(원)</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>수수료율</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>정산액(원)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ ...tdStyle, color: '#93c5fd', fontWeight: 500 }}>{r.manufacturer ?? '-'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-primary)', fontWeight: 500, maxWidth: '200px' }}>{r.item_name}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '0.78rem' }}>{r.standard ?? '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {(r.max_price ?? 0).toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#fbbf24', fontWeight: 600 }}>
                      {r.quantity.toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#60a5fa', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {r.prescription_amount.toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                        <RateInput value={r.commission_rate} onChange={v => handleRateChange(i, v)} />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>%</span>
                        {!r.rate_matched && (
                          <span title="수수료율 파일에 미등록" style={{ fontSize: '0.65rem', color: '#f87171', opacity: 0.7 }}>미등록</span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#4ade80', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {r.settlement_amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.6rem' }}>
            * 수수료율은 문서관리 &gt; 수수료율 폴더 기준 · 개별 수정 가능 (저장 안 됨)
          </p>
        </div>
      )}
    </div>
  );
}
