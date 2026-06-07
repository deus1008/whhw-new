'use client';

import type { CSSProperties } from 'react';
import type { StockAlertItem } from '@/lib/inventory/parse';

// ── 날짜 포맷 ─────────────────────────────────────────────────────────────────
function fmtDate(s: string | null): string {
  if (!s) return '-';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
  return s;   // "전략적 재고소진", "6월" 등 텍스트 그대로
}

// ── 경보 색상 ─────────────────────────────────────────────────────────────────
type AlertColor = { badge: string; badgeBg: string; border: string; glow: string };
const ALERT_COLORS: Record<string, AlertColor> = {
  품절: { badge: '#ef4444', badgeBg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.35)', glow: 'rgba(239,68,68,0.08)' },
  예측: { badge: '#f59e0b', badgeBg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.30)', glow: 'rgba(245,158,11,0.06)' },
};
function alertColor(type: string): AlertColor {
  return ALERT_COLORS[type] ?? { badge: '#60a5fa', badgeBg: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.3)', glow: 'rgba(96,165,250,0.06)' };
}

// ── 재고일 배지 ───────────────────────────────────────────────────────────────
function StockDaysBadge({ days }: { days: number | null }) {
  if (days === null) return <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.3rem', fontWeight: 800 }}>-</span>;
  const color = days <= 0 ? '#ef4444' : days < 7 ? '#f87171' : days < 14 ? '#fb923c' : days < 30 ? '#fbbf24' : '#4ade80';
  return (
    <span style={{ fontWeight: 800, color, fontSize: '1.4rem', lineHeight: 1 }}>
      {days}일
    </span>
  );
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
function AlertCard({ item }: { item: StockAlertItem }) {
  const c = alertColor(item.alert_type);
  return (
    <div style={{
      borderRadius: '14px', padding: '1rem 1.1rem',
      background: 'rgba(255,255,255,0.035)',
      border: `1px solid ${c.border}`,
      boxShadow: `0 0 20px ${c.glow}`,
    }}>
      {/* 제품 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <span style={{
          flexShrink: 0, padding: '0.15rem 0.5rem', borderRadius: '5px', fontSize: '0.7rem',
          fontWeight: 700, background: c.badgeBg, color: c.badge, border: `1px solid ${c.border}`,
          marginTop: '2px',
        }}>
          {item.alert_type}
        </span>
        <div>
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', lineHeight: 1.3, margin: 0 }}>
            {item.product_name}
          </p>
          <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.32)', margin: '2px 0 0' }}>
            {item.product_code} · {item.manufacturer}
          </p>
        </div>
      </div>

      {/* 재고일 강조 */}
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

      {/* 날짜·수치 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', marginBottom: '0.7rem' }}>
        <Meta label="품절 예상일" value={fmtDate(item.stockout_start)} color="#fca5a5" />
        <Meta label="공급 예정일" value={fmtDate(item.supply_date)}    color="#86efac" />
        <Meta label="품절 기간"   value={item.stockout_days ?? '-'} />
        <Meta label="직3매출"     value={item.sales_3m !== null ? `${item.sales_3m.toFixed(1)} 백만` : '-'} />
      </div>

      {/* 발생유형 */}
      <div style={{
        padding: '0.38rem 0.65rem', borderRadius: '7px',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        fontSize: '0.73rem', color: 'rgba(255,255,255,0.48)',
      }}>
        원인: {item.cause || '-'}
      </div>
    </div>
  );
}

// ── 섹션 ─────────────────────────────────────────────────────────────────────
function Section({ title, items, color }: { title: string; items: StockAlertItem[]; color: string }) {
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
        {items.map((it, i) => <AlertCard key={i} item={it} />)}
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
}: {
  items: StockAlertItem[];
  fileName: string | null;
  uploadDate: string | null;
  error: string | null;
}) {
  const stockouts = items.filter(it => it.alert_type === '품절');
  const forecasts = items.filter(it => it.alert_type === '예측');

  return (
    <div style={{ marginTop: '1.2rem' }}>
      {/* 파일 정보 */}
      {fileName && (
        <p style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.28)', marginBottom: '1rem' }}>
          📂 기준 파일: {fileName}
          {uploadDate && ` · 업로드: ${fmtDate(uploadDate.slice(0, 10))}`}
        </p>
      )}

      {/* 오류 메시지 */}
      {error && (
        <div style={{
          padding: '0.9rem 1rem', borderRadius: '10px', marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: '0.83rem',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* 데이터 없음 */}
      {items.length === 0 && !error && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: '0.83rem' }}>
          문서관리 &gt; 재고관리 폴더에 품절예측현황 파일을 업로드하면 자동으로 표시됩니다.
        </div>
      )}

      {/* 요약 칩 */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
          <SummaryChip count={stockouts.length} label="품절"     color="#ef4444" />
          <SummaryChip count={forecasts.length} label="예측"     color="#f59e0b" />
          <SummaryChip count={items.length}     label="전체 경보" color="#60a5fa" />
        </div>
      )}

      {/* 섹션 */}
      {stockouts.length > 0 && (
        <Section title="🔴 품절" items={stockouts} color="#ef4444" />
      )}
      {forecasts.length > 0 && (
        <Section title="🟡 부족 예측" items={forecasts} color="#f59e0b" />
      )}
    </div>
  );
}
