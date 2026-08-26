'use client';

import { useState, useMemo } from 'react';
import { createContract, updateContract, deleteContract } from '@/app/contracts/actions';
import type { ContractInput } from '@/app/contracts/actions';

/* ── 타입 ── */
export type ContractRow = {
  id:              string;
  manager:         string;
  company_name:    string;
  contract_type:   string | null;   // 신규계약 | 기존처변경
  contract_start:  string;
  contract_end:    string | null;
  auto_renewal:    boolean;
  evidence:        string | null;
  details:         string | null;
  expected_month:  string | null;
  expected_amount: string | null;
  hospitals:       string | null;
  contact_name:    string | null;
  contact_phone:   string | null;
  contact_email:   string | null;
  memo:            string | null;
  user_id:         string;
  created_at:      string;
};

const EVIDENCE_DEFAULT = '전산자료 또는 객관적으로 양사가 인정하는 자료 (수기자료 인정 불가)';
const DETAILS_DEFAULT  = '당사의 판매대행 계약서 및 부대약정서에 준함';

const CONTRACT_TYPES = ['신규계약', '기존처변경'] as const;

const EMPTY: ContractInput = {
  manager: '', company_name: '',
  contract_type: '신규계약',
  contract_start: '', contract_end: '',
  auto_renewal: true,
  evidence: EVIDENCE_DEFAULT,
  details: DETAILS_DEFAULT,
  expected_month: '', expected_amount: '',
  hospitals: '',
  contact_name: '', contact_phone: '', contact_email: '',
  memo: '',
};

/* ── 유틸 ── */
function fmtDate(d: string | null): string {
  if (!d) return '-';
  return d.replace(/-/g, '.').slice(0, 10);
}

