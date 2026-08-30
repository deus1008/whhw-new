'use client';

import { useState, useMemo } from 'react';
import { createFiltering, updateFiltering, deleteFiltering, confirmFiltering } from '@/app/filtering/actions';
import type { FilteringInput } from '@/app/filtering/actions';

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
  user_id:       string | null;
  created_at:    string;
};

const HOSPITAL_TYPES = ['상급종합', '종합병원', '병원', '의원', '기타'];
const ANSWER_OPTS    = ['O', 'X', '준비중'];
const YESNO          = ['', 'O', 'X'];

const EMPTY: FilteringInput = {
  received_date: '', ym: '', manager: '', company_name: '',
  dealer_name: '', dealer_phone: '', hospital_code: '',
  hospital_type: '종합병원', hospital_name: '', product_name: '',
  department: '', kol: '', dc_timing: '', coding_month: '',
  edi_received: '', mbo: '', answer: '', final_result: '', memo: '',
};

/* ── 유틸 ── */
function fmtDate(d: string | null): string {
  if (!d) return '-';
  return d.replace(/-/g, '.').slice(0, 10);
}
function fmtMbo(v: number | null): string {
  return v == null ? '-' : v.toLocaleString();
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
  if (raw === '준비중') return '251,146,60';
  return '148,163,184';
}

/* ── 답변 하이라이트(가장 중요 — 크고 굵게, 맨 앞) ── */
function AnswerHL({ a }: { a: string | null }) {
  const raw = (a ?? '').trim(); const up = raw.toUpperCase();
  let col = '#64748b', label = raw || '미답변';
  if (up === 'O')       { col = '#059669'; label = '가능'; }
  else if (up === 'X')  { col = '#dc2626'; label = '불가'; }
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
  '품목명', '처방과', 'KOL', 'DC접수시기', '코딩가능월', 'EDI수령여부', 'MBO', '답변', '최종결과', '비고',
];
function csvEsc(v: unknown): string { return `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`; }
function toCsv(rows: FilteringRow[]): string {
  const lines = rows.map(r => [
    r.received_date ?? '', r.ym ?? '', r.manager ?? '', r.company_name ?? '', r.dealer_name ?? '', r.dealer_phone ?? '',
    r.hospital_code ?? '', r.hospital_type ?? '', r.hospital_name ?? '', r.product_name ?? '', r.department ?? '',
    r.kol ?? '', r.dc_timing ?? '', r.coding_month ?? '', r.edi_received ?? '', r.mbo ?? '', r.answer ?? '',
    r.final_result ?? '', r.memo ?? '',
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
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, minWidth: '72px', paddingTop: '0.1rem' }}>{label}</span>
      <span style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</span>
    </div>
  );
}
function details(r: FilteringRow): [string, string][] {
  const out: [string, string][] = [];
  const push = (k: string, v: string | number | null) => { if (v != null && String(v).trim() !== '') out.push([k, String(v)]); };
  push('딜러명', r.dealer_name); push('딜러연락처', r.dealer_phone);
  push('처방처코드', r.hospital_code); push('KOL', r.kol);
  push('DC접수시기', r.dc_timing ? fmtDate(r.dc_timing) : null);
  push('코딩가능월', r.coding_month ? fmtDate(r.coding_month) : null);
  push('EDI수령', r.edi_received); push('MBO', r.mbo != null ? fmtMbo(r.mbo) : null);
  push('비고', r.memo);
  return out;
}

