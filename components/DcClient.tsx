'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { createDcItem, updateDcItem, deleteDcItem, type DcItem } from '@/app/dc/actions';

/* ── 상수 ────────────────────────────────────────────────── */
export const CATEGORIES = ['준비중', '접수', '코드인', '탈락'] as const;
type CatKey = typeof CATEGORIES[number];

export const CAT_META: Record<CatKey, {
  color: string; dimColor: string;
  bg: string; border: string; headerBg: string;
  icon: string; emoji: string;
}> = {
  '준비중': {
    color: '#94a3b8', dimColor: '#475569',
    bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.22)', headerBg: 'rgba(148,163,184,0.1)',
    icon: '🔄', emoji: '🔄',
  },
  '접수': {
    color: '#fbbf24', dimColor: '#92400e',
    bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.22)', headerBg: 'rgba(251,191,36,0.1)',
    icon: '📩', emoji: '📩',
  },
  '코드인': {
    color: '#4ade80', dimColor: '#14532d',
    bg: 'rgba(74,222,128,0.06)', border: 'rgba(74,222,128,0.22)', headerBg: 'rgba(74,222,128,0.1)',
    icon: '✅', emoji: '✅',
  },
  '탈락': {
    color: '#f87171', dimColor: '#7f1d1d',
    bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.22)', headerBg: 'rgba(248,113,113,0.1)',
    icon: '❌', emoji: '❌',
  },
};

/* ── 품목 검색 드롭다운 ──────────────────────────────────── */
function ProductFilterSelect({
  products,
  value,
  onChange,
}: {
  products: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? products.filter(p => p.toLowerCase().includes(query.toLowerCase()))
    : products;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(p: string | null) {
    onChange(p);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>품목</span>

      <div
        style={{
          position: 'relative',
          minWidth: '180px', maxWidth: '260px',
        }}
      >
        {/* 트리거 */}
        <div
          onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.6rem',
            background: value ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)',
            border: value ? '1px solid rgba(248,113,113,0.4)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', cursor: 'pointer',
            fontSize: '0.78rem', color: value ? '#fca5a5' : '#64748b',
            userSelect: 'none',
          }}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value ?? '전체 품목'}
          </span>
          {value ? (
            <span
              onClick={e => { e.stopPropagation(); select(null); }}
              style={{ fontSize: '0.7rem', color: 'rgba(248,113,113,0.6)', cursor: 'pointer', flexShrink: 0 }}
            >✕</span>
          ) : (
            <span style={{ fontSize: '0.65rem', color: '#475569', flexShrink: 0 }}>▼</span>
          )}
        </div>

        {/* 드롭다운 */}
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px', zIndex: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}>
            {/* 검색 */}
            <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="품목 검색…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px', padding: '0.3rem 0.5rem',
                  color: '#e2e8f0', fontSize: '0.76rem', fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
            {/* 전체 옵션 */}
            <div
              onClick={() => select(null)}
              style={{
                padding: '0.35rem 0.7rem', fontSize: '0.76rem', cursor: 'pointer',
                color: !value ? '#fca5a5' : '#94a3b8',
                background: !value ? 'rgba(248,113,113,0.08)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = !value ? 'rgba(248,113,113,0.08)' : 'transparent')}
            >
              전체 품목
            </div>
            {/* 품목 목록 */}
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '0.5rem 0.7rem', fontSize: '0.74rem', color: '#475569' }}>검색 결과 없음</div>
              ) : filtered.map(p => (
                <div
                  key={p}
                  onClick={() => select(p)}
                  style={{
                    padding: '0.35rem 0.7rem', fontSize: '0.76rem', cursor: 'pointer',
                    color: value === p ? '#fca5a5' : '#cbd5e1',
                    background: value === p ? 'rgba(248,113,113,0.1)' : 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = value === p ? 'rgba(248,113,113,0.1)' : 'transparent')}
                >
                  {p}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 메모 렌더 ───────────────────────────────────────────── */
function MemoLines({ text }: { text: string }) {
  const lines = text.split('\n').filter(l => l.trim());
  return (
    <div style={{
      marginTop: '0.6rem', paddingTop: '0.6rem',
      borderTop: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', gap: '0.2rem',
    }}>
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        const isNote   = trimmed.startsWith('※');
        const isBullet = trimmed.startsWith('-') || trimmed.startsWith('•');
        return (
          <div key={i} style={{
            paddingLeft: isBullet ? '0.8rem' : 0,
            fontSize: '0.76rem',
            color: isNote ? '#fbbf24' : isBullet ? '#94a3b8' : '#64748b',
            lineHeight: 1.5,
          }}>
            {isBullet
              ? <><span style={{ color: '#475569', marginRight: '0.3rem' }}>•</span>{trimmed.slice(1).trim()}</>
              : trimmed}
          </div>
        );
      })}
    </div>
  );
}

