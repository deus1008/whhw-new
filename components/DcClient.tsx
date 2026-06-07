'use client';

import { useState, useTransition, useRef } from 'react';
import { createDcItem, updateDcItem, deleteDcItem, type DcItem } from '@/app/dc/actions';

/* ── 상수 ────────────────────────────────────────────────── */
export const CATEGORIES = ['준비중', '약속', '상정', '통과'] as const;
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
  '약속': {
    color: '#fbbf24', dimColor: '#92400e',
    bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.22)', headerBg: 'rgba(251,191,36,0.1)',
    icon: '🤝', emoji: '🤝',
  },
  '상정': {
    color: '#60a5fa', dimColor: '#1e40af',
    bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.22)', headerBg: 'rgba(96,165,250,0.1)',
    icon: '📋', emoji: '📋',
  },
  '통과': {
    color: '#4ade80', dimColor: '#14532d',
    bg: 'rgba(74,222,128,0.06)', border: 'rgba(74,222,128,0.22)', headerBg: 'rgba(74,222,128,0.1)',
    icon: '✅', emoji: '✅',
  },
};

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

  return (
    <div style={{
      background: 'rgba(15,23,42,0.6)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderLeft: `3px solid ${catColor}`,
      borderRadius: '10px',
      padding: '0.85rem 0.9rem',
      transition: 'background 0.15s',
      backdropFilter: 'blur(4px)',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.6)')}
    >
      {/* 제품명 배지 */}
      <div style={{
        display: 'inline-block',
        padding: '0.18rem 0.55rem',
        background: 'rgba(248,113,113,0.13)',
        border: '1px solid rgba(248,113,113,0.25)',
        borderRadius: '6px',
        color: '#fca5a5',
        fontWeight: 700,
        fontSize: '0.82rem',
        marginBottom: '0.5rem',
        letterSpacing: '0.01em',
      }}>
        {item.product_name}
      </div>

      {/* 병원명 */}
      <div style={{
        color: '#7dd3fc',
        fontWeight: 600,
        fontSize: '0.85rem',
        marginBottom: item.progress ? '0.35rem' : 0,
        display: 'flex', alignItems: 'center', gap: '0.3rem',
      }}>
        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>🏥</span>
        {item.hospital_name}
      </div>

      {/* 진행현황 */}
      {item.progress && (
        <div style={{
          fontSize: '0.76rem',
          color: '#64748b',
          lineHeight: 1.45,
          wordBreak: 'keep-all',
        }}>
          {item.progress}
        </div>
      )}

      {/* 메모 펼침 */}
      {hasMemo && expanded && <MemoLines text={item.memo!} />}

      {/* 버튼 */}
      {(hasMemo || canEdit) && (
        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
          {hasMemo && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                padding: '0.2rem 0.5rem', borderRadius: '5px', fontSize: '0.68rem',
                border: '1px solid rgba(255,255,255,0.1)',
                background: expanded ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: '#64748b', cursor: 'pointer',
              }}
            >
              {expanded ? '▲ 접기' : '▼ 메모'}
            </button>
          )}
          {canEdit && (
            <>
              <button
                onClick={() => onEdit(item)}
                style={{
                  marginLeft: hasMemo ? 0 : 'auto',
                  padding: '0.2rem 0.55rem', borderRadius: '5px', fontSize: '0.68rem',
                  border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.1)',
                  color: '#a5b4fc', cursor: 'pointer',
                }}
              >
                수정
              </button>
              <button
                onClick={() => onDelete(item.id)}
                style={{
                  padding: '0.2rem 0.55rem', borderRadius: '5px', fontSize: '0.68rem',
                  border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)',
                  color: '#fca5a5', cursor: 'pointer',
                }}
              >
                삭제
              </button>
            </>
          )}
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

  const grouped = CATEGORIES.reduce<Record<string, DcItem[]>>((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat);
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
        display: 'flex', gap: '0.75rem', marginBottom: '1.8rem', flexWrap: 'wrap',
      }}>
        {CATEGORIES.map(cat => {
          const meta  = CAT_META[cat];
          const count = grouped[cat].length;
          return (
            <div key={cat} style={{
              flex: '1 1 100px',
              background: meta.headerBg,
              border: `1px solid ${meta.border}`,
              borderRadius: '12px',
              padding: '0.9rem 1.1rem',
              display: 'flex', flexDirection: 'column', gap: '0.3rem',
            }}>
              <div style={{ fontSize: '1rem' }}>{meta.emoji}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: meta.color, lineHeight: 1 }}>
                {count}
              </div>
              <div style={{ fontSize: '0.75rem', color: meta.color, opacity: 0.8, fontWeight: 600 }}>
                {cat}
              </div>
            </div>
          );
        })}

        {canEdit && (
          <button
            onClick={() => setModal({ open: true, item: null })}
            style={{
              flex: '0 0 auto', alignSelf: 'stretch',
              padding: '0 1.4rem', borderRadius: '12px', fontSize: '0.85rem',
              border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)',
              color: '#c4b5fd', cursor: 'pointer', fontWeight: 700,
              minWidth: '100px',
            }}
          >
            + 항목 추가
          </button>
        )}
      </div>

      {/* ── 세로 목록 ────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {CATEGORIES.map(cat => {
          const meta     = CAT_META[cat];
          const catItems = grouped[cat];

          return (
            <div key={cat} style={{
              background: meta.bg,
              border: `1px solid ${meta.border}`,
              borderRadius: '14px',
              overflow: 'hidden',
            }}>
              {/* 섹션 헤더 */}
              <div style={{
                padding: '0.75rem 1rem',
                background: meta.headerBg,
                borderBottom: `1px solid ${meta.border}`,
                display: 'flex', alignItems: 'center', gap: '0.6rem',
              }}>
                <span style={{ fontSize: '1rem' }}>{meta.emoji}</span>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: meta.color, flex: 1 }}>
                  {cat}
                </span>
                <span style={{
                  padding: '2px 10px', borderRadius: '100px',
                  background: `color-mix(in srgb, ${meta.color} 15%, transparent)`,
                  border: `1px solid ${meta.border}`,
                  color: meta.color, fontSize: '0.73rem', fontWeight: 700,
                }}>
                  {catItems.length}
                </span>
                {canEdit && (
                  <button
                    onClick={() => setModal({ open: true, item: { category: cat } as DcItem })}
                    style={{
                      padding: '0.22rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem',
                      border: `1px solid ${meta.border}`, background: 'transparent',
                      color: meta.color, cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    + 추가
                  </button>
                )}
              </div>

              {/* 카드 목록 */}
              {catItems.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '1.2rem',
                  color: 'rgba(255,255,255,0.15)', fontSize: '0.8rem',
                }}>
                  항목 없음
                </div>
              ) : (
                <div style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
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
