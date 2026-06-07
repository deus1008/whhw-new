'use client';

import { useState, useMemo } from 'react';
import { createContract, updateContract, deleteContract } from '@/app/contracts/actions';
import type { ContractInput } from '@/app/contracts/actions';

/* ── 타입 ── */
export type ContractRow = {
  id:              string;
  manager:         string;
  company_name:    string;
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

const EMPTY: ContractInput = {
  manager: '', company_name: '',
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

/* ── 공통 스타일 ── */
const CARD = {
  background:   'rgba(255,255,255,0.04)',
  border:       '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  padding:      '1rem',
  marginBottom: '0.75rem',
} as const;

const INPUT_STYLE = {
  width: '100%', padding: '0.55rem 0.7rem',
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px', color: '#fff',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' as const,
};

const LABEL_STYLE = {
  display: 'block', fontSize: '0.72rem',
  color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 600,
};

const BTN_PRIMARY = {
  padding: '0.55rem 1.4rem', borderRadius: '8px', border: 'none',
  background: 'rgba(99,102,241,0.8)', color: '#fff',
  fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
} as const;

const BTN_GHOST = {
  padding: '0.45rem 1rem', borderRadius: '8px',
  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
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
        border: '1px solid rgba(255,255,255,0.12)',
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
              style={{ accentColor: '#818cf8' }} />
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
          <p style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: '0.75rem', margin: '0 0 0.75rem' }}>
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

/* ── 계약 카드 ── */
function ContractCard({
  contract,
  canEdit,
  onEdit,
  onDelete,
}: {
  contract: ContractRow;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const period = `${fmtDate(contract.contract_start)} ~ ${fmtDate(contract.contract_end)}${contract.auto_renewal ? ' (자동갱신)' : ''}`;

  return (
    <div style={CARD}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginRight: '0.5rem' }}>
            {contract.company_name}
          </span>
          <span style={{
            fontSize: '0.72rem', padding: '0.15rem 0.5rem',
            background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: '999px', color: '#a5b4fc', whiteSpace: 'nowrap' as const,
          }}>
            {contract.manager}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
          {canEdit && (
            <>
              <button onClick={onEdit} style={{
                ...BTN_GHOST, fontSize: '0.72rem', padding: '0.3rem 0.6rem',
              }}>수정</button>
              <button onClick={onDelete} style={{
                ...BTN_GHOST, fontSize: '0.72rem', padding: '0.3rem 0.6rem',
                borderColor: 'rgba(248,113,113,0.3)', color: '#f87171',
              }}>삭제</button>
            </>
          )}
        </div>
      </div>

      {/* 계약기간 */}
      <p style={{ fontSize: '0.78rem', color: '#a8c4ff', margin: '0 0 0.5rem' }}>
        📅 {period}
      </p>

      {/* 연락처 요약 */}
      {(contract.contact_name || contract.contact_phone) && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
          📞 {[contract.contact_name, contract.contact_phone].filter(Boolean).join(' / ')}
          {contract.contact_email && ` / ${contract.contact_email}`}
        </p>
      )}

      {/* 처방 예상 */}
      {(contract.expected_month || contract.expected_amount) && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
          💊 {contract.expected_month && `${contract.expected_month}`}
          {contract.expected_month && contract.expected_amount && ' · '}
          {contract.expected_amount && `예상 ${contract.expected_amount}`}
        </p>
      )}

      {/* 병원/품목 요약 */}
      {contract.hospitals && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.5rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: expanded ? 'pre-wrap' : 'nowrap' as const }}>
          🏥 {contract.hospitals}
        </p>
      )}

      {/* 더보기 토글 */}
      <button onClick={() => setExpanded(v => !v)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0.2rem 0',
      }}>
        {expanded ? '▲ 접기' : '▼ 상세 보기'}
      </button>

      {expanded && (
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {contract.evidence && (
            <DetailRow label="증빙자료" value={contract.evidence} />
          )}
          {contract.details && (
            <DetailRow label="세부내역" value={contract.details} />
          )}
          {contract.memo && (
            <DetailRow label="비고" value={contract.memo} />
          )}
          <DetailRow label="등록일" value={fmtDate(contract.created_at.slice(0, 10))} />
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, minWidth: '54px', paddingTop: '0.1rem' }}>{label}</span>
      <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{value}</span>
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
  const [showForm, setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState<ContractRow | null>(null);
  const [search, setSearch]         = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');
  const [deleting, setDeleting]     = useState<string | null>(null);

  /* 클라이언트 필터 */
  const filtered = useMemo(() => {
    return contracts.filter(c => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.company_name.toLowerCase().includes(q) &&
            !c.manager.toLowerCase().includes(q) &&
            !(c.hospitals ?? '').toLowerCase().includes(q))
          return false;
      }
      if (filterFrom && c.contract_start < filterFrom) return false;
      if (filterTo   && c.contract_start > filterTo)   return false;
      return true;
    });
  }, [contracts, search, filterFrom, filterTo]);

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

      {/* ── 필터 영역 ── */}
      <div style={{ ...CARD, marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {/* 검색 */}
          <input
            style={INPUT_STYLE}
            placeholder="🔍  업체명 · 담당자 · 병원 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {/* 기간 필터 */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>계약시작</span>
            <input type="date" style={{ ...INPUT_STYLE, flex: 1, minWidth: '130px' }}
              value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>~</span>
            <input type="date" style={{ ...INPUT_STYLE, flex: 1, minWidth: '130px' }}
              value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            {(filterFrom || filterTo) && (
              <button style={{ ...BTN_GHOST, fontSize: '0.72rem', padding: '0.35rem 0.7rem', flexShrink: 0 }}
                onClick={() => { setFilterFrom(''); setFilterTo(''); }}>초기화</button>
            )}
          </div>
        </div>
      </div>

      {/* ── 등록 버튼 + 건수 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {filtered.length}건{filtered.length !== contracts.length && ` / 전체 ${contracts.length}건`}
        </span>
        <button style={BTN_PRIMARY} onClick={() => { setEditTarget(null); setShowForm(true); }}>
          + 신규 계약 등록
        </button>
      </div>

      {/* ── 계약 목록 ── */}
      {filtered.length === 0 ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {contracts.length === 0 ? '등록된 계약이 없습니다.' : '검색 결과가 없습니다.'}
        </div>
      ) : (
        filtered.map(c => (
          <ContractCard
            key={c.id}
            contract={c}
            canEdit={isAdmin || c.user_id === userId}
            onEdit={() => openEdit(c)}
            onDelete={() => !deleting && handleDelete(c.id)}
          />
        ))
      )}

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