/* ── CSV 다운로드 (엑셀 한글 호환: UTF-8 BOM) ── */
const CSV_HEADERS = [
  '업체명', '유형', '담당자', '계약시작', '계약종료', '자동갱신',
  '처방예상월', '처방예상액', '연락처명', '전화', '이메일',
  '주요병원·품목', '증빙자료', '세부내역', '비고', '등록일',
];
function csvEsc(v: unknown): string {
  return `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`;
}
function contractsToCsv(rows: ContractRow[]): string {
  const lines = rows.map(c => [
    c.company_name, c.manager, c.contract_start, c.contract_end ?? '',
    c.auto_renewal ? '자동갱신' : '-',
    c.expected_month ?? '', c.expected_amount ?? '',
    c.contact_name ?? '', c.contact_phone ?? '', c.contact_email ?? '',
    c.hospitals ?? '', c.evidence ?? '', c.details ?? '', c.memo ?? '',
    (c.created_at ?? '').slice(0, 10),
  ].map(csvEsc).join(','));
  return '﻿' + [CSV_HEADERS.map(csvEsc).join(','), ...lines].join('\r\n');
}
function downloadContractsCsv(rows: ContractRow[]) {
  const blob = new Blob([contractsToCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const a = document.createElement('a');
  a.href = url; a.download = `신규거래처계약_${stamp}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ── 공통 스타일 ── */
const CARD = {
  background:   '#f8fafc',
  border:       '1px solid #f1f5f9',
  borderRadius: '14px',
  padding:      '1rem',
  marginBottom: '0.75rem',
} as const;

const INPUT_STYLE = {
  width: '100%', padding: '0.55rem 0.7rem',
  background: '#f1f5f9',
  border: '1px solid #d7dce5',
  borderRadius: '8px', color: '#111827',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' as const,
};

const LABEL_STYLE = {
  display: 'block', fontSize: '0.72rem',
  color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600,
};

const BTN_PRIMARY = {
  padding: '0.55rem 1.4rem', borderRadius: '8px', border: 'none',
  background: '#4f46e5', color: '#fff',
  fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
} as const;

const BTN_GHOST = {
  padding: '0.45rem 1rem', borderRadius: '8px',
  background: 'transparent', border: '1px solid #d7dce5',
  color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer',
} as const;

/* ── 폼 필드 래퍼 ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

/* ── 계약 등록/수정 폼 모달 ── */
function ContractForm({
  initial,
  myName,
  onClose,
  onSaved,
  editId,
}: {
  initial: ContractInput;
  myName: string;
  onClose: () => void;
  onSaved: () => void;
  editId?: string;
}) {
  const [form, setForm] = useState<ContractInput>({
    ...initial,
    manager: initial.manager || myName,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: keyof ContractInput, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    const res = editId
      ? await updateContract(editId, form)
      : await createContract(form);
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    onSaved();
    onClose();
  }

  return (
    /* 오버레이 */
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '1rem',
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: '600px',
        background: '#141b2d',
        border: '1px solid #e5e9f0',
        borderRadius: '16px', padding: '1.5rem',
        marginTop: '1rem', marginBottom: '1rem',
      }}>
        <h2 style={{ margin: '0 0 1.2rem', fontSize: '1rem', fontWeight: 700, color: '#a8c4ff' }}>
          {editId ? '계약 수정' : '신규거래처계약 등록'}
        </h2>

        {/* 1. 담당자 */}
        <Field label="1. 담당자 *">
          <input style={INPUT_STYLE} value={form.manager}
            onChange={e => set('manager', e.target.value)} placeholder="담당자 이름" />
        </Field>

        {/* 2. 업체명 */}
        <Field label="2. 업체명 *">
          <input style={INPUT_STYLE} value={form.company_name}
            onChange={e => set('company_name', e.target.value)} placeholder="거래처명" />
        </Field>

        {/* 유형분류 */}
        <Field label="유형분류 *">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {CONTRACT_TYPES.map(t => {
              const on = (form.contract_type || '신규계약') === t;
              const amber = t === '기존처변경';
              const rgb = amber ? '251,191,36' : '96,165,250';
              return (
                <button key={t} type="button" onClick={() => set('contract_type', t)}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.82rem', fontWeight: 700,
                    background: on ? `rgba(${rgb},0.18)` : '#f8fafc',
                    border: on ? `1px solid rgba(${rgb},0.6)` : '1px solid #e5e9f0',
                    color: on ? (amber ? '#b45309' : '#2563eb') : 'var(--text-muted)',
                  }}>
                  {t === '신규계약' ? '🆕 신규계약' : '🔁 기존처변경'}
                </button>
              );
            })}
          </div>
        </Field>

        {/* 3. 계약기간 */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={LABEL_STYLE}>3. 계약기간 *</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" style={{ ...INPUT_STYLE, flex: 1, minWidth: '130px' }}
              value={form.contract_start}
              onChange={e => set('contract_start', e.target.value)} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>~</span>
            <input type="date" style={{ ...INPUT_STYLE, flex: 1, minWidth: '130px' }}
              value={form.contract_end}
              onChange={e => set('contract_end', e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.auto_renewal}
              onChange={e => set('auto_renewal', e.target.checked)}
              style={{ accentColor: '#4f46e5' }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>연 단위 자동 갱신</span>
          </label>
        </div>

        {/* 4. 증빙자료 */}
        <Field label="4. 증빙자료">
          <textarea style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }}
            value={form.evidence ?? ''}
            onChange={e => set('evidence', e.target.value)} />
        </Field>

        {/* 5. 세부내역 */}
        <Field label="5. 세부내역">
          <textarea style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }}
            value={form.details ?? ''}
            onChange={e => set('details', e.target.value)} />
        </Field>

        {/* 6. 처방 예상월 */}
        <Field label="6. 처방 예상월">
          <input style={INPUT_STYLE} value={form.expected_month}
            onChange={e => set('expected_month', e.target.value)}
            placeholder="예: 6월 EDI부터" />
        </Field>

        {/* 7. 처방 예상액 */}
        <Field label="7. 처방 예상액">
          <input style={INPUT_STYLE} value={form.expected_amount}
            onChange={e => set('expected_amount', e.target.value)}
            placeholder="예: 1천, 500만원" />
        </Field>

        {/* 8. 주요 병원 및 품목 */}
        <Field label="8. 주요 병원 및 품목">
          <textarea style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }}
            value={form.hospitals ?? ''}
            onChange={e => set('hospitals', e.target.value)}
            placeholder="주요 처방 병원, 취급 품목" />
        </Field>

        {/* 9. 연락처 */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={LABEL_STYLE}>9. 연락처</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <input style={INPUT_STYLE} value={form.contact_name}
              onChange={e => set('contact_name', e.target.value)}
              placeholder="담당자명 (예: 오성헌대표)" />
            <input style={INPUT_STYLE} value={form.contact_phone}
              onChange={e => set('contact_phone', e.target.value)}
              placeholder="전화번호" />
            <input type="email" style={INPUT_STYLE} value={form.contact_email}
              onChange={e => set('contact_email', e.target.value)}
              placeholder="이메일" />
          </div>
        </div>

        {/* 10. 비고 */}
        <Field label="10. 비고">
          <textarea style={{ ...INPUT_STYLE, minHeight: '60px', resize: 'vertical', lineHeight: 1.5 }}
            value={form.memo ?? ''}
            onChange={e => set('memo', e.target.value)} />
        </Field>

        {error && (
          <p style={{ color: '#dc2626', fontSize: '0.82rem', marginBottom: '0.75rem', margin: '0 0 0.75rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button style={BTN_GHOST} onClick={onClose} disabled={saving}>취소</button>
          <button style={BTN_PRIMARY} onClick={handleSubmit} disabled={saving}>
            {saving ? '저장 중...' : editId ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 테이블 셀 스타일 ── */
const cellTd: React.CSSProperties = {
  padding: '0.55rem 0.65rem', fontSize: '0.78rem', color: '#334155',
  borderBottom: '1px solid #f8fafc', verticalAlign: 'top',
};
const cellTh: React.CSSProperties = {
  padding: '0.55rem 0.65rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600,
  textAlign: 'left', whiteSpace: 'nowrap', background: '#ffffff',
  borderBottom: '1px solid #e5e9f0',
};

/* ── 계약 리스트 행 (클릭 시 상세 펼침) ── */
function ContractTr({
  contract: c, canEdit, showActions, colSpan, onEdit, onDelete,
}: {
  contract: ContractRow; canEdit: boolean; showActions: boolean; colSpan: number;
  onEdit: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const period = `${fmtDate(c.contract_start)} ~ ${fmtDate(c.contract_end)}${c.auto_renewal ? ' (자동갱신)' : ''}`;
  const contact = [c.contact_name, c.contact_phone].filter(Boolean).join(' / ');
  const expect  = [c.expected_month, c.expected_amount && `예상 ${c.expected_amount}`].filter(Boolean).join(' · ');

  return (
    <>
      <tr onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer', background: open ? 'rgba(99,102,241,0.06)' : undefined }}>
        <td style={{ ...cellTd, whiteSpace: 'nowrap' }}>
          <span style={{ marginRight: 5, fontSize: '0.6rem', opacity: 0.6 }}>{open ? '▼' : '▶'}</span>
          <span style={{ fontWeight: 700, color: '#111827' }}>{c.company_name}</span>
        </td>
        <td style={{ ...cellTd, whiteSpace: 'nowrap' }}><TypeBadge type={c.contract_type} /></td>
        <td style={{ ...cellTd, whiteSpace: 'nowrap' }}>{c.manager}</td>
        <td style={{ ...cellTd, color: '#475569', whiteSpace: 'nowrap' }}>{period}</td>
        <td style={{ ...cellTd, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contact}>{contact || '-'}</td>
        <td style={{ ...cellTd, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={expect}>{expect || '-'}</td>
        <td style={{ ...cellTd, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.hospitals ?? ''}>{c.hospitals || '-'}</td>
        {showActions && (
          <td style={{ ...cellTd, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
            {canEdit ? (
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button onClick={onEdit} style={{ ...BTN_GHOST, fontSize: '0.7rem', padding: '0.25rem 0.55rem' }}>수정</button>
                <button onClick={onDelete} style={{ ...BTN_GHOST, fontSize: '0.7rem', padding: '0.25rem 0.55rem', borderColor: 'rgba(248,113,113,0.3)', color: '#dc2626' }}>삭제</button>
              </div>
            ) : <span style={{ opacity: 0.3 }}>-</span>}
          </td>
        )}
      </tr>
      {open && (
        <tr>
          <td colSpan={colSpan} style={{ ...cellTd, background: '#ffffff' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', padding: '0.1rem 0.2rem' }}>
              {c.contact_email && <DetailRow label="이메일"    value={c.contact_email} />}
              {c.hospitals     && <DetailRow label="병원·품목" value={c.hospitals} />}
              {c.evidence      && <DetailRow label="증빙자료"  value={c.evidence} />}
              {c.details       && <DetailRow label="세부내역"  value={c.details} />}
              {c.memo          && <DetailRow label="비고"      value={c.memo} />}
              <DetailRow label="등록일" value={fmtDate(c.created_at.slice(0, 10))} />
              {canEdit && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.6rem', borderTop: '1px solid #f1f5f9' }}>
                  <button onClick={e => { e.stopPropagation(); onEdit(); }}
                    style={{ ...BTN_PRIMARY, fontSize: '0.78rem', padding: '0.4rem 0.9rem' }}>✏️ 수정</button>
                  <button onClick={e => { e.stopPropagation(); onDelete(); }}
                    style={{ ...BTN_GHOST, fontSize: '0.78rem', padding: '0.4rem 0.9rem', borderColor: 'rgba(248,113,113,0.35)', color: '#dc2626' }}>🗑 삭제</button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── 모바일 카드 버전 (확장·수정·삭제 유지) ── */
function ContractCard({
  contract: c, canEdit, onEdit, onDelete,
}: {
  contract: ContractRow; canEdit: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const period = `${fmtDate(c.contract_start)} ~ ${fmtDate(c.contract_end)}${c.auto_renewal ? ' (자동갱신)' : ''}`;
  const contact = [c.contact_name, c.contact_phone].filter(Boolean).join(' / ');
  const expect  = [c.expected_month, c.expected_amount && `예상 ${c.expected_amount}`].filter(Boolean).join(' · ');
  return (
    <div className="mcard">
      <div className="mcard-head" onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer' }}>
        <span className="mcard-title">{c.company_name}</span>
        <TypeBadge type={c.contract_type} />
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#94a3b8' }}>{open ? '▼' : '▶'}</span>
      </div>
      <div className="mcard-row"><span className="mcard-k">담당자</span><span className="mcard-v" style={{ fontWeight: 400 }}>{c.manager}</span></div>
      <div className="mcard-row"><span className="mcard-k">계약기간</span><span className="mcard-v" style={{ fontWeight: 400 }}>{period}</span></div>
      <div className="mcard-row"><span className="mcard-k">연락처</span><span className="mcard-v" style={{ fontWeight: 400 }}>{contact || '-'}</span></div>
      <div className="mcard-row"><span className="mcard-k">처방 예상</span><span className="mcard-v" style={{ fontWeight: 400 }}>{expect || '-'}</span></div>
      <div className="mcard-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.15rem' }}>
        <span className="mcard-k">주요 병원·품목</span>
        <span className="mcard-v" style={{ textAlign: 'left', fontWeight: 400, whiteSpace: 'pre-wrap' }}>{c.hospitals || '-'}</span>
      </div>
      {open && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #eef1f6', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {c.contact_email && <DetailRow label="이메일"   value={c.contact_email} />}
          {c.evidence      && <DetailRow label="증빙자료" value={c.evidence} />}
          {c.details       && <DetailRow label="세부내역" value={c.details} />}
          {c.memo          && <DetailRow label="비고"     value={c.memo} />}
          <DetailRow label="등록일" value={fmtDate(c.created_at.slice(0, 10))} />
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

function TypeBadge({ type }: { type: string | null }) {
  const isChange = type === '기존처변경';
  const rgb = isChange ? '251,191,36' : '96,165,250';
  const col = isChange ? '#b45309' : '#2563eb';
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap', padding: '0.12rem 0.45rem', borderRadius: 5,
      background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.3)`, color: col,
    }}>{isChange ? '기존처변경' : '신규계약'}</span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, minWidth: '64px', paddingTop: '0.1rem' }}>{label}</span>
      <span style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</span>
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
export default function ContractsClient({
  contracts: initialContracts,
  isAdmin,
  myName,
  userId,
}: {
  contracts: ContractRow[];
  isAdmin:   boolean;
  myName:    string;
  userId:    string;
}) {
  const [contracts, setContracts] = useState<ContractRow[]>(initialContracts);
  const [showForm, setShowForm]     = useState(false);
  const [editTarget, setEditTarget] = useState<ContractRow | null>(null);
  const [inputValue, setInputValue] = useState('');   // 입력 중인 텍스트
  const [search, setSearch]         = useState('');   // 실제 적용된 검색어 (버튼/엔터 시 반영)
  const [activeTab, setActiveTab]   = useState<'전체' | '올해' | '이번달' | '유효중' | '신규계약' | '기존처변경'>('전체');
  const [deleting, setDeleting]     = useState<string | null>(null);

  function applySearch() { setSearch(inputValue.trim()); }

  /* 오늘 날짜 (KST) */
  const today = (() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  })();
  const thisYear  = today.slice(0, 4);
  const thisMonth = today.slice(0, 7);

  /* 탭별 카운트 */
  const isChange = (c: ContractRow) => c.contract_type === '기존처변경';
  const counts = useMemo(() => ({
    전체:   contracts.length,
    올해:   contracts.filter(c => c.contract_start.startsWith(thisYear)).length,
    이번달: contracts.filter(c => c.contract_start.startsWith(thisMonth)).length,
    유효중: contracts.filter(c => c.contract_start <= today && (!c.contract_end || c.contract_end >= today)).length,
    신규계약:   contracts.filter(c => !isChange(c)).length,
    기존처변경: contracts.filter(c =>  isChange(c)).length,
  }), [contracts, today, thisYear, thisMonth]);

  /* 클라이언트 필터 */
  const filtered = useMemo(() => {
    return contracts.filter(c => {
      /* 탭 필터 */
      if (activeTab === '올해'   && !c.contract_start.startsWith(thisYear))  return false;
      if (activeTab === '이번달' && !c.contract_start.startsWith(thisMonth)) return false;
      if (activeTab === '유효중' && !(c.contract_start <= today && (!c.contract_end || c.contract_end >= today))) return false;
      if (activeTab === '신규계약'   && isChange(c))  return false;
      if (activeTab === '기존처변경' && !isChange(c)) return false;
      /* 키워드 검색 */
      if (search) {
        const q = search.toLowerCase();
        if (!c.company_name.toLowerCase().includes(q) &&
            !c.manager.toLowerCase().includes(q) &&
            !(c.hospitals ?? '').toLowerCase().includes(q) &&
            !(c.contact_name ?? '').toLowerCase().includes(q) &&
            !(c.memo ?? '').toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [contracts, search, activeTab, today, thisYear, thisMonth]);

  async function handleDelete(id: string) {
    if (!confirm('계약을 삭제하시겠습니까?')) return;
    setDeleting(id);
    const res = await deleteContract(id);
    setDeleting(null);
    if (res.error) { alert(res.error); return; }
    setContracts(prev => prev.filter(c => c.id !== id));
  }

  function openEdit(c: ContractRow) {
    setEditTarget(c);
    setShowForm(true);
  }

  function toInput(c: ContractRow): ContractInput {
    return {
      manager:         c.manager,
      company_name:    c.company_name,
      contract_type:   c.contract_type ?? '신규계약',
      contract_start:  c.contract_start,
      contract_end:    c.contract_end ?? '',
      auto_renewal:    c.auto_renewal,
      evidence:        c.evidence ?? '',
      details:         c.details  ?? '',
      expected_month:  c.expected_month  ?? '',
      expected_amount: c.expected_amount ?? '',
      hospitals:       c.hospitals ?? '',
      contact_name:    c.contact_name  ?? '',
      contact_phone:   c.contact_phone ?? '',
      contact_email:   c.contact_email ?? '',
      memo:            c.memo ?? '',
    };
  }

  return (
    <div style={{ marginTop: '1rem' }}>

      {/* ── 카운트 카드 ── */}
      <div className="visit-stats-grid">
        {([
          { tab: '전체',   color: '#9333ea', rgba: 'rgba(162,89,255,' },
          { tab: '올해',   color: '#2563eb', rgba: 'rgba(59,130,246,'  },
          { tab: '이번달', color: '#059669', rgba: 'rgba(34,197,94,'   },
          { tab: '유효중', color: '#b45309', rgba: 'rgba(251,191,36,'  },
          { tab: '신규계약',   color: '#2563eb', rgba: 'rgba(96,165,250,' },
          { tab: '기존처변경', color: '#b45309', rgba: 'rgba(251,146,60,' },
        ] as const).map(({ tab, color, rgba }) => {
          const active = activeTab === tab;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              ...statCard,
              background: active ? `${rgba}0.18)` : `${rgba}0.07)`,
              border: `1px solid ${active ? `${rgba}0.55)` : `${rgba}0.22)`}`,
              cursor: 'pointer',
              outline: 'none',
            }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>
                {counts[tab]}
              </span>
              <span style={{ fontSize: '0.72rem', color: active ? color : 'var(--text-muted)', marginTop: '0.2rem' }}>
                {tab}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 검색 바 ── */}
      <div className="auth-card" style={{ marginBottom: '1rem', padding: '0.9rem 1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            placeholder="🔍  업체명 · 담당자 · 병원 · 비고 검색"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
          />
          <button style={{ ...primaryBtn, flexShrink: 0 }} onClick={applySearch}>
            검색
          </button>
          <button style={{ ...primaryBtn, flexShrink: 0 }}
            onClick={() => { setEditTarget(null); setShowForm(true); }}>
            + 신규 등록
          </button>
        </div>
        {search && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span style={{ color: '#4f46e5' }}>"{search}"</span> 검색 중
            <button onClick={() => { setSearch(''); setInputValue(''); }}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
              ✕ 초기화
            </button>
          </div>
        )}
      </div>

      {/* ── 건수 + 다운로드 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {filtered.length}건{filtered.length !== contracts.length && ` / 전체 ${contracts.length}건`}
        </span>
        <button
          onClick={() => downloadContractsCsv(filtered)}
          disabled={filtered.length === 0}
          style={{ ...BTN_GHOST, fontSize: '0.76rem', padding: '0.35rem 0.8rem',
            opacity: filtered.length === 0 ? 0.4 : 1, cursor: filtered.length === 0 ? 'not-allowed' : 'pointer' }}
        >
          ⬇ 리스트 다운로드
        </button>
      </div>

      {/* ── 계약 리스트(테이블) ── */}
      {filtered.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {contracts.length === 0 ? '등록된 계약이 없습니다.' : '검색 결과가 없습니다.'}
        </div>
      ) : (() => {
        const showActions = isAdmin || filtered.some(c => c.user_id === userId);
        const colCount = 7 + (showActions ? 1 : 0);
        return (
          <>
          <div className="resp-table" style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: 12 }}>
            <table style={{ width: '100%', minWidth: showActions ? 880 : 760, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={cellTh}>업체명</th>
                  <th style={cellTh}>유형</th>
                  <th style={cellTh}>담당자</th>
                  <th style={cellTh}>계약기간</th>
                  <th style={cellTh}>연락처</th>
                  <th style={cellTh}>처방 예상</th>
                  <th style={cellTh}>주요 병원·품목</th>
                  {showActions && <th style={cellTh}>관리</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <ContractTr
                    key={c.id}
                    contract={c}
                    showActions={showActions}
                    colSpan={colCount}
                    canEdit={isAdmin || c.user_id === userId}
                    onEdit={() => openEdit(c)}
                    onDelete={() => !deleting && handleDelete(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="resp-cards">
            {filtered.map(c => (
              <ContractCard
                key={c.id}
                contract={c}
                canEdit={isAdmin || c.user_id === userId}
                onEdit={() => openEdit(c)}
                onDelete={() => !deleting && handleDelete(c.id)}
              />
            ))}
          </div>
          </>
        );
      })()}

      {/* ── 폼 모달 ── */}
      {showForm && (
        <ContractForm
          initial={editTarget ? toInput(editTarget) : EMPTY}
          myName={myName}
          onClose={() => setShowForm(false)}
          editId={editTarget?.id}
          onSaved={() => {
            /* 페이지 새로고침으로 최신 데이터 반영 */
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

/* ── 공유 스타일 상수 (VisitsClient와 동일) ── */
const statCard: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '0.9rem 0.5rem', borderRadius: '14px', gap: '0.2rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px',
  background: '#f8fafc', border: '1px solid #e5e9f0',
  color: 'var(--text-primary)', fontSize: '16px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', minHeight: '44px',
};

const primaryBtn: React.CSSProperties = {
  padding: '0.62rem 1.2rem', borderRadius: '10px', border: 'none', fontFamily: 'inherit',
  background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))',
  color: '#fff', fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minHeight: '44px',
  whiteSpace: 'nowrap',
};
