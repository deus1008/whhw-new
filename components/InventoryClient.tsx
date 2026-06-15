'use client';

import { useState, useTransition } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import type { StockAlertItem } from '@/lib/inventory/parse';
import { createInventoryItem, updateInventoryItem, deleteInventoryItem } from '@/app/inventory/actions';

export type DbItem = StockAlertItem & { id: string };
type DisplayItem = StockAlertItem & { _dbId?: string };

// ── 날짜 포맷 ─────────────────────────────────────────────────────────────────
function fmtDate(s: string | null): string {
  if (!s) return '-';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
  return s;
}

// ── 경보 색상 ─────────────────────────────────────────────────────────────────
type AlertColor = { badge: string; badgeBg: string; border: string; glow: string };
const ALERT_COLORS: Record<string, AlertColor> = {
  품절:     { badge: '#ef4444', badgeBg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.35)',   glow: 'rgba(239,68,68,0.08)' },
  품절예측:  { badge: '#f59e0b', badgeBg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.30)', glow: 'rgba(245,158,11,0.06)' },
  원활:     { badge: '#4ade80', badgeBg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.28)',  glow: 'rgba(74,222,128,0.05)' },
  과잉재고:  { badge: '#818cf8', badgeBg: 'rgba(129,140,248,0.12)', border: 'rgba(129,140,248,0.28)', glow: 'rgba(129,140,248,0.05)' },
};
function alertColor(type: string): AlertColor {
  return ALERT_COLORS[type] ?? { badge: '#60a5fa', badgeBg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.3)', glow: 'rgba(96,165,250,0.06)' };
}

// ── 재고일 배지 ───────────────────────────────────────────────────────────────
function StockDaysBadge({ days }: { days: number | null }) {
  if (days === null) return <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.3rem', fontWeight: 800 }}>-</span>;
  const color = days <= 0 ? '#ef4444' : days < 7 ? '#f87171' : days < 14 ? '#fb923c' : days < 30 ? '#fbbf24' : '#4ade80';
  return <span style={{ fontWeight: 800, color, fontSize: '1.4rem', lineHeight: 1 }}>{days}일</span>;
}

// ── 메타 항목 ─────────────────────────────────────────────────────────────────
function Meta({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      <span style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.32)', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: color ?? 'rgba(255,255,255,0.75)' }}>{value}</span>
    </div>
  );
}

