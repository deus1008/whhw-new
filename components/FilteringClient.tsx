'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { createFilteringBatch, updateFiltering, deleteFiltering, confirmFiltering, refreshFilteringResults, getFilteringLogs } from '@/app/filtering/actions';
import type { FilteringInput } from '@/app/filtering/actions';
import type { HospitalHit } from '@/app/api/hospital-search/route';
import type { ProductHit } from '@/app/api/product-search/route';

/* ── 타입 ── */
export type FilteringRow = {
  id:            string;
  seq:           number | null;
  received_date: string | null;
  ym:            string | null;
  manager:       string | null;
  company_name:  string | null;
  dealer_name:   string | null;
  dealer_phone:  string | null;
  hospital_code: string | null;
  hospital_type: string | null;
  hospital_name: string | null;
  product_name:  string | null;
  department:    string | null;
  kol:           string | null;
  dc_timing:     string | null;
  coding_month:  string | null;
  edi_received:  string | null;
  mbo:           number | null;
  answer:        string | null;
  final_result:  string | null;
  memo:          string | null;
  status:        string | null;   // pending | answered | confirmed
  item_insurance_code: string | null;  // 품목 보험코드(EDI 매칭)
  result_auto:   boolean | null;       // 최종결과 자동표기 여부
  first_rx_amount: number | null;      // 최초처방월의 처방금액
  last_rx_month: string | null;        // 최근 처방월
  last_rx_amount: number | null;       // 최근 처방월의 처방금액
  notify_target: string | null;        // 통보대상
  notify_reason: string | null;        // 사유
  user_id:       string | null;
  created_at:    string;
};

const HOSPITAL_TYPES = ['상급종합', '종합병원', '병원', '의원', '기타'];
const ANSWER_OPTS    = ['O', 'X', '취소', '준비중'];
const YESNO          = ['', 'O', 'X'];

const EMPTY: FilteringInput = {
  received_date: '', ym: '', manager: '', company_name: '',
  dealer_name: '', dealer_phone: '', hospital_code: '',
  hospital_type: '종합병원', hospital_name: '', product_name: '',
  department: '', kol: '', dc_timing: '', coding_month: '',
  edi_received: '', mbo: '', answer: '', final_result: '', memo: '',
  item_insurance_code: '', notify_target: '', notify_reason: '',
};

/* ── 유틸 ── */
function fmtDate(d: string | null): string {
  if (!d) return '-';
  return d.replace(/-/g, '.').slice(0, 10);
}
function fmtMbo(v: number | null): string {
  return v == null ? '-' : v.toLocaleString();
}
function fmtDateTime(s: string): string {
  try {
    const k = new Date(new Date(s).getTime() + 9 * 3600 * 1000);
    return k.toISOString().slice(0, 16).replace('T', ' ').replace(/-/g, '.');
  } catch { return s; }
}
/** 최종결과가 처방시작월(날짜)인지 판별 */
function isPrescribed(final: string | null): boolean {
  return !!final && /^\d{4}[-./]\d{1,2}/.test(final.trim());
}

/* 답변(영업가능여부) 색상 — 좌측 강조선/하이라이트용 */
function answerRgb(a: string | null): string {
  const raw = (a ?? '').trim(); const up = raw.toUpperCase();
  if (up === 'O') return '34,197,94';
  if (up === 'X') return '239,68,68';
  if (raw === '취소') return '109,40,217';
  if (raw === '준비중') return '251,146,60';
  return '148,163,184';
}

/* ── 답변 하이라이트(가장 중요 — 크고 굵게, 맨 앞) ── */
function AnswerHL({ a }: { a: string | null }) {
  const raw = (a ?? '').trim(); const up = raw.toUpperCase();
  let col = '#64748b', label = raw || '미답변';
  if (up === 'O')       { col = '#059669'; label = '가능'; }
  else if (up === 'X')  { col = '#dc2626'; label = '불가'; }
  else if (raw === '취소') { col = '#6d28d9'; label = '취소'; }
  else if (raw === '준비중') { col = '#c2410c'; label = '준비중'; }
  const rgb = answerRgb(a);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '3.4rem', padding: '0.3rem 0.7rem', borderRadius: 8,
      background: `rgba(${rgb},0.16)`, border: `1.5px solid rgba(${rgb},0.55)`,
      color: col, fontWeight: 800, fontSize: '0.92rem', letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}


