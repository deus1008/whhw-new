'use client';

import { useState, useTransition, useMemo } from 'react';
import type { UpcomingProduct } from '@/app/products/page';
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
  title: '', launch_date: '', manufacturer: '',
  indication: '', insurance_price: '', insurance_code: '',
  status: '', memo: '',
};

/* ── 날짜 포맷 ─────────────────────────────────────────────────── */
function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m] = d.split('-');
  return m ? `${y}년 ${parseInt(m)}월` : d;
}

/* ── Props ─────────────────────────────────────────────────────── */
interface Props {
  initialProducts: UpcomingProduct[];
  isAdmin: boolean;
  userId: string;
}

/* ══════════════════════════════════════════════════════════════ */
export default function ProductsClient({ initialProducts, isAdmin }: Props) {
  const [products, setProducts]         = useState<UpcomingProduct[]>(initialProducts);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<UpcomingProduct | null>(null);
  const [form, setForm]                 = useState<ProductInput>(EMPTY_FORM);
  const [formError, setFormError]       = useState('');
  const [isPending, startTransition]    = useTransition();
  const [filterStatus, setFilterStatus]   = useState('');
  const [search, setSearch]               = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [sortKey, setSortKey]             = useState<string>('launch_date');
  const [sortDir, setSortDir]             = useState<'asc' | 'desc'>('asc');

  /* ── 회사 목록 (중복 제거) ─────────────────────────────────── */
  const companyList = useMemo(() => {
    const names = products
      .map(p => p.manufacturer?.trim())
      .filter((v): v is string => !!v);
    return Array.from(new Set(names)).sort();
  }, [products]);

  /* ── modal helpers ──────────────────────────────────────────── */
  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setFormError(''); setModalOpen(true);
  }
  function openEdit(p: UpcomingProduct) {
    setEditing(p);
    setForm({
      title:           p.title,
      launch_date:     p.launch_date?.slice(0, 7) ?? '',
      manufacturer:    p.manufacturer    ?? '',
      indication:      p.indication      ?? '',
      insurance_price: p.insurance_price ?? '',
      insurance_code:  p.insurance_code  ?? '',
      status:          p.status          ?? '',
      memo:            p.memo            ?? '',
    });
    setFormError(''); setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

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
        setProducts(prev => [...prev, result.data!].sort((a, b) =>
          (a.launch_date ?? '').localeCompare(b.launch_date ?? '')));
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

  /* ── 정렬 토글 ─────────────────────────────────────────────── */
  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  /* ── filter ─────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const base = products.filter(p => {
      const matchStatus  = !filterStatus  || p.status === filterStatus;
      const matchCompany = !filterCompany || (p.manufacturer ?? '') === filterCompany;
      const q = search.trim().toLowerCase();
      const matchSearch  = !q
        || (p.memo          ?? '').toLowerCase().includes(q)
        || p.title.toLowerCase().includes(q)
        || (p.indication    ?? '').toLowerCase().includes(q)
        || (p.manufacturer  ?? '').toLowerCase().includes(q)
        || (p.insurance_code ?? '').toLowerCase().includes(q);
      return matchStatus && matchCompany && matchSearch;
    });

    const STATUS_ORDER = Object.fromEntries(STATUS_LIST.map((s, i) => [s, i]));

    return [...base].sort((a, b) => {
      let va = '';
      let vb = '';
      switch (sortKey) {
        case 'memo':         va = a.memo         ?? ''; vb = b.memo         ?? ''; break;
        case 'title':        va = a.title        ?? ''; vb = b.title        ?? ''; break;
        case 'launch_date':  va = a.launch_date  ?? ''; vb = b.launch_date  ?? ''; break;
        case 'indication':   va = a.indication   ?? ''; vb = b.indication   ?? ''; break;
        case 'manufacturer': va = a.manufacturer ?? ''; vb = b.manufacturer ?? ''; break;
        case 'status':
          va = String(STATUS_ORDER[a.status ?? ''] ?? 99);
          vb = String(STATUS_ORDER[b.status ?? ''] ?? 99);
          break;
      }
      const cmp = va.localeCompare(vb, 'ko');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [products, filterStatus, filterCompany, search, sortKey, sortDir]);

  /* ══ RENDER ══════════════════════════════════════════════════ */
  return (
    <>
      {/* ── 헤더 ───────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
        <h2 style={{ fontSize: 'clamp(1.1rem,3vw,1.5rem)', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
          🚀 발매예정품목
        </h2>
        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.3rem' }}>
          자사 및 타사 발매예정·완료 파이프라인을 성분명 중심으로 관리합니다.
        </p>
      </div>

      {/* ── 검색 툴바 ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        {/* 성분명·제품명 통합 검색 */}
        <input
          type="text"
          placeholder="성분명 / 제품명 / 계열 검색"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 200px', ...inputStyle }}
        />

        {/* 회사 검색 */}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <input
            type="text"
            placeholder="🏢 회사 검색"
            value={filterCompany}
            onChange={e => setFilterCompany(e.target.value)}
            list="company-list"
            style={{ ...inputStyle, width: 180 }}
          />
          <datalist id="company-list">
            {companyList.map(c => <option key={c} value={c} />)}
          </datalist>
          {filterCompany && (
            <button
              onClick={() => setFilterCompany('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}
            >×</button>
          )}
        </div>

        {/* 상태 필터 */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.82rem', cursor: 'pointer' }}
        >
          <option value="">전체 상태</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {isAdmin && (
          <button onClick={openCreate}
            style={{ padding: '0.5rem 1.1rem', borderRadius: '8px', background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            + 품목 추가
          </button>
        )}
      </div>

      {/* ── 진행상태 배지 필터 ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.2rem', alignItems: 'center' }}>
        {STATUS_LIST.map(s => {
          const c = STATUS_COLOR[s];
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              style={{ padding: '0.2rem 0.65rem', borderRadius: '20px', background: filterStatus === s ? c.bg : 'transparent', border: `1px solid ${c.bd}`, color: c.color, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: filterStatus && filterStatus !== s ? 0.4 : 1, transition: 'opacity 0.15s' }}>
              {s}
            </button>
          );
        })}
        {(filterStatus || filterCompany || search) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterCompany(''); setSearch(''); }}
            style={{ padding: '0.2rem 0.65rem', borderRadius: '20px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            필터 초기화
          </button>
        )}
      </div>

      {/* ── 테이블 ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', color: '#475569' }}>
          {search || filterStatus || filterCompany ? '검색 결과가 없습니다.' : '등록된 품목이 없습니다.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {([
                  { label: '성분명',      key: 'memo'         },
                  { label: '제품명',      key: 'title'        },
                  { label: '발매(예정)일', key: 'launch_date'  },
                  { label: '계열',        key: 'indication'   },
                  { label: '회사',        key: 'manufacturer' },
                  { label: '보험코드',    key: null           },
                  { label: '보험가',      key: null           },
                  { label: '진행상태',    key: 'status'       },
                  { label: '',           key: null           },
                ] as { label: string; key: string | null }[]).map(({ label, key }) => (
                  <th
                    key={label || 'action'}
                    onClick={key ? () => toggleSort(key) : undefined}
                    style={{
                      padding: '0.65rem 0.9rem', textAlign: 'left',
                      color: key && sortKey === key ? '#e2e8f0' : '#64748b',
                      fontWeight: 700, fontSize: '0.78rem', whiteSpace: 'nowrap',
                      cursor: key ? 'pointer' : 'default',
                      userSelect: 'none',
                      transition: 'color 0.12s',
                    }}
                  >
                    {label}
                    {key && (
                      <span style={{ marginLeft: '0.3rem', fontSize: '0.65rem', opacity: sortKey === key ? 1 : 0.3 }}>
                        {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const sc = STATUS_COLOR[p.status ?? ''] ?? STATUS_COLOR['개발검토'];
                const rowBg = i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent';
                return (
                  <tr key={p.id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: rowBg }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>

                    {/* ① 성분명 — 주요 */}
                    <td style={{ padding: '0.7rem 0.9rem', color: '#e2e8f0', fontWeight: 700, minWidth: '80px', maxWidth: '160px' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
                        {p.memo || <span style={{ color: '#475569' }}>—</span>}
                      </span>
                    </td>

                    {/* ② 제품명 */}
                    <td style={{ padding: '0.7rem 0.9rem', color: '#93c5fd', minWidth: '120px', fontWeight: 500 }}>
                      {p.title}
                    </td>

                    {/* ③ 발매(예정)일 */}
                    <td style={{ padding: '0.7rem 0.9rem', color: '#a78bfa', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {fmtDate(p.launch_date)}
                    </td>

                    {/* ④ 계열 */}
                    <td style={{ padding: '0.7rem 0.9rem', color: '#94a3b8', maxWidth: '150px' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {p.indication ?? '—'}
                      </span>
                    </td>

                    {/* ⑤ 회사 */}
                    <td style={{ padding: '0.7rem 0.9rem', whiteSpace: 'nowrap' }}>
                      {p.manufacturer ? (
                        <span style={{
                          display: 'inline-block', padding: '0.12rem 0.5rem', borderRadius: '5px',
                          fontSize: '0.72rem', fontWeight: 600,
                          background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)',
                          color: '#6ee7b7',
                        }}>
                          {p.manufacturer}
                        </span>
                      ) : <span style={{ color: '#475569' }}>—</span>}
                    </td>

                    {/* ⑥ 보험코드 */}
                    <td style={{ padding: '0.7rem 0.9rem', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                      {p.insurance_code ?? '—'}
                    </td>

                    {/* ⑦ 보험가 */}
                    <td style={{ padding: '0.7rem 0.9rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {p.insurance_price ?? '—'}
                    </td>

                    {/* ⑧ 진행상태 */}
                    <td style={{ padding: '0.7rem 0.9rem', whiteSpace: 'nowrap' }}>
                      {p.status ? (
                        <span style={{ display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '20px', background: sc.bg, border: `1px solid ${sc.bd}`, color: sc.color, fontSize: '0.7rem', fontWeight: 700 }}>
                          {p.status}
                        </span>
                      ) : '—'}
                    </td>

                    {/* ⑨ 관리 버튼 */}
                    <td style={{ padding: '0.7rem 0.75rem', whiteSpace: 'nowrap' }}>
                      {isAdmin && (
                        <>
                          <button onClick={() => openEdit(p)} style={actionBtn('#60a5fa', 'rgba(59,130,246,0.12)', 'rgba(59,130,246,0.3)')}>수정</button>
                          <button onClick={() => handleDelete(p.id)} disabled={isPending}
                            style={{ ...actionBtn('#f87171', 'rgba(239,68,68,0.1)', 'rgba(239,68,68,0.3)'), marginLeft: '0.35rem' }}>삭제</button>
                        </>
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

      {/* ══ 등록/수정 모달 ════════════════════════════════════════ */}
      {modalOpen && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '520px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 1.5rem', color: '#e2e8f0', fontWeight: 700, fontSize: '1.05rem' }}>
              {editing ? '품목 수정' : '신규 품목 등록'}
            </h3>

            <Field label="성분명 *">
              <input value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="예) 파모티딘 20mg" style={inputStyle} />
            </Field>

            <Field label="제품명 *">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="예) 제품명 20mg" style={inputStyle} />
            </Field>

            <Field label="회사">
              <input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                placeholder="예) 위탁제약사명"
                list="company-list"
                style={inputStyle} />
            </Field>

            <Field label="발매(예정)일">
              <input type="month" value={form.launch_date} onChange={e => setForm(f => ({ ...f, launch_date: e.target.value }))}
                style={inputStyle} />
            </Field>

            <Field label="계열/적응증">
              <input value={form.indication} onChange={e => setForm(f => ({ ...f, indication: e.target.value }))}
                placeholder="예) 소화성궤양용제" style={inputStyle} />
            </Field>

            <Field label="보험코드">
              <input value={form.insurance_code} onChange={e => setForm(f => ({ ...f, insurance_code: e.target.value }))}
                placeholder="예) 643901260" style={inputStyle} />
            </Field>

            <Field label="보험가">
              <input value={form.insurance_price} onChange={e => setForm(f => ({ ...f, insurance_price: e.target.value }))}
                placeholder="예) 120원" style={inputStyle} />
            </Field>

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

/* ── 폼 필드 래퍼 ────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.35rem', letterSpacing: '0.02em' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function actionBtn(color: string, bg: string, bd: string): React.CSSProperties {
  return { padding: '0.2rem 0.6rem', borderRadius: '6px', background: bg, border: `1px solid ${bd}`, color, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
}