/* ── 항목 카드 ───────────────────────────────────────────── */
function ItemCard({
  item, canEdit, catColor, catBorder,
  onEdit, onDelete,
}: {
  item: DcItem; canEdit: boolean;
  catColor: string; catBorder: string;
  onEdit: (item: DcItem) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMemo = !!item.memo?.trim();

  const dday = item.due_date ? (() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const due   = new Date(item.due_date);
    const diff  = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    const color = diff < 0 ? '#f87171' : diff <= 7 ? '#fbbf24' : '#64748b';
    const label = diff < 0 ? `D+${-diff}` : diff === 0 ? 'D-Day' : `D-${diff}`;
    return { color, label };
  })() : null;

  return (
    <div
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.6)')}
      style={{
        background: 'rgba(15,23,42,0.6)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${catColor}`,
        borderRadius: '8px',
        padding: '0.4rem 0.7rem',
        transition: 'background 0.15s',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
        minHeight: 0,
      }}
    >
      {/* 제품명 */}
      <span style={{
        padding: '0.1rem 0.45rem', flexShrink: 0,
        background: 'rgba(248,113,113,0.13)', border: '1px solid rgba(248,113,113,0.25)',
        borderRadius: '5px', color: '#fca5a5', fontWeight: 700, fontSize: '0.78rem',
      }}>
        {item.product_name}
      </span>

      {/* 병원명 */}
      <span style={{ color: '#7dd3fc', fontWeight: 600, fontSize: '0.82rem', flexShrink: 0 }}>
        🏥 {item.hospital_name}
      </span>

      {/* 진행현황 */}
      {item.progress && (
        <span style={{ fontSize: '0.75rem', color: '#64748b', flex: 1, minWidth: '60px' }}>
          {item.progress}
        </span>
      )}

      {/* 기한 D-Day */}
      {dday && item.due_date && (
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, color: dday.color, flexShrink: 0,
          background: `${dday.color}18`, border: `1px solid ${dday.color}44`,
          borderRadius: '4px', padding: '0.05rem 0.4rem',
        }} title={`기한 ${item.due_date.replace(/-/g, '.')}`}>
          {dday.label}
        </span>
      )}

      {/* 메모 · 수정 · 삭제 버튼 */}
      <span style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, marginLeft: 'auto' }}>
        {hasMemo && (
          <button onClick={() => setExpanded(e => !e)} style={{
            padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.67rem',
            border: '1px solid rgba(255,255,255,0.1)',
            background: expanded ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: '#64748b', cursor: 'pointer',
          }}>
            {expanded ? '▲' : '▼ 메모'}
          </button>
        )}
        {canEdit && (
          <>
            <button onClick={() => onEdit(item)} style={{
              padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.67rem',
              border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)',
              color: '#a5b4fc', cursor: 'pointer',
            }}>수정</button>
            <button onClick={() => onDelete(item.id)} style={{
              padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.67rem',
              border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)',
              color: '#fca5a5', cursor: 'pointer',
            }}>삭제</button>
          </>
        )}
      </span>

      {/* 메모 펼침 (전체 너비) */}
      {hasMemo && expanded && (
        <div style={{ width: '100%' }}>
          <MemoLines text={item.memo!} />
        </div>
      )}
    </div>
  );
}