/* ── 진행상태 배지 ── */
function StatusBadge({ s }: { s: string | null }) {
  const v = s ?? 'confirmed';
  let rgb = '148,163,184', col = '#64748b', label = '확인';
  if (v === 'pending')       { rgb = '251,146,60'; col = '#c2410c'; label = '답변대기'; }
  else if (v === 'answered') { rgb = '37,99,235';  col = '#2563eb'; label = '답변완료'; }
  return (
    <span style={{
      fontSize: '0.66rem', fontWeight: 700, whiteSpace: 'nowrap', padding: '0.1rem 0.42rem', borderRadius: 5,
      background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.3)`, color: col,
    }}>{label}</span>
  );
}

/* ── 스타일 ── */
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.65rem', background: '#f1f5f9',
  border: '1px solid #d7dce5', borderRadius: '8px', color: '#111827',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.28rem', fontWeight: 600,
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.55rem 1.4rem', borderRadius: '8px', border: 'none',
  background: '#4f46e5', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const BTN_GHOST: React.CSSProperties = {
  padding: '0.45rem 1rem', borderRadius: '8px', background: 'transparent',
  border: '1px solid #d7dce5', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
};
const cellTd: React.CSSProperties = {
  padding: '0.5rem 0.6rem', fontSize: '0.78rem', color: '#334155',
  borderBottom: '1px solid #f8fafc', verticalAlign: 'top',
};
const cellTh: React.CSSProperties = {
  padding: '0.5rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600,
  textAlign: 'left', whiteSpace: 'nowrap', background: '#ffffff', borderBottom: '1px solid #e5e9f0',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: '0.7rem' }}><label style={LABEL_STYLE}>{label}</label>{children}</div>;
}

/* ── CSV ── */
const CSV_HEADERS = [
  '접수일자', '년월', '담당자', '업체명', '딜러명', '딜러연락처', '처방처코드', '종별', '처방처명',
  '품목명', '처방과', 'KOL', 'DC접수시기', '코딩가능월', 'EDI수령여부', 'MBO', '답변', '최초처방월', '처방금액', '최근월실적', '최근처방액', '비고',
];
function csvEsc(v: unknown): string { return `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`; }
function toCsv(rows: FilteringRow[]): string {
  const lines = rows.map(r => [
    r.received_date ?? '', r.ym ?? '', r.manager ?? '', r.company_name ?? '', r.dealer_name ?? '', r.dealer_phone ?? '',
    r.hospital_code ?? '', r.hospital_type ?? '', r.hospital_name ?? '', r.product_name ?? '', r.department ?? '',
    r.kol ?? '', r.dc_timing ?? '', r.coding_month ?? '', r.edi_received ?? '', r.mbo ?? '', r.answer ?? '',
    r.final_result ?? '', r.first_rx_amount ?? '', r.last_rx_month ?? '', r.last_rx_amount ?? '', r.memo ?? '',
  ].map(csvEsc).join(','));
  return '﻿' + [CSV_HEADERS.map(csvEsc).join(','), ...lines].join('\r\n');
}
function downloadCsv(rows: FilteringRow[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const a = document.createElement('a');
  a.href = url; a.download = `종합병원필터링_${stamp}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ── 상세 행 ── */
function details(r: FilteringRow): [string, string][] {
  const out: [string, string][] = [];
  const push = (k: string, v: string | number | null) => { if (v != null && String(v).trim() !== '') out.push([k, String(v)]); };
  push('딜러명', r.dealer_name); push('딜러연락처', r.dealer_phone);
  push('처방처코드', r.hospital_code); push('품목 보험코드', r.item_insurance_code); push('KOL', r.kol);
  push('DC접수시기', r.dc_timing ? fmtDate(r.dc_timing) : null);
  push('코딩가능월', r.coding_month ? fmtDate(r.coding_month) : null);
  push('EDI수령', r.edi_received); push('MBO', r.mbo != null ? fmtMbo(r.mbo) : null);
  push('통보대상', r.notify_target); push('사유', r.notify_reason);
  push('비고', r.memo);
  return out;
}

/* ── PC 리스트 항목 (전체폭 — 모든 정보 인라인, 펼치기 없음) ── */
function FilterListItem({ row: r, canEdit, onEdit, onDelete, onOpen }: {
  row: FilteringRow; canEdit: boolean; onEdit: () => void; onDelete: () => void; onOpen: () => void;
}) {
  const meta = (label: string, val: string | null | undefined) =>
    val && String(val).trim() ? <span><span style={{ color: '#94a3b8' }}>{label} </span>{val}</span> : null;
  const line: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.77rem', color: '#64748b' };
  return (
    <div onClick={onOpen} style={{ borderLeft: `4px solid rgba(${answerRgb(r.answer)},0.75)`, borderBottom: '1px solid #eef1f6', background: '#fff', display: 'flex', gap: 14, padding: '11px 14px', alignItems: 'flex-start' }}>
      {/* 영업가능여부 — 맨 앞 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start', flexShrink: 0, width: 96 }}>
        <AnswerHL a={r.answer} />
        <StatusBadge s={r.status} />
      </div>
      {/* 전체 정보 인라인 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', fontSize: '0.87rem' }}>
          <span style={{ fontWeight: 700, color: '#111827' }}>{r.hospital_name || '-'}</span>
          {r.product_name && <span style={{ color: '#7c3aed', fontWeight: 600 }}>{r.product_name}</span>}
          {r.department && <span style={{ color: '#475569', fontSize: '0.8rem' }}>· {r.department}</span>}
        </div>
        <div style={{ ...line, color: '#475569' }}>
          {meta('접수', fmtDate(r.received_date))}
          {meta('담당', r.manager)}
          {meta('업체', r.company_name)}
          {meta('종별', r.hospital_type)}
          {meta('처방처코드', r.hospital_code)}
        </div>
        <div style={line}>
          {meta('DC접수', r.dc_timing ? fmtDate(r.dc_timing) : null)}
          {meta('코딩', r.coding_month ? fmtDate(r.coding_month) : null)}
          {meta('EDI수령', r.edi_received)}
          {meta('MBO', r.mbo != null ? fmtMbo(r.mbo) : null)}
        </div>
        <div style={line}>
          {meta('KOL', r.kol)}
          {meta('딜러', r.dealer_name)}
          {meta('통보대상', r.notify_target)}
          {meta('사유', r.notify_reason)}
          {meta('등록일', fmtDate(r.created_at.slice(0, 10)))}
          <span><span style={{ color: '#94a3b8' }}>최초처방월 </span>
            <b style={{ color: isPrescribed(r.final_result) ? '#059669' : '#64748b', fontWeight: isPrescribed(r.final_result) ? 700 : 400 }}>{r.final_result || '-'}</b>
            {r.first_rx_amount != null && isPrescribed(r.final_result) && (
              <b style={{ marginLeft: 6, color: '#0891b2' }}>{fmtMbo(r.first_rx_amount)}원</b>
            )}
            {r.result_auto && isPrescribed(r.final_result) && (
              <span style={{ marginLeft: 4, fontSize: '0.62rem', fontWeight: 700, color: '#059669', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '0.02rem 0.28rem' }}>EDI자동</span>
            )}</span>
          {r.last_rx_month && (
            <span><span style={{ color: '#94a3b8' }}>최근월실적 </span>
              <b style={{ color: '#334155' }}>{fmtDate(r.last_rx_month)}</b>
              {r.last_rx_amount != null && <b style={{ marginLeft: 5, color: '#0891b2' }}>{fmtMbo(r.last_rx_amount)}원</b>}</span>
          )}
        </div>
        {r.memo && r.memo.trim() && (
          <div style={{ fontSize: '0.77rem', color: '#64748b', whiteSpace: 'pre-wrap' }}>
            <span style={{ color: '#94a3b8' }}>비고 </span>{r.memo}
          </div>
        )}
      </div>
      {/* 관리 */}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} style={{ ...BTN_GHOST, fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}>수정</button>
          <button onClick={onDelete} style={{ ...BTN_GHOST, fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderColor: 'rgba(248,113,113,0.3)', color: '#dc2626' }}>삭제</button>
        </div>
      )}
    </div>
  );
}

/* ── 모바일 카드 ── */
function FilterCard({ row: r, canEdit, onEdit, onDelete, onOpen }: {
  row: FilteringRow; canEdit: boolean; onEdit: () => void; onDelete: () => void; onOpen: () => void;
}) {
  const dt = details(r);
  return (
    <div className="mcard" style={{ borderLeft: `5px solid rgba(${answerRgb(r.answer)},0.8)` }} onClick={onOpen}>
      {/* 영업가능여부 — 맨 앞 하이라이트 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
        <AnswerHL a={r.answer} />
        <StatusBadge s={r.status} />
      </div>
      <div className="mcard-row"><span className="mcard-k">처방처</span><span className="mcard-v" style={{ fontWeight: 700 }}>{r.hospital_name || '-'}</span></div>
      <div className="mcard-row"><span className="mcard-k">품목</span><span className="mcard-v" style={{ fontWeight: 600, color: '#7c3aed' }}>{r.product_name || '-'}</span></div>
      <div className="mcard-row"><span className="mcard-k">종별·처방과</span><span className="mcard-v" style={{ fontWeight: 400 }}>{[r.hospital_type, r.department].filter(Boolean).join(' · ') || '-'}</span></div>
      <div className="mcard-row"><span className="mcard-k">담당·업체</span><span className="mcard-v" style={{ fontWeight: 400 }}>{[r.manager, r.company_name].filter(Boolean).join(' / ') || '-'}</span></div>
      <div className="mcard-row"><span className="mcard-k">접수일</span><span className="mcard-v" style={{ fontWeight: 400 }}>{fmtDate(r.received_date)}</span></div>
      {/* 나머지 상세 — 처음부터 표시 */}
      {dt.map(([k, v]) => (
        <div key={k} className="mcard-row" style={{ alignItems: 'flex-start' }}>
          <span className="mcard-k">{k}</span>
          <span className="mcard-v" style={{ fontWeight: 400, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{v}</span>
        </div>
      ))}
      <div className="mcard-row"><span className="mcard-k">등록일</span><span className="mcard-v" style={{ fontWeight: 400 }}>{fmtDate(r.created_at.slice(0, 10))}</span></div>
      {/* 최초처방월·최근월실적 — 맨 밑 배치 */}
      <div className="mcard-row"><span className="mcard-k">최초처방월</span><span className="mcard-v" style={{ fontWeight: 400 }}><span style={{ color: isPrescribed(r.final_result) ? '#059669' : '#64748b' }}>{r.final_result || '-'}</span>{r.first_rx_amount != null && isPrescribed(r.final_result) ? <b style={{ color: '#0891b2', marginLeft: 5 }}>{fmtMbo(r.first_rx_amount)}원</b> : null}</span></div>
      {r.last_rx_month && (
        <div className="mcard-row"><span className="mcard-k">최근월실적</span><span className="mcard-v" style={{ fontWeight: 400 }}>{fmtDate(r.last_rx_month)}{r.last_rx_amount != null ? <b style={{ color: '#0891b2', marginLeft: 5 }}>{fmtMbo(r.last_rx_amount)}원</b> : null}</span></div>
      )}
      {canEdit && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }} onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} style={{ ...BTN_PRIMARY, fontSize: '0.78rem', padding: '0.4rem 0.9rem' }}>✏️ 수정</button>
          <button onClick={onDelete} style={{ ...BTN_GHOST, fontSize: '0.78rem', padding: '0.4rem 0.9rem', borderColor: 'rgba(248,113,113,0.35)', color: '#dc2626' }}>🗑 삭제</button>
        </div>
      )}
    </div>
  );
}

