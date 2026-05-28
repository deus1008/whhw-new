'use client';

import { useState, useTransition } from 'react';
import type { UpcomingProduct } from '@/app/products/page';
import type { ProductInput } from '@/app/products/actions';
import { createProduct, updateProduct, deleteProduct } from '@/app/products/actions';

const EMPTY: ProductInput = {
  year_label: '', launch_timing: '', product_name: '',
  category: '', ingredient: '', is_priority: false, memo: '',
};

interface Props {
  initialProducts: UpcomingProduct[];
  isAdmin: boolean;
  userId: string;
}

export default function ProductsClient({ initialProducts, isAdmin }: Props) {
  const [products, setProducts]     = useState<UpcomingProduct[]>(initialProducts);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<UpcomingProduct | null>(null);
  const [form, setForm]             = useState<ProductInput>(EMPTY);
  const [formError, setFormError]   = useState('');
  const [isPending, startTransition] = useTransition();
  const [filterYear, setFilterYear] = useState('');
  const [search, setSearch]         = useState('');

  /* ── 연도 목록 ───────────────────────────────────────────── */
  const years = Array.from(new Set(products.map(p => p.year_label))).sort();

  /* ── 필터된 목록 ─────────────────────────────────────────── */
  const filtered = products.filter(p => {
    const matchYear = !filterYear || p.year_label === filterYear;
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || p.product_name.toLowerCase().includes(q)
      || (p.category ?? '').toLowerCase().includes(q)
      || (p.ingredient ?? '').toLowerCase().includes(q)
      || p.launch_timing.toLowerCase().includes(q);
    return matchYear && matchSearch;
  });

  /* ── 연도별 그룹 ─────────────────────────────────────────── */
  const grouped: { year: string; rows: UpcomingProduct[] }[] = [];
  for (const p of filtered) {
    const g = grouped.find(g => g.year === p.year_label);
    if (g) g.rows.push(p);
    else grouped.push({ year: p.year_label, rows: [p] });
  }

  /* ── 모달 helpers ────────────────────────────────────────── */
  function openCreate() {
    setEditing(null); setForm(EMPTY); setFormError(''); setModalOpen(true);
  }
  function openEdit(p: UpcomingProduct) {
    setEditing(p);
    setForm({
      year_label:    p.year_label,
      launch_timing: p.launch_timing,
      product_name:  p.product_name,
      category:      p.category    ?? '',
      ingredient:    p.ingredient  ?? '',
      is_priority:   p.is_priority,
      memo:          p.memo        ?? '',
    });
    setFormError(''); setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  /* ── submit ───────────────────────────────────────────────── */
  function handleSubmit() {
    setFormError('');
    startTransition(async () => {
      const result = editing
        ? await updateProduct(editing.id, form)
        : await createProduct(form);

      if (result.error) { setFormError(result.error); return; }

      if (editing) {
        setProducts(prev => prev.map(p => p.id === editing.id ? result.data! : p));
      } else {
        setProducts(prev => sortProducts([...prev, result.data!]));
      }
      closeModal();
    });
  }

  /* ── delete ───────────────────────────────────────────────── */
  function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    startTransition(async () => {
      const result = await deleteProduct(id);
      if (result.error) { alert(result.error); return; }
      setProducts(prev => prev.filter(p => p.id !== id));
    });
  }

  return (
    <>
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
        <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          🚀 발매예정품목
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem' }}>
          ★ 표시 항목은 우선 관리 품목입니다.
        </p>
      </div>

      {/* ── 툴바 ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.2rem' }}>
        <input
          type="text"
          placeholder="제품명 / 계열 / 성분명 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px', padding: '0.5rem 0.9rem', borderRadius: '8px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0', fontSize: '0.82rem', outline: 'none',
          }}
        />

        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem', borderRadius: '8px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0', fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          <option value="">전체 연도</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <button
          onClick={openCreate}
          style={{
            padding: '0.5rem 1.1rem', borderRadius: '8px',
            background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)',
            color: '#a5b4fc', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          + 품목 추가
        </button>
      </div>

      {/* ── 테이블 ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem 1rem',
          background: 'rgba(255,255,255,0.02)', borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.06)', color: '#475569',
        }}>
          {search || filterYear ? '검색 결과가 없습니다.' : '등록된 품목이 없습니다.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontSize: '0.85rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Th>구분</Th>
                <Th>발매예정</Th>
                <Th>제품명</Th>
                <Th>계열</Th>
                <Th>성분명</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ year, rows }) =>
                rows.map((p, i) => (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: p.is_priority
                        ? 'rgba(239,68,68,0.06)'
                        : i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      outline: p.is_priority ? '1px solid rgba(239,68,68,0.25)' : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = p.is_priority ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = p.is_priority ? 'rgba(239,68,68,0.06)' : i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')}
                  >
                    {/* 구분: 해당 연도 첫 행에만 표시 */}
                    {i === 0 ? (
                      <td
                        rowSpan={rows.length}
                        style={{
                          padding: '0.7rem 1rem', textAlign: 'center',
                          color: '#94a3b8', fontWeight: 700,
                          borderRight: '1px solid rgba(255,255,255,0.07)',
                          verticalAlign: 'middle', whiteSpace: 'nowrap',
                        }}
                      >
                        {year}
                      </td>
                    ) : null}
                    <td style={{ padding: '0.7rem 1rem', color: '#cbd5e1', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {p.is_priority && <span style={{ color: '#f87171', marginRight: '0.3rem' }}>★</span>}
                      {p.launch_timing}
                    </td>
                    <td style={{ padding: '0.7rem 1rem', color: '#e2e8f0', fontWeight: 600 }}>
                      {p.product_name}
                    </td>
                    <td style={{ padding: '0.7rem 1rem', color: '#94a3b8', textAlign: 'center' }}>
                      {p.category
                        ? p.category.split('\n').map((line, idx) => (
                            <span key={idx} style={{ display: 'block', lineHeight: 1.4 }}>{line}</span>
                          ))
                        : '—'}
                    </td>
                    <td style={{ padding: '0.7rem 1rem', color: '#94a3b8' }}>
                      {p.ingredient ?? '—'}
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button
                        onClick={() => openEdit(p)}
                        style={actionBtn('#60a5fa', 'rgba(59,130,246,0.12)', 'rgba(59,130,246,0.3)')}
                      >수정</button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={isPending}
                          style={{ ...actionBtn('#f87171', 'rgba(239,68,68,0.1)', 'rgba(239,68,68,0.3)'), marginLeft: '0.35rem' }}
                        >삭제</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 총 건수 ────────────────────────────────────────── */}
      <p style={{ fontSize: '0.73rem', color: '#475569', marginTop: '0.75rem', textAlign: 'right' }}>
        총 {filtered.length}건
      </p>

      {/* ── 등록/수정 모달 ────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '500px',
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontWeight: 700, fontSize: '1.05rem' }}>
              {editing ? '품목 수정' : '신규 품목 등록'}
            </h3>

            {/* 연도 / 발매예정 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div>
                <label style={labelStyle}>구분(연도) *</label>
                <input
                  value={form.year_label}
                  onChange={e => setForm(f => ({ ...f, year_label: e.target.value }))}
                  placeholder="예) 26년, 27년"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>발매예정 *</label>
                <input
                  value={form.launch_timing}
                  onChange={e => setForm(f => ({ ...f, launch_timing: e.target.value }))}
                  placeholder="예) 6월, 2분기"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* 제품명 */}
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={labelStyle}>제품명 *</label>
              <input
                value={form.product_name}
                onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                placeholder="예) 폴미케어분무용현탁액"
                style={inputStyle}
              />
            </div>

            {/* 계열 */}
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={labelStyle}>계열</label>
              <input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="예) 기관지천식 치료제(흡입제)"
                style={inputStyle}
              />
            </div>

            {/* 성분명 */}
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={labelStyle}>성분명</label>
              <input
                value={form.ingredient}
                onChange={e => setForm(f => ({ ...f, ingredient: e.target.value }))}
                placeholder="예) 부데소니드미분화 0.5mg/2mL"
                style={inputStyle}
              />
            </div>

            {/* 비고 */}
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={labelStyle}>비고</label>
              <textarea
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="특이사항 등"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
              />
            </div>

            {/* 우선관리 체크 */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              cursor: 'pointer', marginBottom: '1.2rem',
              fontSize: '0.82rem', color: '#94a3b8',
            }}>
              <input
                type="checkbox"
                checked={form.is_priority}
                onChange={e => setForm(f => ({ ...f, is_priority: e.target.checked }))}
                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#f87171' }}
              />
              <span>★ 우선 관리 품목으로 표시</span>
            </label>

            {formError && (
              <p style={{
                color: '#fca5a5', fontSize: '0.8rem', margin: '0 0 0.8rem',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px', padding: '0.5rem 0.8rem',
              }}>
                {formError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={cancelBtn} disabled={isPending}>취소</button>
              <button onClick={handleSubmit} style={submitBtn} disabled={isPending}>
                {isPending ? '처리 중…' : editing ? '저장' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── helpers ─────────────────────────────────────────────────── */
function sortProducts(arr: UpcomingProduct[]) {
  return [...arr].sort((a, b) => {
    const yc = a.year_label.localeCompare(b.year_label);
    if (yc !== 0) return yc;
    return a.launch_timing.localeCompare(b.launch_timing);
  });
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: '0.65rem 1rem', textAlign: 'center',
      color: '#94a3b8', fontWeight: 700, fontSize: '0.82rem',
      whiteSpace: 'nowrap', letterSpacing: '0.03em',
    }}>
      {children}
    </th>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600,
  color: '#64748b', marginBottom: '0.3rem', letterSpacing: '0.02em',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const cancelBtn: React.CSSProperties = {
  padding: '0.5rem 1.2rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
};

const submitBtn: React.CSSProperties = {
  padding: '0.5rem 1.4rem', borderRadius: '8px',
  background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)',
  color: '#a5b4fc', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};

function actionBtn(color: string, bg: string, bd: string): React.CSSProperties {
  return {
    padding: '0.2rem 0.6rem', borderRadius: '6px',
    background: bg, border: `1px solid ${bd}`,
    color, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  };
}