/* ── 폼 모달 ─────────────────────────────────────────────── */
function DcFormModal({
  initial, onClose, onSaved,
}: {
  initial?: DcItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = !!initial?.id;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setError('');
    startTransition(async () => {
      const res = isEdit ? await updateDcItem(fd) : await createDcItem(fd);
      if (res?.error) { setError(res.error); return; }
      onSaved();
      onClose();
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.75rem',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.88rem',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: '0.3rem',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '1rem',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '18px',
        padding: '2rem',
        width: '100%', maxWidth: '540px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ margin: '0 0 1.4rem', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {isEdit ? '✏️ DC 현황 수정' : '➕ DC 현황 추가'}
        </h3>

        <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isEdit && <input type="hidden" name="id" value={initial!.id} />}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label style={labelStyle}>제품명 *</label>
              <input name="product_name" defaultValue={initial?.product_name} placeholder="예: 엑솔0.7%" style={inputStyle} required />
            </div>
            <div>
              <label style={labelStyle}>병원명 *</label>
              <input name="hospital_name" defaultValue={initial?.hospital_name} placeholder="예: 서울아산병원" style={inputStyle} required />
            </div>
          </div>

          <div>
            <label style={labelStyle}>진행현황</label>
            <input
              name="progress"
              defaultValue={initial?.progress ?? ''}
              placeholder="예: 5/20 접수 → 7월 심의 → 9월 코드 오픈 예정"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>기한 <span style={{ fontWeight: 400, color: 'rgba(148,163,184,0.6)' }}>(진행현황)</span></label>
            <input
              name="due_date"
              type="date"
              defaultValue={initial?.due_date ?? ''}
              style={{ ...inputStyle, width: '180px', colorScheme: 'dark' }}
            />
          </div>

          <div>
            <label style={labelStyle}>진행단계 *</label>
            <select name="category" defaultValue={initial?.category ?? '준비중'} style={inputStyle} required>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{CAT_META[c].icon} {c}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>
              메모 <span style={{ fontWeight: 400, color: 'rgba(148,163,184,0.6)' }}>(※·- 로 항목 구분)</span>
            </label>
            <textarea
              name="memo"
              defaultValue={initial?.memo ?? ''}
              rows={4}
              placeholder={`※ 처방 시점 협의 필요\n- Dr. 협의 예정`}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          <div>
            <label style={labelStyle}>정렬 순서 (숫자가 작을수록 위)</label>
            <input name="sort_order" type="number" defaultValue={initial?.sort_order ?? 0}
              style={{ ...inputStyle, width: '100px' }} />
          </div>

          {error && <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: 0 }}>⚠ {error}</p>}

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
            <button type="button" onClick={onClose} style={{
              padding: '0.55rem 1.2rem', borderRadius: '8px', fontSize: '0.85rem',
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}>취소</button>
            <button type="submit" disabled={pending} style={{
              padding: '0.55rem 1.4rem', borderRadius: '8px', fontSize: '0.85rem',
              border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.2)',
              color: '#c4b5fd', cursor: pending ? 'not-allowed' : 'pointer', fontWeight: 600,
            }}>
              {pending ? '저장 중…' : isEdit ? '수정 저장' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────── */
export default function DcClient({
  initialItems, canEdit,
}: {
  initialItems: DcItem[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<DcItem[]>(initialItems);
  const [modal, setModal] = useState<{ open: boolean; item?: DcItem | null }>({ open: false });
  const [deletePending, startDelete] = useTransition();
  const [filterProduct, setFilterProduct] = useState<string | null>(null);

  // 품목 목록 (등장 순서 유지, 중복 제거)
  const allProducts = [...new Set(items.map(i => i.product_name))];

  const filteredItems = filterProduct
    ? items.filter(i => i.product_name === filterProduct)
    : items;

  const grouped = CATEGORIES.reduce<Record<string, DcItem[]>>((acc, cat) => {
    acc[cat] = filteredItems.filter(i => i.category === cat);
    return acc;
  }, {});

  function handleEdit(item: DcItem) { setModal({ open: true, item }); }

  function handleDelete(id: string) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    startDelete(async () => {
      const res = await deleteDcItem(id);
      if (res?.error) { alert(res.error); return; }
      setItems(prev => prev.filter(i => i.id !== id));
    });
  }

  function handleSaved() { window.location.reload(); }

  return (
    <div style={{ width: '100%' }}>

      {/* ── 상단 요약 통계 ──────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap',
      }}>
        {CATEGORIES.map(cat => {
          const meta  = CAT_META[cat];
          const count = grouped[cat].length;
          return (
            <div key={cat} style={{
              flex: '1 1 80px',
              background: meta.headerBg,
              border: `1px solid ${meta.border}`,
              borderRadius: '10px',
              padding: '0.45rem 0.8rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{meta.emoji}</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: meta.color, lineHeight: 1 }}>
                {count}
              </span>
              <span style={{ fontSize: '0.72rem', color: meta.color, opacity: 0.8, fontWeight: 600 }}>
                {cat}
              </span>
            </div>
          );
        })}

        {canEdit && (
          <button
            onClick={() => setModal({ open: true, item: null })}
            style={{
              flex: '0 0 auto', alignSelf: 'stretch',
              padding: '0.45rem 1rem', borderRadius: '10px', fontSize: '0.8rem',
              border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)',
              color: '#c4b5fd', cursor: 'pointer', fontWeight: 700,
            }}
          >
            + 항목 추가
          </button>
        )}
      </div>

      {/* ── 품목 필터 ───────────────────────────────────────── */}
      {allProducts.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <ProductFilterSelect
            products={allProducts}
            value={filterProduct}
            onChange={setFilterProduct}
          />
        </div>
      )}

      {/* ── 세로 목록 ────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {CATEGORIES.map(cat => {
          const meta     = CAT_META[cat];
          const catItems = grouped[cat];

          return (
            <div key={cat} style={{
              background: meta.bg,
              border: `1px solid ${meta.border}`,
              borderRadius: '10px',
              overflow: 'hidden',
            }}>
              {/* 섹션 헤더 */}
              <div style={{
                padding: '0.32rem 0.7rem',
                background: meta.headerBg,
                borderBottom: catItems.length > 0 ? `1px solid ${meta.border}` : 'none',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <span style={{ fontSize: '0.85rem' }}>{meta.emoji}</span>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: meta.color, flex: 1 }}>
                  {cat}
                </span>
                <span style={{
                  padding: '1px 8px', borderRadius: '100px',
                  background: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
                  border: `1px solid ${meta.border}`,
                  color: meta.color, fontSize: '0.68rem', fontWeight: 700,
                }}>
                  {catItems.length}
                </span>
                {canEdit && (
                  <button
                    onClick={() => setModal({ open: true, item: { category: cat } as DcItem })}
                    style={{
                      padding: '0.12rem 0.5rem', borderRadius: '5px', fontSize: '0.72rem',
                      border: `1px solid ${meta.border}`, background: 'transparent',
                      color: meta.color, cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    + 추가
                  </button>
                )}
              </div>

              {/* 카드 목록 */}
              {catItems.length > 0 && (
                <div style={{ padding: '0.35rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {catItems.map(item => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      canEdit={canEdit}
                      catColor={meta.color}
                      catBorder={meta.border}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 모달 */}
      {modal.open && (
        <DcFormModal
          initial={modal.item}
          onClose={() => setModal({ open: false })}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