/* ── 처방처 검색 자동완성 (병의원 마스터) ── */
function HospitalPicker({ value, onChange, onPick }: {
  value: string;
  onChange: (v: string) => void;
  onPick: (h: HospitalHit) => void;
}) {
  const [items, setItems] = useState<HospitalHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function query(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setItems([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/hospital-search?q=${encodeURIComponent(v.trim())}`);
        const d = await res.json();
        setItems(d.items ?? []); setOpen(true);
      } catch { setItems([]); }
      finally { setLoading(false); }
    }, 250);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input style={INPUT_STYLE} value={value} placeholder="병원명 또는 처방처코드로 검색"
        autoComplete="off"
        onChange={e => query(e.target.value)}
        onFocus={() => { if (items.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #e5e9f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(15,23,42,0.14)', maxHeight: 280, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '0.55rem 0.7rem', fontSize: '0.78rem', color: '#94a3b8' }}>검색 중…</div>}
          {!loading && items.length === 0 && <div style={{ padding: '0.55rem 0.7rem', fontSize: '0.78rem', color: '#94a3b8' }}>결과 없음 · 직접 입력 가능</div>}
          {items.map(h => (
            <button key={h.hospital_code} type="button"
              onMouseDown={e => { e.preventDefault(); onPick(h); setOpen(false); }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', textAlign: 'left', minHeight: 0, padding: '0.5rem 0.7rem', background: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: '0.83rem', color: '#111827', fontWeight: 600 }}>
                {h.hospital_name} <span style={{ fontSize: '0.7rem', color: '#0891b2', fontWeight: 500 }}>{h.hospital_type ?? ''}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {h.hospital_code}{[h.sido, h.gugun].filter(Boolean).length ? ' · ' + [h.sido, h.gugun].filter(Boolean).join(' ') : ''}{h.address ? ' · ' + h.address : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 품목 검색 자동완성 (products 마스터) ── */
function ProductPicker({ value, onChange, onPick }: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: ProductHit) => void;
}) {
  const [items, setItems] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function query(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 1) { setItems([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/product-search?q=${encodeURIComponent(v.trim())}`);
        const d = await res.json();
        setItems(d.items ?? []); setOpen(true);
      } catch { setItems([]); }
      finally { setLoading(false); }
    }, 250);
  }
  return (
    <div style={{ position: 'relative' }}>
      <input style={INPUT_STYLE} value={value} placeholder="품목명 또는 보험코드로 검색"
        autoComplete="off"
        onChange={e => query(e.target.value)}
        onFocus={() => { if (items.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #e5e9f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(15,23,42,0.14)', maxHeight: 280, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '0.55rem 0.7rem', fontSize: '0.78rem', color: '#94a3b8' }}>검색 중…</div>}
          {!loading && items.length === 0 && <div style={{ padding: '0.55rem 0.7rem', fontSize: '0.78rem', color: '#94a3b8' }}>결과 없음 · 직접 입력 가능</div>}
          {items.map(p => (
            <button key={(p.insurance_code ?? '') + p.product_name} type="button"
              onMouseDown={e => { e.preventDefault(); onPick(p); setOpen(false); }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', textAlign: 'left', minHeight: 0, padding: '0.5rem 0.7rem', background: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: '0.83rem', color: '#111827', fontWeight: 600 }}>{p.product_name}</div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {p.insurance_code ? '보험 ' + p.insurance_code : ''}{p.manufacturer ? ' · ' + p.manufacturer : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 통보·변경 이력(증빙) ── */
function LogHistory({ id }: { id: string }) {
  type Log = Awaited<ReturnType<typeof getFilteringLogs>>[number];
  const [logs, setLogs] = useState<Log[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    getFilteringLogs(id).then(l => { if (alive) { setLogs(l); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [id]);
  if (!loaded || logs.length === 0) return null;
  return (
    <div style={{ marginTop: '0.6rem', padding: '0.7rem 0.85rem', background: '#f8fafc', border: '1px solid #eef1f6', borderRadius: 10 }}>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem' }}>📜 통보·변경 이력 (증빙)</div>
      {logs.map((l, i) => (
        <div key={i} style={{ fontSize: '0.72rem', color: '#64748b', padding: '0.28rem 0', borderTop: i ? '1px solid #eef1f6' : 'none', lineHeight: 1.5 }}>
          <span style={{ color: '#94a3b8' }}>{fmtDateTime(l.created_at)}</span>
          {'  '}답변 {l.from_answer ?? '-'} → <b style={{ color: '#334155' }}>{l.to_answer ?? '-'}</b>
          {l.notify_target ? <> · 통보대상 <b style={{ color: '#334155' }}>{l.notify_target}</b></> : null}
          {l.reason ? ` · 사유 ${l.reason}` : ''}
          {l.changed_by_name ? ` · ${l.changed_by_name}` : ''}
        </div>
      ))}
    </div>
  );
}

/* ── 등록/수정 폼 ── */
function FilterForm({ initial, myName, editId, onClose, onSaved }: {
  initial: FilteringInput; myName: string; editId?: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<FilteringInput>({ ...initial, manager: initial.manager || myName });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // 신규 등록: 품목 여러 개 선택(품목마다 개별 항목으로 등록 → 품목별 가능여부 판단)
  const [products, setProducts] = useState<{ product_name: string; item_insurance_code: string }[]>([]);
  const [prodDraft, setProdDraft] = useState('');
  function set(f: keyof FilteringInput, v: string) { setForm(p => ({ ...p, [f]: v })); }
  function addProduct(product_name: string, item_insurance_code: string) {
    setProducts(prev => prev.some(x => x.product_name === product_name && x.item_insurance_code === item_insurance_code)
      ? prev : [...prev, { product_name, item_insurance_code }]);
    setProdDraft('');
  }

  async function submit() {
    setSaving(true); setError('');
    let res;
    if (editId) {
      res = await updateFiltering(editId, form);
    } else {
      // 검색 후 선택하지 않고 직접 입력만 한 품목도 포함
      const draft = prodDraft.trim();
      const list = draft && !products.some(p => p.product_name === draft)
        ? [...products, { product_name: draft, item_insurance_code: '' }]
        : products;
      res = await createFilteringBatch(form, list);
    }
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    onSaved(); onClose();
  }


  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: '640px', background: '#ffffff', border: '1px solid #e5e9f0', borderRadius: '16px', padding: '1.4rem', margin: '1rem 0' }}>
        <h2 style={{ margin: '0 0 1.1rem', fontSize: '1rem', fontWeight: 700, color: '#0284c7' }}>
          {editId ? '필터링 항목 수정' : '필터링 항목 등록'}
        </h2>

        <div className="filt-2col">
          <Field label="접수일자"><input type="date" style={INPUT_STYLE} value={form.received_date} onChange={e => set('received_date', e.target.value)} /></Field>
          <Field label="담당자"><input style={INPUT_STYLE} value={form.manager} onChange={e => set('manager', e.target.value)} /></Field>
        </div>
        <div className="filt-2col">
          <Field label="업체명"><input style={INPUT_STYLE} value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="CSO 법인" /></Field>
          <Field label="딜러명 (선택)"><input style={INPUT_STYLE} value={form.dealer_name} onChange={e => set('dealer_name', e.target.value)} /></Field>
        </div>
        <div className="filt-2col">
          <Field label="딜러연락처 (선택)"><input style={INPUT_STYLE} value={form.dealer_phone} onChange={e => set('dealer_phone', e.target.value)} /></Field>
          <Field label="처방처코드"><input style={INPUT_STYLE} value={form.hospital_code} onChange={e => set('hospital_code', e.target.value)} /></Field>
        </div>
        <div className="filt-2col">
          <Field label="종별">
            <select style={INPUT_STYLE} value={form.hospital_type} onChange={e => set('hospital_type', e.target.value)}>
              {HOSPITAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              {form.hospital_type && !HOSPITAL_TYPES.includes(form.hospital_type) && <option value={form.hospital_type}>{form.hospital_type}</option>}
            </select>
          </Field>
          <Field label="처방과"><input style={INPUT_STYLE} value={form.department} onChange={e => set('department', e.target.value)} /></Field>
        </div>
        <Field label="처방처명 * (검색·자동완성 — 선택 시 코드·종별 자동입력)">
          <HospitalPicker value={form.hospital_name}
            onChange={v => set('hospital_name', v)}
            onPick={h => setForm(p => ({ ...p, hospital_name: h.hospital_name, hospital_code: h.hospital_code, hospital_type: h.hospital_type || p.hospital_type }))} />
        </Field>
        {editId ? (
          <Field label="품목명 * (검색·자동완성 — 선택 시 보험코드 연동)">
            <ProductPicker value={form.product_name}
              onChange={v => set('product_name', v)}
              onPick={p => setForm(f => ({ ...f, product_name: p.product_name, item_insurance_code: (p.insurance_code || p.representative_code || '').replace(/\D/g, '') }))} />
            {form.item_insurance_code && (
              <div style={{ fontSize: '0.7rem', color: '#0891b2', marginTop: '0.25rem' }}>
                연동 보험코드: {form.item_insurance_code} · EDI 실적으로 최초처방월이 자동 표기됩니다
              </div>
            )}
          </Field>
        ) : (
          <Field label="품목명 * (여러 개 선택 가능 — 품목마다 개별 등록되어 가능여부를 각각 판단)">
            <ProductPicker value={prodDraft}
              onChange={setProdDraft}
              onPick={p => addProduct(p.product_name, (p.insurance_code || p.representative_code || '').replace(/\D/g, ''))} />
            {products.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {products.map((p, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 11px', background: '#eef4ff', border: '1px solid #d5e3fb', borderRadius: 999, fontSize: '0.8rem', color: '#1e3a8a', fontWeight: 600 }}>
                    {p.product_name}
                    {p.item_insurance_code ? <span style={{ color: '#0891b2', fontSize: '0.7rem', fontWeight: 500 }}>· {p.item_insurance_code}</span> : null}
                    <button type="button" onClick={() => setProducts(prev => prev.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, minHeight: 0, padding: '0 2px' }}
                      aria-label="삭제">×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 6 }}>
              {products.length
                ? `${products.length}개 품목 선택됨 · 각 품목이 개별 항목으로 등록되어 품목별로 가능여부를 판단합니다`
                : '품목을 검색해 선택하면 아래에 추가됩니다 (여러 개 선택 가능)'}
            </div>
          </Field>
        )}
        <Field label="KOL"><input style={INPUT_STYLE} value={form.kol} onChange={e => set('kol', e.target.value)} placeholder="처방의 (쉼표로 여러 명)" /></Field>

        <div className="filt-2col">
          <Field label="DC접수시기"><input type="date" style={{ ...INPUT_STYLE, fontSize: '16px', minHeight: '44px' }} value={/^\d{4}-\d{2}-\d{2}$/.test(form.dc_timing) ? form.dc_timing : ''} onChange={e => set('dc_timing', e.target.value)} /></Field>
          <Field label="코딩가능월"><input type="date" style={{ ...INPUT_STYLE, fontSize: '16px', minHeight: '44px' }} value={/^\d{4}-\d{2}-\d{2}$/.test(form.coding_month) ? form.coding_month : ''} onChange={e => set('coding_month', e.target.value)} /></Field>
        </div>
        <div className="filt-2col">
          <Field label="EDI수령여부">
            <select style={INPUT_STYLE} value={form.edi_received} onChange={e => set('edi_received', e.target.value)}>
              {YESNO.map(v => <option key={v} value={v}>{v || '-'}</option>)}
            </select>
          </Field>
          <Field label="MBO (원)"><input style={INPUT_STYLE} inputMode="numeric"
            value={(() => { const d = String(form.mbo).replace(/[^\d]/g, ''); return d ? Number(d).toLocaleString('ko-KR') : ''; })()}
            onChange={e => set('mbo', e.target.value.replace(/[^\d]/g, ''))} placeholder="예: 50,000,000" /></Field>
        </div>

        <div className="filt-2col">
          <Field label="답변 (영업가능여부)">
            <select style={INPUT_STYLE} value={form.answer} onChange={e => set('answer', e.target.value)}>
              <option value="">-</option>
              {ANSWER_OPTS.map(v => <option key={v} value={v}>{v === 'O' ? 'O (가능)' : v === 'X' ? 'X (불가)' : v}</option>)}
              {form.answer && !ANSWER_OPTS.includes(form.answer) && <option value={form.answer}>{form.answer}</option>}
            </select>
          </Field>
          <Field label="최초처방월 (비워두면 EDI 실적으로 자동 표기)"><input style={INPUT_STYLE} value={form.final_result} onChange={e => set('final_result', e.target.value)} placeholder="처방시작월(2025-02-01) 또는 처방없음" /></Field>
        </div>
        {!editId && products.length > 1 && (
          <div style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 0.5rem' }}>
            ※ 등록 시 답변은 모든 품목에 동일 적용됩니다. 보통 비워두고 등록한 뒤, 각 품목 항목에서 개별로 가능여부를 판단하세요.
          </div>
        )}

        {(form.answer === 'X' || form.answer === '취소') && (
          <div style={{ fontSize: '0.72rem', color: '#c2410c', margin: '0 0 0.5rem' }}>
            ※ 불가/취소 통보 시 사유·통보대상을 남기면 변경일시와 함께 이력(증빙)에 기록됩니다(선택).
          </div>
        )}
        <div className="filt-2col">
          <Field label="통보대상 (선택)"><input style={INPUT_STYLE} value={form.notify_target} onChange={e => set('notify_target', e.target.value)} placeholder="예: 김윤성 지역장" /></Field>
          <Field label="사유 (선택)"><input style={INPUT_STYLE} value={form.notify_reason} onChange={e => set('notify_reason', e.target.value)} placeholder="불가/취소 등 사유" /></Field>
        </div>

        <Field label="비고">
          <textarea style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="DC 실패 이유 또는 특이사항" />
        </Field>

        {editId && <LogHistory id={editId} />}

        {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0.6rem 0 0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button style={BTN_GHOST} onClick={onClose} disabled={saving}>취소</button>
          <button style={BTN_PRIMARY} onClick={submit} disabled={saving}>{saving ? '저장 중...' : editId ? '수정' : '등록'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 ── */
export default function FilteringClient({ rows: initial, isAdmin, isConsignor, myName, userId }: {
  rows: FilteringRow[]; isAdmin: boolean; isConsignor: boolean; myName: string; userId: string;
}) {
  const isAlliance = !isConsignor;   // 회사 미지정 = 얼라이언스(지역장)
  const [rows, setRows] = useState<FilteringRow[]>(initial);

  // 지역장이 본인 담당 '답변완료' 항목을 열람 → 확인완료로 전환(배지 감소)
  function handleOpen(r: FilteringRow) {
    if (isAlliance && r.manager === myName && r.status === 'answered') {
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: 'confirmed' } : x));
      confirmFiltering(r.id).catch(() => {});
    }
  }
  const canEditRow = (r: FilteringRow) =>
    isAdmin || r.user_id === userId || isConsignor || (isAlliance && r.manager === myName);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<FilteringRow | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const [fType, setFType] = useState('');
  const [fAnswer, setFAnswer] = useState('');
  const [fYm, setFYm] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  function applySearch() { setSearch(inputValue.trim()); }

  async function runRefresh() {
    setRefreshing(true);
    const res = await refreshFilteringResults();
    setRefreshing(false);
    if (res.error) { alert(res.error); return; }
    alert(`EDI 실적 자동확인 완료 — 최초처방월 ${res.updated}건 반영`);
    if (res.updated > 0) window.location.reload();
  }

  const ymOptions = useMemo(() =>
    Array.from(new Set(rows.map(r => r.ym).filter(Boolean) as string[])).sort().reverse(), [rows]);
  const typeOptions = useMemo(() =>
    Array.from(new Set(rows.map(r => r.hospital_type).filter(Boolean) as string[])), [rows]);

  const up = (s: string | null) => (s ?? '').trim().toUpperCase();
  const counts = useMemo(() => ({
    전체:   rows.length,
    가능:   rows.filter(r => up(r.answer) === 'O').length,
    불가:   rows.filter(r => up(r.answer) === 'X').length,
    미답변: rows.filter(r => !(r.answer ?? '').trim()).length,
    처방전환: rows.filter(r => isPrescribed(r.final_result)).length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (fType && r.hospital_type !== fType) return false;
    if (fAnswer === '__NONE__') { if ((r.answer ?? '').trim()) return false; }
    else if (fAnswer && up(r.answer) !== fAnswer) return false;
    if (fYm && r.ym !== fYm) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [r.hospital_name, r.product_name, r.company_name, r.manager, r.department, r.kol, r.memo]
        .map(x => (x ?? '').toLowerCase()).join(' ');
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, search, fType, fAnswer, fYm]);

  async function handleDelete(id: string) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    setDeleting(id);
    const res = await deleteFiltering(id);
    setDeleting(null);
    if (res.error) { alert(res.error); return; }
    window.location.reload();
  }
  function openEdit(r: FilteringRow) { setEditTarget(r); setShowForm(true); }

  function toInput(r: FilteringRow): FilteringInput {
    return {
      received_date: r.received_date ?? '', ym: r.ym ?? '', manager: r.manager ?? '', company_name: r.company_name ?? '',
      dealer_name: r.dealer_name ?? '', dealer_phone: r.dealer_phone ?? '', hospital_code: r.hospital_code ?? '',
      hospital_type: r.hospital_type ?? '종합병원', hospital_name: r.hospital_name ?? '', product_name: r.product_name ?? '',
      department: r.department ?? '', kol: r.kol ?? '', dc_timing: r.dc_timing ?? '', coding_month: r.coding_month ?? '',
      edi_received: r.edi_received ?? '', mbo: r.mbo != null ? String(r.mbo) : '', answer: r.answer ?? '',
      final_result: r.final_result ?? '', memo: r.memo ?? '',
      item_insurance_code: r.item_insurance_code ?? '', notify_target: r.notify_target ?? '', notify_reason: r.notify_reason ?? '',
    };
  }


  const STAT = [
    { tab: '전체', color: '#0284c7', rgba: 'rgba(14,165,233,', flt: '' },
    { tab: '가능', color: '#059669', rgba: 'rgba(34,197,94,', flt: 'O' },
    { tab: '불가', color: '#dc2626', rgba: 'rgba(239,68,68,', flt: 'X' },
    { tab: '미답변', color: '#c2410c', rgba: 'rgba(251,146,60,', flt: '__NONE__' },
    { tab: '처방전환', color: '#7c3aed', rgba: 'rgba(139,92,246,', flt: '' },
  ] as const;

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* 통계 */}
      <div className="visit-stats-grid">
        {STAT.map(({ tab, color, rgba, flt }) => {
          const clickable = flt !== '';
          const active = clickable && fAnswer === flt;
          return (
            <button key={tab} onClick={() => { if (clickable) setFAnswer(f => f === flt ? '' : flt); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.9rem 0.5rem', borderRadius: '14px', gap: '0.2rem',
                background: active ? `${rgba}0.18)` : `${rgba}0.07)`, border: `1px solid ${active ? `${rgba}0.55)` : `${rgba}0.22)`}`,
                cursor: clickable ? 'pointer' : 'default', outline: 'none' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>{counts[tab as keyof typeof counts]}</span>
              <span style={{ fontSize: '0.72rem', color: active ? color : 'var(--text-muted)', marginTop: '0.2rem' }}>{tab}</span>
            </button>
          );
        })}
      </div>

      {/* 검색·필터 */}
      <div className="auth-card" style={{ marginBottom: '1rem', padding: '0.9rem 1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: 1, minWidth: 180, marginBottom: 0 }}
            placeholder="🔍  처방처 · 품목 · 업체 · 담당자 · KOL 검색"
            value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && applySearch()} />
          <select style={{ ...inputStyle, width: 'auto', marginBottom: 0, minHeight: 44 }} value={fType} onChange={e => setFType(e.target.value)}>
            <option value="">종별 전체</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={{ ...inputStyle, width: 'auto', marginBottom: 0, minHeight: 44 }} value={fYm} onChange={e => setFYm(e.target.value)}>
            <option value="">년월 전체</option>
            {ymOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button style={{ ...primaryBtn, flexShrink: 0 }} onClick={applySearch}>검색</button>
          <button style={{ ...primaryBtn, flexShrink: 0 }} onClick={() => { setEditTarget(null); setShowForm(true); }}>+ 등록</button>
          <button style={{ ...BTN_GHOST, flexShrink: 0, minHeight: 44, padding: '0 0.9rem', opacity: refreshing ? 0.6 : 1 }}
            disabled={refreshing} onClick={runRefresh} title="EDI 실적에서 처방시작월을 자동 반영">
            {refreshing ? '확인 중…' : '⟳ 실적 자동확인'}
          </button>
        </div>
        {(search || fType || fAnswer || fYm) && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {[search && `"${search}"`, fType, fYm, fAnswer && (fAnswer === 'O' ? '가능' : fAnswer === 'X' ? '불가' : fAnswer === '__NONE__' ? '미답변' : fAnswer)].filter(Boolean).join(' · ')} 적용 중
            <button onClick={() => { setSearch(''); setInputValue(''); setFType(''); setFAnswer(''); setFYm(''); }}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>✕ 초기화</button>
          </div>
        )}
      </div>

      {/* 건수 + 다운로드 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {filtered.length}건{filtered.length !== rows.length && ` / 전체 ${rows.length}건`}
        </span>
        <button onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}
          style={{ ...BTN_GHOST, fontSize: '0.76rem', padding: '0.35rem 0.8rem', opacity: filtered.length === 0 ? 0.4 : 1, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer' }}>
          ⬇ 리스트 다운로드
        </button>
      </div>

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 14 }}>
          {rows.length === 0 ? '등록된 항목이 없습니다.' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <>
          <div className="resp-table" style={{ border: '1px solid #eef1f6', borderRadius: 12, overflow: 'hidden' }}>
            {filtered.map(r => (
              <FilterListItem key={r.id} row={r} canEdit={canEditRow(r)} onOpen={() => handleOpen(r)}
                onEdit={() => openEdit(r)} onDelete={() => !deleting && handleDelete(r.id)} />
            ))}
          </div>
          <div className="resp-cards">
            {filtered.map(r => (
              <FilterCard key={r.id} row={r} canEdit={canEditRow(r)} onOpen={() => handleOpen(r)}
                onEdit={() => openEdit(r)} onDelete={() => !deleting && handleDelete(r.id)} />
            ))}
          </div>
        </>
      )}

      {showForm && (
        <FilterForm initial={editTarget ? toInput(editTarget) : EMPTY} myName={myName} editId={editTarget?.id}
          onClose={() => setShowForm(false)} onSaved={() => window.location.reload()} />
      )}
    </div>
  );
}

/* ── 공유 스타일 ── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e5e9f0',
  color: 'var(--text-primary)', fontSize: '16px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', minHeight: '44px',
};
const primaryBtn: React.CSSProperties = {
  padding: '0.62rem 1.2rem', borderRadius: '10px', border: 'none', fontFamily: 'inherit',
  background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))', color: '#fff', fontSize: '0.92rem', fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minHeight: '44px', whiteSpace: 'nowrap',
};
