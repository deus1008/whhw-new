'use client';

import { useState, useTransition } from 'react';
import type { UpcomingProduct, DateEntry } from '@/app/products/page';
import type { ProductInput } from '@/app/products/actions';
import { createProduct, updateProduct, deleteProduct } from '@/app/products/actions';

/* ── 상수 ─────────────────────────────────────────────────────── */
const STATUS_LIST = ['개발검토', '개발승인', '허가예정', '발매예정', '발매완료'];

const STATUS_COLOR: Record<string, { bg: string; bd: string; color: string }> = {
  '개발검토': { bg: 'rgba(148,163,184,0.12)', bd: 'rgba(148,163,184,0.3)', color: '#94a3b8' },
  '개발승인': { bg: 'rgba(59,130,246,0.12)',  bd: 'rgba(59,130,246,0.3)',  color: '#60a5fa' },
  '허가예정': { bg: 'rgba(251,191,36,0.12)',  bd: 'rgba(251,191,36,0.3)',  color: '#fbbf24' },
  '발매예정': { bg: 'rgba(167,139,250,0.12)', bd: 'rgba(167,139,250,0.3)', color: '#a78bfa' },
  '발매완료': { bg: 'rgba(52,211,153,0.12)',  bd: 'rgba(52,211,153,0.3)',  color: '#34d399' },
};

const EMPTY_FORM: ProductInput = {
  ingredient: '', product_name: '',
  approval_dates: [], launch_dates: [],
  product_type: '자사', contractor: '',
  indication: '', expected_price: '',
  status: '', memo: '', is_priority: false,
};

/* ── helpers ─────────────────────────────────────────────────── */
function latestDate(entries: DateEntry[]): string {
  if (!entries?.length) return '—';
  const last = entries[entries.length - 1];
  return formatYM(last.date) + (entries.length > 1 ? ` (+${entries.length - 1})` : '');
}

function formatYM(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return m ? `${y}년 ${m}월` : ym;
}

/* ── Props ─────────────────────────────────────────────────────── */
interface Props {
  initialProducts: UpcomingProduct[];
  isAdmin: boolean;
  userId: string;
}