// ── 요약 칩 ──────────────────────────────────────────────────────────────────
function SummaryChip({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{
      padding: '0.5rem 1.1rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.5rem',
      background: `${color}15`, border: `1px solid ${color}40`,
    }}>
      <span style={{ fontSize: '1.4rem', fontWeight: 900, color, lineHeight: 1 }}>{count}</span>
      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// ── 개별 카드 ─────────────────────────────────────────────────────────────────
function AlertCard({ item, onEdit, onDelete }: {
  item: DisplayItem;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const c = alertColor(item.alert_type);
  const editable = !!(onEdit || onDelete);
  return (
    <div style={{
      borderRadius: '14px', padding: '1rem 1.1rem',
      background: 'rgba(255,255,255,0.035)',
      border: `1px solid ${c.border}`,
      boxShadow: `0 0 20px ${c.glow}`,
      position: 'relative',
    }}>
      {editable && (
        <div style={{ position: 'absolute', top: '0.6rem', right: '0.7rem', display: 'flex', gap: '0.35rem' }}>
          {onEdit && (
            <button onClick={onEdit} style={{
              fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '5px',
              background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)',
              color: '#60a5fa', cursor: 'pointer',
            }}>수정</button>
          )}
          {onDelete && (
            <button onClick={onDelete} style={{
              fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '5px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#f87171', cursor: 'pointer',
            }}>삭제</button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.85rem', paddingRight: editable ? '5rem' : 0 }}>
        <span style={{
          flexShrink: 0, padding: '0.15rem 0.5rem', borderRadius: '5px', fontSize: '0.7rem',
          fontWeight: 700, background: c.badgeBg, color: c.badge, border: `1px solid ${c.border}`,
          marginTop: '2px',
        }}>{item.alert_type}</span>
        <div>
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', lineHeight: 1.3, margin: 0 }}>{item.product_name}</p>
          <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.32)', margin: '2px 0 0' }}>
            {item.product_code} · {item.manufacturer}
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.55rem 0.8rem', borderRadius: '10px',
        background: 'rgba(255,255,255,0.04)', marginBottom: '0.8rem',
      }}>
        <div>
          <p style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.32)', margin: '0 0 2px', letterSpacing: '0.04em' }}>재고일 (SF대비)</p>
          <StockDaysBadge days={item.stock_days} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.32)', margin: '0 0 2px', letterSpacing: '0.04em' }}>잔여재고</p>
          <span style={{
            fontSize: '0.88rem', fontWeight: 700,
            color: (item.stock_amount ?? -1) <= 0 ? '#ef4444' : 'rgba(255,255,255,0.7)',
          }}>
            {item.stock_amount !== null ? `${item.stock_amount.toFixed(2)} 백만` : '-'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', marginBottom: '0.7rem' }}>
        <Meta label="품절 예상일" value={fmtDate(item.stockout_start)} color="#fca5a5" />
        <Meta label="공급 예정일" value={fmtDate(item.supply_date)}    color="#86efac" />
        <Meta label="품절 기간"   value={item.stockout_days ?? '-'} />
        <Meta label="직3매출"     value={item.sales_3m !== null ? `${item.sales_3m.toFixed(1)} 백만` : '-'} />
      </div>

      <div style={{
        padding: '0.38rem 0.65rem', borderRadius: '7px',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        fontSize: '0.73rem', color: 'rgba(255,255,255,0.48)',
      }}>
        원인: {item.cause || '-'}
      </div>
      {item.memo && (
        <div style={{
          marginTop: '0.5rem', padding: '0.38rem 0.65rem', borderRadius: '7px',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          fontSize: '0.73rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}>
          메모: {item.memo}
        </div>
      )}
    </div>
  );
}

// ── 섹션 ─────────────────────────────────────────────────────────────────────
function Section({ title, items, color, onEdit, onDelete }: {
  title: string;
  items: DisplayItem[];
  color: string;
  onEdit: (item: DisplayItem) => void;
  onDelete: (item: DisplayItem) => void;
}) {
  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '0.75rem',
  };
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ width: '3px', height: '16px', borderRadius: '2px', background: color }} />
        <h3 style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)', margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {title}
        </h3>
        <span style={{ fontSize: '0.75rem', color, fontWeight: 700 }}>({items.length})</span>
      </div>
      <div style={gridStyle}>
        {items.map((it, i) => (
          <AlertCard
            key={it._dbId ?? i}
            item={it}
            onEdit={() => onEdit(it)}
            onDelete={it._dbId ? () => onDelete(it) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ── 폼 입력 스타일 ────────────────────────────────────────────────────────────
const iStyle: CSSProperties = {
  width: '100%', padding: '0.5rem 0.7rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', fontSize: '0.83rem', boxSizing: 'border-box',
  outline: 'none',
};
const lStyle: CSSProperties = {
  fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0.25rem', letterSpacing: '0.04em',
};

const EMPTY: StockAlertItem = {
  alert_type: '품절예측', product_code: '', product_name: '',
  sales_3m: null, sales_month: null, stock_amount: null, stock_days: null,
  stockout_start: null, supply_date: null, stockout_days: null,
  manufacturer: '', cause: '', memo: null,
};

// ── 폼 모달 ──────────────────────────────────────────────────────────────────
function ItemFormModal({ initial, onSave, onClose, isPending }: {
  initial?: StockAlertItem;
  onSave: (data: StockAlertItem) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<StockAlertItem>(initial ? { ...initial } : { ...EMPTY });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upd = (k: keyof StockAlertItem, v: any) => setForm(p => ({ ...p, [k]: v }));

  const strVal  = (k: keyof StockAlertItem) => (form[k] as string) ?? '';
  const nullStr = (k: keyof StockAlertItem) => (form[k] as string | null) ?? '';
  const numVal  = (k: keyof StockAlertItem) => (form[k] !== null && form[k] !== undefined ? String(form[k]) : '');

  const onStr     = (k: keyof StockAlertItem) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => upd(k, e.target.value);
  const onNullStr = (k: keyof StockAlertItem) => (e: ChangeEvent<HTMLInputElement>) => upd(k, e.target.value || null);
  const onNum     = (k: keyof StockAlertItem) => (e: ChangeEvent<HTMLInputElement>) => upd(k, e.target.value === '' ? null : Number(e.target.value));

  const canSave = form.product_name.trim().length > 0 && !isPending;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '520px', margin: '1rem', borderRadius: '16px', background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          {initial ? '항목 수정' : '새 항목 추가'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={lStyle}>구분</p>
            <select value={form.alert_type} onChange={onStr('alert_type')} style={{ ...iStyle, cursor: 'pointer' }}>
              <option value="품절">품절</option>
              <option value="품절예측">품절예측</option>
              <option value="원활">원활</option>
              <option value="과잉재고">과잉재고</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <p style={lStyle}>제품명 *</p>
            <input type="text" placeholder="제품명" value={strVal('product_name')} onChange={onStr('product_name')} style={iStyle} />
          </div>

          <div>
            <p style={lStyle}>제품코드</p>
            <input type="text" placeholder="제품코드" value={strVal('product_code')} onChange={onStr('product_code')} style={iStyle} />
          </div>
          <div>
            <p style={lStyle}>제조처</p>
            <input type="text" placeholder="제조처" value={strVal('manufacturer')} onChange={onStr('manufacturer')} style={iStyle} />
          </div>

          <div>
            <p style={lStyle}>직3매출 (백만)</p>
            <input type="number" step="0.1" placeholder="0.0" value={numVal('sales_3m')} onChange={onNum('sales_3m')} style={iStyle} />
          </div>
          <div>
            <p style={lStyle}>당월매출 (백만)</p>
            <input type="number" step="0.1" placeholder="0.0" value={numVal('sales_month')} onChange={onNum('sales_month')} style={iStyle} />
          </div>

          <div>
            <p style={lStyle}>재고 (백만)</p>
            <input type="number" step="0.01" placeholder="0.00" value={numVal('stock_amount')} onChange={onNum('stock_amount')} style={iStyle} />
          </div>
          <div>
            <p style={lStyle}>재고일 (SF대비)</p>
            <input type="number" step="1" placeholder="0" value={numVal('stock_days')} onChange={onNum('stock_days')} style={iStyle} />
          </div>

          <div>
            <p style={lStyle}>품절 예상일</p>
            <input type="text" placeholder="YYYY-MM-DD 또는 텍스트" value={nullStr('stockout_start')} onChange={onNullStr('stockout_start')} style={iStyle} />
          </div>
          <div>
            <p style={lStyle}>공급 예정일</p>
            <input type="text" placeholder="YYYY-MM-DD 또는 텍스트" value={nullStr('supply_date')} onChange={onNullStr('supply_date')} style={iStyle} />
          </div>

          <div>
            <p style={lStyle}>품절 기간</p>
            <input type="text" placeholder="예: 14일" value={nullStr('stockout_days')} onChange={onNullStr('stockout_days')} style={iStyle} />
          </div>
          <div>
            <p style={lStyle}>발생유형/원인</p>
            <input type="text" placeholder="원인" value={strVal('cause')} onChange={onStr('cause')} style={iStyle} />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <p style={lStyle}>메모</p>
            <textarea
              placeholder="메모 (선택)"
              value={(form.memo as string | null) ?? ''}
              onChange={e => upd('memo', e.target.value || null)}
              rows={3}
              style={{ ...iStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={isPending} style={{
            padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
          }}>취소</button>
          <button onClick={() => { if (canSave) onSave(form); }} disabled={!canSave} style={{
            padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600,
            background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.4)',
            color: '#60a5fa', cursor: canSave ? 'pointer' : 'not-allowed', opacity: isPending ? 0.7 : 1,
          }}>
            {isPending ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function InventoryClient({
  items,
  fileName,
  uploadDate,
  error,
  dbItems,
}: {
  items: StockAlertItem[];
  fileName: string | null;
  uploadDate: string | null;
  error: string | null;
  dbItems: DbItem[];
}) {
  const [modalState, setModalState] = useState<
    null | { mode: 'create' } | { mode: 'edit'; item: DbItem } | { mode: 'import'; item: StockAlertItem }
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // DB items take priority; Excel items without a matching product_code show as read-only
  const dbCodes = new Set(dbItems.map(i => i.product_code).filter(Boolean));
  const excelOnly = items.filter(i => !i.product_code || !dbCodes.has(i.product_code));

  function makeSection(type: string): DisplayItem[] {
    return [
      ...dbItems.filter(i => i.alert_type === type).map(i => ({ ...i, _dbId: i.id })),
      ...excelOnly.filter(i => i.alert_type === type),
    ];
  }
  const allStockouts  = makeSection('품절');
  const allForecasts  = makeSection('품절예측');
  const allSmooth     = makeSection('원활');
  const allExcess     = makeSection('과잉재고');
  const totalCount = allStockouts.length + allForecasts.length + allSmooth.length + allExcess.length;

  function openEdit(item: DisplayItem) {
    setActionError(null);
    if (item._dbId) {
      const db = dbItems.find(d => d.id === item._dbId);
      if (db) setModalState({ mode: 'edit', item: db });
    } else {
      // Excel 항목: 내용을 미리 채운 뒤 DB에 새로 저장
      setModalState({ mode: 'import', item: item });
    }
  }

  function openDelete(item: DisplayItem) {
    if (!item._dbId) return;
    const id = item._dbId;
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    setActionError(null);
    startTransition(async () => {
      const res = await deleteInventoryItem(id);
      if (res?.error) setActionError(res.error);
    });
  }

  function handleSave(data: StockAlertItem) {
    startTransition(async () => {
      let res: { error?: string };
      if (modalState?.mode === 'edit') {
        res = await updateInventoryItem(modalState.item.id, data);
      } else {
        res = await createInventoryItem(data);
      }
      if (res?.error) setActionError(res.error);
      else setModalState(null);
    });
  }

  return (
    <div style={{ marginTop: '1.2rem' }}>
      {/* 파일 정보 */}
      {fileName && (
        <p style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.28)', marginBottom: '1rem' }}>
          📂 기준 파일: {fileName}
          {uploadDate && ` · 업로드: ${fmtDate(uploadDate.slice(0, 10))}`}
        </p>
      )}

      {/* 오류 */}
      {(error || actionError) && (
        <div style={{
          padding: '0.9rem 1rem', borderRadius: '10px', marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: '0.83rem',
        }}>
          ⚠️ {error ?? actionError}
        </div>
      )}

      {/* 헤더: 요약 칩 + 추가 버튼 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {totalCount > 0 && (
            <>
              <SummaryChip count={allStockouts.length} label="품절"     color="#ef4444" />
              <SummaryChip count={allForecasts.length} label="품절예측" color="#f59e0b" />
              <SummaryChip count={allSmooth.length}    label="원활"     color="#4ade80" />
              <SummaryChip count={allExcess.length}    label="과잉재고" color="#818cf8" />
              <SummaryChip count={totalCount}          label="전체"     color="#60a5fa" />
            </>
          )}
        </div>
        <button
          onClick={() => { setActionError(null); setModalState({ mode: 'create' }); }}
          style={{
            padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600,
            background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)',
            color: '#4ade80', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          + 새 항목 추가
        </button>
      </div>

      {/* 데이터 없음 */}
      {totalCount === 0 && !error && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: '0.83rem' }}>
          문서관리 &gt; 재고관리 폴더에 파일을 업로드하거나 항목을 직접 추가하세요.
        </div>
      )}

      {/* 섹션 */}
      {allStockouts.length > 0 && (
        <Section title="🔴 품절" items={allStockouts} color="#ef4444" onEdit={openEdit} onDelete={openDelete} />
      )}
      {allForecasts.length > 0 && (
        <Section title="🟡 품절 예측" items={allForecasts} color="#f59e0b" onEdit={openEdit} onDelete={openDelete} />
      )}
      {allSmooth.length > 0 && (
        <Section title="🟢 원활" items={allSmooth} color="#4ade80" onEdit={openEdit} onDelete={openDelete} />
      )}
      {allExcess.length > 0 && (
        <Section title="🔵 과잉재고" items={allExcess} color="#818cf8" onEdit={openEdit} onDelete={openDelete} />
      )}

      {/* 폼 모달 */}
      {modalState && (
        <ItemFormModal
          initial={modalState.mode === 'edit' || modalState.mode === 'import' ? modalState.item : undefined}
          onSave={handleSave}
          onClose={() => setModalState(null)}
          isPending={isPending}
        />
      )}
    </div>
  );
}