/* ── PC 테이블 행 ── */
function FilterTr({ row: r, canEdit, showActions, colSpan, onEdit, onDelete, onOpen }: {
  row: FilteringRow; canEdit: boolean; showActions: boolean; colSpan: number; onEdit: () => void; onDelete: () => void; onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dt = details(r);
  const toggle = () => setOpen(v => { if (!v) onOpen(); return !v; });
  return (
    <>
      <tr onClick={toggle} style={{ cursor: 'pointer', background: open ? 'rgba(2,132,199,0.06)' : undefined }}>
        <td style={{ ...cellTd, whiteSpace: 'nowrap', borderLeft: `4px solid rgba(${answerRgb(r.answer)},0.75)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>{open ? '▼' : '▶'}</span>
            <AnswerHL a={r.answer} />
            <StatusBadge s={r.status} />
          </div>
        </td>
        <td style={{ ...cellTd, whiteSpace: 'nowrap', color: '#475569' }}>{fmtDate(r.received_date)}</td>
        <td style={{ ...cellTd, whiteSpace: 'nowrap' }}>{r.manager || '-'}</td>
        <td style={{ ...cellTd, whiteSpace: 'nowrap' }}>{r.company_name || '-'}</td>
        <td style={{ ...cellTd, whiteSpace: 'nowrap' }}>{r.hospital_type || '-'}</td>
        <td style={{ ...cellTd, fontWeight: 600, color: '#111827', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.hospital_name ?? ''}>{r.hospital_name || '-'}</td>
        <td style={{ ...cellTd, whiteSpace: 'nowrap', color: '#7c3aed', fontWeight: 600 }}>{r.product_name || '-'}</td>
        <td style={{ ...cellTd, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.department ?? ''}>{r.department || '-'}</td>
        <td style={{ ...cellTd, whiteSpace: 'nowrap', color: isPrescribed(r.final_result) ? '#059669' : '#64748b', fontWeight: isPrescribed(r.final_result) ? 600 : 400 }}>{r.final_result || '-'}</td>
        {showActions && (
          <td style={{ ...cellTd, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
            {canEdit ? (
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button onClick={onEdit} style={{ ...BTN_GHOST, fontSize: '0.7rem', padding: '0.22rem 0.5rem' }}>수정</button>
                <button onClick={onDelete} style={{ ...BTN_GHOST, fontSize: '0.7rem', padding: '0.22rem 0.5rem', borderColor: 'rgba(248,113,113,0.3)', color: '#dc2626' }}>삭제</button>
              </div>
            ) : <span style={{ opacity: 0.3 }}>-</span>}
          </td>
        )}
      </tr>
      {open && (
        <tr>
          <td colSpan={colSpan} style={{ ...cellTd, background: '#ffffff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.45rem 1.2rem', padding: '0.2rem 0.2rem 0.4rem' }}>
              {dt.length ? dt.map(([k, v]) => <DetailRow key={k} label={k} value={v} />)
                : <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>추가 정보 없음</span>}
              <DetailRow label="등록일" value={fmtDate(r.created_at.slice(0, 10))} />
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={e => { e.stopPropagation(); onEdit(); }} style={{ ...BTN_PRIMARY, fontSize: '0.78rem', padding: '0.4rem 0.9rem' }}>✏️ 수정</button>
                <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ ...BTN_GHOST, fontSize: '0.78rem', padding: '0.4rem 0.9rem', borderColor: 'rgba(248,113,113,0.35)', color: '#dc2626' }}>🗑 삭제</button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ── 모바일 카드 ── */
function FilterCard({ row: r, canEdit, onEdit, onDelete, onOpen }: {
  row: FilteringRow; canEdit: boolean; onEdit: () => void; onDelete: () => void; onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dt = details(r);
  const toggle = () => setOpen(v => { if (!v) onOpen(); return !v; });
  return (
    <div className="mcard" style={{ borderLeft: `5px solid rgba(${answerRgb(r.answer)},0.8)` }}>
      {/* 영업가능여부 — 맨 앞 하이라이트 */}
      <div onClick={toggle} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
        <AnswerHL a={r.answer} />
        <StatusBadge s={r.status} />
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#94a3b8' }}>{open ? '▼' : '▶'}</span>
      </div>
      <div className="mcard-row" onClick={toggle} style={{ cursor: 'pointer' }}>
        <span className="mcard-k">처방처</span><span className="mcard-v" style={{ fontWeight: 700 }}>{r.hospital_name || '-'}</span>
      </div>
      <div className="mcard-row"><span className="mcard-k">품목</span><span className="mcard-v" style={{ fontWeight: 600, color: '#7c3aed' }}>{r.product_name || '-'}</span></div>
      <div className="mcard-row"><span className="mcard-k">종별·처방과</span><span className="mcard-v" style={{ fontWeight: 400 }}>{[r.hospital_type, r.department].filter(Boolean).join(' · ') || '-'}</span></div>
      <div className="mcard-row"><span className="mcard-k">담당·업체</span><span className="mcard-v" style={{ fontWeight: 400 }}>{[r.manager, r.company_name].filter(Boolean).join(' / ') || '-'}</span></div>
      <div className="mcard-row"><span className="mcard-k">접수·최종</span><span className="mcard-v" style={{ fontWeight: 400 }}>{fmtDate(r.received_date)} → <span style={{ color: isPrescribed(r.final_result) ? '#059669' : '#64748b' }}>{r.final_result || '-'}</span></span></div>
      {open && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #eef1f6', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {dt.map(([k, v]) => <DetailRow key={k} label={k} value={v} />)}
          <DetailRow label="등록일" value={fmtDate(r.created_at.slice(0, 10))} />
          {canEdit && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
              <button onClick={onEdit} style={{ ...BTN_PRIMARY, fontSize: '0.78rem', padding: '0.4rem 0.9rem' }}>✏️ 수정</button>
              <button onClick={onDelete} style={{ ...BTN_GHOST, fontSize: '0.78rem', padding: '0.4rem 0.9rem', borderColor: 'rgba(248,113,113,0.35)', color: '#dc2626' }}>🗑 삭제</button>
            </div>
          )}
        </div>
      )}
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
  function set(f: keyof FilteringInput, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function submit() {
    setSaving(true); setError('');
    const res = editId ? await updateFiltering(editId, form) : await createFiltering(form);
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
        <Field label="처방처명 *"><input style={INPUT_STYLE} value={form.hospital_name} onChange={e => set('hospital_name', e.target.value)} placeholder="병원명" /></Field>
        <Field label="품목명 *"><input style={INPUT_STYLE} value={form.product_name} onChange={e => set('product_name', e.target.value)} placeholder="예: 유로박솜군" /></Field>
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
          <Field label="최종결과"><input style={INPUT_STYLE} value={form.final_result} onChange={e => set('final_result', e.target.value)} placeholder="처방시작월(2025-02-01) 또는 처방없음" /></Field>
        </div>
        <Field label="비고">
          <textarea style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="DC 실패 이유 또는 특이사항" />
        </Field>

        {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
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

  function applySearch() { setSearch(inputValue.trim()); }

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
    };
  }

  const showActions = isAdmin || isConsignor || filtered.some(r => canEditRow(r));
  const colCount = 9 + (showActions ? 1 : 0);

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
          <div className="resp-table" style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: 12 }}>
            <table style={{ width: '100%', minWidth: showActions ? 1000 : 900, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...cellTh, paddingLeft: '0.9rem' }}>영업가능여부</th>
                  <th style={cellTh}>접수</th>
                  <th style={cellTh}>담당자</th>
                  <th style={cellTh}>업체명</th>
                  <th style={cellTh}>종별</th>
                  <th style={cellTh}>처방처명</th>
                  <th style={cellTh}>품목명</th>
                  <th style={cellTh}>처방과</th>
                  <th style={cellTh}>최종결과</th>
                  {showActions && <th style={cellTh}>관리</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <FilterTr key={r.id} row={r} showActions={showActions} colSpan={colCount}
                    canEdit={canEditRow(r)} onOpen={() => handleOpen(r)}
                    onEdit={() => openEdit(r)} onDelete={() => !deleting && handleDelete(r.id)} />
                ))}
              </tbody>
            </table>
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
