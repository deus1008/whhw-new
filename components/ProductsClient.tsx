'use client';

import { useState, useTransition } from 'react';
import type { UpcomingProduct } from '@/app/products/page';
import type { ProductInput } from '@/app/products/actions';
import { createProduct, updateProduct, deleteProduct } from '@/app/products/actions';

const STATUS_LIST = ['검토중', '협의중', '계약완료', '발매확정', '발매완료', '보류'];

const STATUS_COLORS: Record<string, { bg: string; bd: string; color: string }> = {
  '검토중':  { bg: 'rgba(148,163,184,0.15)', bd: 'rgba(148,163,184,0.35)', color: '#94a3b8' },
  '협의중':  { bg: 'rgba(251,191,36,0.15)',  bd: 'rgba(251,191,36,0.35)',  color: '#fbbf24' },
  '계약완료': { bg: 'rgba(59,130,246,0.15)', bd: 'rgba(59,130,246,0.35)', color: '#60a5fa' },
  '발매확정': { bg: 'rgba(16,185,129,0.15)', bd: 'rgba(16,185,129,0.35)', color: '#34d399' },
  '발매완료': { bg: 'rgba(52,211,153,0.15)', bd: 'rgba(52,211,153,0.35)', color: '#6ee7b7' },
  '보류':    { bg: 'rgba(239,68,68,0.15)',   bd: 'rgba(239,68,68,0.35)',   color: '#f87171' },
};

const EMPTY: ProductInput = {
  title: '', launch_date: '', manufacturer: '', indication: '',
  insurance_price: '', insurance_code: '', status: '', memo: '',
};

interface Props {
  initialProducts: UpcomingProduct[];
  isAdmin: boolean;
}