/* ══════════════════════════════════════════════════════════════ */
export default function ProductsClient({ initialProducts, isAdmin }: Props) {
  const [products, setProducts]       = useState<UpcomingProduct[]>(initialProducts);
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState<UpcomingProduct | null>(null);
  const [form, setForm]               = useState<ProductInput>(EMPTY_FORM);
  const [formError, setFormError]     = useState('');
  const [isPending, startTransition]  = useTransition();
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch]           = useState('');

  /* ── date-entry local state ─────────────────────────────────── */
  const [newApprDate, setNewApprDate] = useState('');
  const [newApprNote, setNewApprNote] = useState('');
  const [newLaunchDate, setNewLaunchDate] = useState('');
  const [newLaunchNote, setNewLaunchNote] = useState('');

  /* ── modal helpers ──────────────────────────────────────────── */
  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    resetDateInputs();
    setFormError('');
    setModalOpen(true);
  }
  function openEdit(p: UpcomingProduct) {
    setEditing(p);
    setForm({
      ingredient:     p.ingredient,
      product_name:   p.product_name   ?? '',
      approval_dates: p.approval_dates ?? [],
      launch_dates:   p.launch_dates   ?? [],
      product_type:   p.product_type   || '자사',
      contractor:     p.contractor     ?? '',
      indication:     p.indication     ?? '',
      expected_price: p.expected_price ?? '',
      status:         p.status         ?? '',
      memo:           p.memo           ?? '',
      is_priority:    p.is_priority,
    });
    resetDateInputs();
    setFormError('');
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }
  function resetDateInputs() {
    setNewApprDate(''); setNewApprNote('');
    setNewLaunchDate(''); setNewLaunchNote('');
  }

  /* ── date entry helpers ─────────────────────────────────────── */
  function addApprDate() {
    if (!newApprDate) return;
    setForm(f => ({ ...f, approval_dates: [...f.approval_dates, { date: newApprDate, note: newApprNote }] }));
    setNewApprDate(''); setNewApprNote('');
  }
  function removeApprDate(i: number) {
    setForm(f => ({ ...f, approval_dates: f.approval_dates.filter((_, idx) => idx !== i) }));
  }
  function addLaunchDate() {
    if (!newLaunchDate) return;
    setForm(f => ({ ...f, launch_dates: [...f.launch_dates, { date: newLaunchDate, note: newLaunchNote }] }));
    setNewLaunchDate(''); setNewLaunchNote('');
  }
  function removeLaunchDate(i: number) {
    setForm(f => ({ ...f, launch_dates: f.launch_dates.filter((_, idx) => idx !== i) }));
  }

  /* ── submit ─────────────────────────────────────────────────── */
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
        setProducts(prev => [...prev, result.data!]);
      }
      closeModal();
    });
  }

  /* ── delete ─────────────────────────────────────────────────── */
  function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return;
    startTransition(async () => {
      const result = await deleteProduct(id);
      if (result.error) { alert(result.error); return; }
      setProducts(prev => prev.filter(p => p.id !== id));
    });
  }

  /* ── filter ─────────────────────────────────────────────────── */
  const filtered = products.filter(p => {
    const matchStatus = !filterStatus || p.status === filterStatus;
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || p.ingredient.toLowerCase().includes(q)
      || (p.product_name ?? '').toLowerCase().includes(q)
      || (p.indication ?? '').toLowerCase().includes(q)
      || (p.contractor ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  /* ══ RENDER ══════════════════════════════════════════════════ */
  return (
    <>
      {/* ── 헤더 ───────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
        <h2 style={{ fontSize: 'clamp(1.1rem,3vw,1.5rem)', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          🚀 발매예정품목
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem' }}>
          개발 검토부터 발매 완료까지 파이프라인을 관리합니다.
        </p>
      </div>

      {/* ── 툴바 ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="text" placeholder="성분명 / 품목명 / 적응증 검색"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', ...inputStyle }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.82rem', cursor: 'pointer' }}>
          <option value="" style={{ background: '#1e293b', color: '#e2e8f0' }}>전체 상태</option>
          {STATUS_LIST.map(s => <option key={s} value={s} style={{ background: '#1e293b', color: '#e2e8f0' }}>{s}</option>)}
        </select>
        <button onClick={openCreate}
          style={{ padding: '0.5rem 1.1rem', borderRadius: '8px', background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          + 품목 추가
        </button>
      </div>

      {/* ── 진행상태 필터 배지 ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        {STATUS_LIST.map(s => {
          const c = STATUS_COLOR[s];
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              style={{ padding: '0.2rem 0.65rem', borderRadius: '20px', background: filterStatus === s ? c.bg : 'transparent', border: `1px solid ${c.bd}`, color: c.color, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: filterStatus && filterStatus !== s ? 0.4 : 1, transition: 'opacity 0.15s' }}>
              {s}
            </button>
          );
        })}
      </div>

      {/* ── 테이블 ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', color: '#475569' }}>
          {search || filterStatus ? '검색 결과가 없습니다.' : '등록된 품목이 없습니다.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['성분명', '품목명', '허가(예정)일', '발매(예정)일', '자사/위탁', '적응증/효능효과', '약가', '진행상태', '비고', ''].map(h => (
                  <th key={h} style={{ padding: '0.65rem 0.9rem', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const sc = STATUS_COLOR[p.status ?? ''] ?? STATUS_COLOR['개발검토'];
                const rowBg = p.is_priority ? 'rgba(239,68,68,0.05)' : i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent';
                return (
                  <tr key={p.id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = p.is_priority ? 'rgba(239,68,68,0.09)' : 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#e2e8f0', fontWeight: 700, minWidth: '120px' }}>
                      {p.is_priority && <span style={{ color: '#f87171', marginRight: '0.3rem' }}>★</span>}
                      {p.ingredient}
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#cbd5e1', minWidth: '100px' }}>{p.product_name ?? '—'}</td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#94a3b8', whiteSpace: 'nowrap', minWidth: '110px' }}>
                      {latestDate(p.approval_dates)}
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#94a3b8', whiteSpace: 'nowrap', minWidth: '110px' }}>
                      {latestDate(p.launch_dates)}
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {p.product_type}
                      {p.product_type === '위탁' && p.contractor && (
                        <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>{p.contractor}</span>
                      )}
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#94a3b8', maxWidth: '200px' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.indication ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{p.expected_price ?? '—'}</td>
                    <td style={{ padding: '0.7rem 0.9rem', whiteSpace: 'nowrap' }}>
                      {p.status ? (
                        <span style={{ display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '20px', background: sc.bg, border: `1px solid ${sc.bd}`, color: sc.color, fontSize: '0.7rem', fontWeight: 700 }}>
                          {p.status}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem', color: '#64748b', maxWidth: '160px', fontSize: '0.78rem' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.memo ?? ''}
                      </span>
                    </td>
                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(p)} style={actionBtn('#60a5fa', 'rgba(59,130,246,0.12)', 'rgba(59,130,246,0.3)')}>수정</button>
                      {isAdmin && (
                        <button onClick={() => handleDelete(p.id)} disabled={isPending}
                          style={{ ...actionBtn('#f87171', 'rgba(239,68,68,0.1)', 'rgba(239,68,68,0.3)'), marginLeft: '0.35rem' }}>삭제</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: '0.73rem', color: '#475569', marginTop: '0.6rem', textAlign: 'right' }}>총 {filtered.length}건</p>

      {/* ══ 등록/수정 모달 ══════════════════════════════════════ */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '560px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontWeight: 700, fontSize: '1.05rem' }}>
              {editing ? '품목 수정' : '신규 품목 등록'}
            </h3>

            {/* 성분명 (필수) */}
            <Field label="성분명 *">
              <input value={form.ingredient} onChange={e => setForm(f => ({ ...f, ingredient: e.target.value }))}
                placeholder="예) 부데소니드미분화 0.5mg/2mL" style={inputStyle} />
            </Field>

            {/* 품목명 */}
            <Field label="품목명">
              <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                placeholder="예) 폴미케어분무용현탁액" style={inputStyle} />
            </Field>

            {/* 허가(예정)일 이력 */}
            <Field label="허가(예정)일">
              <DateHistoryField
                entries={form.approval_dates}
                onRemove={removeApprDate}
                newDate={newApprDate} setNewDate={setNewApprDate}
                newNote={newApprNote} setNewNote={setNewApprNote}
                onAdd={addApprDate}
              />
            </Field>

            {/* 발매(예정)일 이력 */}
            <Field label="발매(예정)일">
              <DateHistoryField
                entries={form.launch_dates}
                onRemove={removeLaunchDate}
                newDate={newLaunchDate} setNewDate={setNewLaunchDate}
                newNote={newLaunchNote} setNewNote={setNewLaunchNote}
                onAdd={addLaunchDate}
              />
            </Field>

            {/* 자사 / 위탁 */}
            <Field label="자사/위탁">
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['자사', '위탁'].map(t => (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, product_type: t, contractor: '' }))}
                    style={{
                      flex: 1, padding: '0.5rem', borderRadius: '8px', fontFamily: 'inherit',
                      background: form.product_type === t ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${form.product_type === t ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      color: form.product_type === t ? '#a5b4fc' : '#94a3b8',
                      fontWeight: form.product_type === t ? 700 : 400, cursor: 'pointer', fontSize: '0.85rem',
                    }}>
                    {t}
                  </button>
                ))}
              </div>
              {form.product_type === '위탁' && (
                <input value={form.contractor} onChange={e => setForm(f => ({ ...f, contractor: e.target.value }))}
                  placeholder="위탁사명" style={{ ...inputStyle, marginTop: '0.5rem' }} />
              )}
            </Field>

            {/* 적응증/효능효과 */}
            <Field label="적응증/효능효과">
              <textarea value={form.indication} onChange={e => setForm(f => ({ ...f, indication: e.target.value }))}
                placeholder="예) 기관지천식 치료제(흡입제)" rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} />
            </Field>

            {/* (예상)약가 */}
            <Field label="(예상)약가">
              <input value={form.expected_price} onChange={e => setForm(f => ({ ...f, expected_price: e.target.value }))}
                placeholder="예) 12,500원 / 협의중" style={inputStyle} />
            </Field>

            {/* 진행상태 */}
            <Field label="진행상태">
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {STATUS_LIST.map(s => {
                  const c = STATUS_COLOR[s];
                  const selected = form.status === s;
                  return (
                    <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: selected ? '' : s }))}
                      style={{ padding: '0.3rem 0.75rem', borderRadius: '20px', fontFamily: 'inherit', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, background: selected ? c.bg : 'transparent', border: `1px solid ${c.bd}`, color: c.color, opacity: form.status && !selected ? 0.45 : 1 }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* 비고 */}
            <Field label="비고">
              <textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="특이사항 등" rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} />
            </Field>

            {/* 우선관리 */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1.2rem', fontSize: '0.82rem', color: '#94a3b8' }}>
              <input type="checkbox" checked={form.is_priority} onChange={e => setForm(f => ({ ...f, is_priority: e.target.checked }))}
                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#f87171' }} />
              ★ 우선 관리 품목으로 표시
            </label>

            {formError && (
              <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: '0 0 0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '0.5rem 0.8rem' }}>
                {formError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={closeModal} disabled={isPending}
                style={{ padding: '0.5rem 1.2rem', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                취소
              </button>
              <button onClick={handleSubmit} disabled={isPending}
                style={{ padding: '0.5rem 1.4rem', borderRadius: '8px', background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {isPending ? '처리 중…' : editing ? '저장' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── 날짜 이력 입력 컴포넌트 ─────────────────────────────────── */
interface DateHistoryProps {
  entries: DateEntry[];
  onRemove: (i: number) => void;
  newDate: string; setNewDate: (v: string) => void;
  newNote: string; setNewNote: (v: string) => void;
  onAdd: () => void;
}

function DateHistoryField({ entries, onRemove, newDate, setNewDate, newNote, setNewNote, onAdd }: DateHistoryProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {/* 기존 이력 */}
      {entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ color: '#93c5fd', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatYM(e.date)}</span>
          {e.note && <span style={{ color: '#64748b', fontSize: '0.78rem', flex: 1 }}>{e.note}</span>}
          {!e.note && <span style={{ flex: 1 }} />}
          <button onClick={() => onRemove(i)}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: '0 0.1rem' }}>×</button>
        </div>
      ))}

      {/* 새 날짜 추가 */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <input type="month" value={newDate} onChange={e => setNewDate(e.target.value)}
          style={{ ...inputStyle, flex: '0 0 auto', width: '140px' }} />
        <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
          placeholder="메모 (선택)" style={{ ...inputStyle, flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }} />
        <button type="button" onClick={onAdd} disabled={!newDate}
          style={{ padding: '0.47rem 0.8rem', borderRadius: '7px', background: newDate ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${newDate ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`, color: newDate ? '#a5b4fc' : '#475569', fontSize: '0.8rem', fontWeight: 600, cursor: newDate ? 'pointer' : 'default', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          + 추가
        </button>
      </div>
    </div>
  );
}

/* ── 폼 필드 래퍼 ────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem', letterSpacing: '0.02em' }}>{label}</label>
      {children}
    </div>
  );
}

/* ── 스타일 상수 ─────────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function actionBtn(color: string, bg: string, bd: string): React.CSSProperties {
  return { padding: '0.2rem 0.6rem', borderRadius: '6px', background: bg, border: `1px solid ${bd}`, color, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
}