export default function ProductsClient({ initialProducts, isAdmin }: Props) {
  const [products, setProducts] = useState<UpcomingProduct[]>(initialProducts);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<UpcomingProduct | null>(null);
  const [form, setForm]             = useState<ProductInput>(EMPTY);
  const [error, setError]           = useState('');
  const [isPending, startTransition] = useTransition();
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [search, setSearch]         = useState('');

  /* ── form helpers ─────────────────────────────────────────── */
  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setModalOpen(true);
  }
  function openEdit(p: UpcomingProduct) {
    setEditing(p);
    setForm({
      title:           p.title,
      launch_date:     p.launch_date    ?? '',
      manufacturer:    p.manufacturer   ?? '',
      indication:      p.indication     ?? '',
      insurance_price: p.insurance_price ?? '',
      insurance_code:  p.insurance_code  ?? '',
      status:          p.status         ?? '',
      memo:            p.memo           ?? '',
    });
    setError('');
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  /* ── submit ───────────────────────────────────────────────── */
  function handleSubmit() {
    setError('');
    startTransition(async () => {
      const result = editing
        ? await updateProduct(editing.id, form)
        : await createProduct(form);

      if (result.error) { setError(result.error); return; }

      if (editing) {
        setProducts(prev => prev.map(p => p.id === editing.id ? result.data! : p));
      } else {
        setProducts(prev => {
          const next = [result.data!, ...prev];
          return next.sort((a, b) => {
            if (!a.launch_date && !b.launch_date) return 0;
            if (!a.launch_date) return 1;
            if (!b.launch_date) return -1;
            return a.launch_date.localeCompare(b.launch_date);
          });
        });
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

  /* ── filter ───────────────────────────────────────────────── */
  const filtered = products.filter(p => {
    const matchStatus = !filterStatus || p.status === filterStatus;
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || p.title.toLowerCase().includes(q)
      || (p.manufacturer ?? '').toLowerCase().includes(q)
      || (p.indication ?? '').toLowerCase().includes(q)
      || (p.insurance_code ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <>
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
        <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          🚀 발매예정품목
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem' }}>
          파이프라인 관리 — 계약 검토부터 발매 완료까지
        </p>
      </div>

      {/* ── 툴바 ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.2rem' }}>
        <input
          type="text"
          placeholder="품목명 / 제조사 / 적응증 / 보험코드 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: '1 1 220px', padding: '0.5rem 0.9rem', borderRadius: '8px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0', fontSize: '0.82rem', outline: 'none',
          }}
        />

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem', borderRadius: '8px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0', fontSize: '0.82rem', cursor: 'pointer',
          }}
        >
          <option value="">전체 상태</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {isAdmin && (
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
        )}
      </div>

      {/* ── 상태 범례 ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        {STATUS_LIST.map(s => {
          const c = STATUS_COLORS[s] ?? STATUS_COLORS['검토중'];
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              style={{
                padding: '0.2rem 0.65rem', borderRadius: '20px',
                background: filterStatus === s ? c.bg : 'transparent',
                border: `1px solid ${c.bd}`,
                color: c.color, fontSize: '0.72rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: filterStatus && filterStatus !== s ? 0.45 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* ── 카운트 ───────────────────────────────────────────── */}
      <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.8rem' }}>
        {filtered.length}개 품목
      </p>

      {/* ── 테이블 ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem 1rem',
          background: 'rgba(255,255,255,0.02)', borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.06)', color: '#475569',
        }}>
          {search || filterStatus ? '검색 결과가 없습니다.' : '등록된 품목이 없습니다.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['품목명', '발매예정일', '제조사/공급사', '적응증/효능효과', '약가', '보험코드', '상태', '비고', ...(isAdmin ? [''] : [])].map(h => (
                  <th key={h} style={{
                    padding: '0.6rem 0.75rem', textAlign: 'left',
                    color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const sc = STATUS_COLORS[p.status ?? ''] ?? STATUS_COLORS['검토중'];
                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')}
                  >
                    <td style={{ padding: '0.65rem 0.75rem', color: '#e2e8f0', fontWeight: 600, minWidth: '120px' }}>
                      {p.title}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {p.launch_date ? new Date(p.launch_date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }) : '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8', minWidth: '100px' }}>
                      {p.manufacturer ?? '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8', maxWidth: '220px' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.indication ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {p.insurance_price ?? '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {p.insurance_code ?? '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                      {p.status ? (
                        <span style={{
                          display: 'inline-block', padding: '0.15rem 0.55rem',
                          borderRadius: '20px', background: sc.bg, border: `1px solid ${sc.bd}`,
                          color: sc.color, fontSize: '0.7rem', fontWeight: 600,
                        }}>
                          {p.status}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', color: '#64748b', maxWidth: '180px', fontSize: '0.78rem' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.memo ?? ''}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => openEdit(p)}
                          style={actionBtn('#60a5fa', 'rgba(59,130,246,0.15)', 'rgba(59,130,246,0.35)')}
                        >수정</button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          style={{ ...actionBtn('#f87171', 'rgba(239,68,68,0.1)', 'rgba(239,68,68,0.3)'), marginLeft: '0.35rem' }}
                          disabled={isPending}
                        >삭제</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 등록/수정 모달 ────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '540px',
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontWeight: 700, fontSize: '1.05rem' }}>
              {editing ? '품목 수정' : '신규 품목 등록'}
            </h3>

            {/* 품목명 */}
            <FieldRow label="품목명 *">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="예) 오젬픽 주(세마글루타이드)" style={inputStyle} />
            </FieldRow>

            {/* 발매예정일 */}
            <FieldRow label="발매예정일">
              <input type="month" value={form.launch_date?.slice(0, 7) ?? ''}
                onChange={e => setForm(f => ({ ...f, launch_date: e.target.value ? e.target.value + '-01' : '' }))}
                style={inputStyle} />
            </FieldRow>

            {/* 제조사/공급사 */}
            <FieldRow label="제조사/공급사">
              <input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                placeholder="예) 노보노디스크" style={inputStyle} />
            </FieldRow>

            {/* 적응증/효능효과 */}
            <FieldRow label="적응증/효능효과">
              <textarea value={form.indication} onChange={e => setForm(f => ({ ...f, indication: e.target.value }))}
                placeholder="예) 제2형 당뇨병 치료, 체중 감량" rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} />
            </FieldRow>

            {/* 약가 / 보험코드 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div>
                <label style={labelStyle}>약가(보험가)</label>
                <input value={form.insurance_price} onChange={e => setForm(f => ({ ...f, insurance_price: e.target.value }))}
                  placeholder="예) 12,500원" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>보험코드</label>
                <input value={form.insurance_code} onChange={e => setForm(f => ({ ...f, insurance_code: e.target.value }))}
                  placeholder="예) 651900020" style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>
            </div>

            {/* 진행상태 */}
            <FieldRow label="진행상태">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">선택</option>
                {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FieldRow>

            {/* 비고 */}
            <FieldRow label="비고">
              <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="특이사항, 담당자 메모 등" rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} />
            </FieldRow>

            {error && (
              <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: '0.5rem 0 0.8rem',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px', padding: '0.5rem 0.8rem' }}>
                {error}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.2rem' }}>
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

/* ── 스타일 helpers ─────────────────────────────────────────── */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
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
