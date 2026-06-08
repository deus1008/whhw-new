'use client';

import { useState, useMemo } from 'react';
import type { VisitRecord } from '@/app/visits/page';
import {
  createVisitRecord,
  updateVisitRecord,
  deleteVisitRecord,
  type RecordInput,
} from '@/app/visits/actions';

/* ── 상수 ─────────────────────────────────────────────────── */
const CUSTOMER_TYPES = ['CSO법인', '딜러'] as const;

const TYPE_META: Record<string, { color: string; bg: string; bd: string }> = {
  'CSO법인': { color: '#93c5fd', bg: 'rgba(59,130,246,0.12)',  bd: 'rgba(59,130,246,0.28)'  },
  '딜러':    { color: '#c084fc', bg: 'rgba(162,89,255,0.12)', bd: 'rgba(162,89,255,0.28)' },
};

type Period = '전체' | '이번주' | '이번달' | '지난달';
type FilterType = '전체' | 'CSO법인' | '딜러';

function todayStr() { return new Date().toISOString().slice(0, 10); }

function weekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function lastMonthRange(): [string, string] {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const end   = new Date(d.getFullYear(), d.getMonth(), 0);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

/* ── 빈 폼 ─────────────────────────────────────────────────── */
function emptyForm(): RecordInput {
  return {
    visited_at:    todayStr(),
    customer_name: '',
    customer_type: 'CSO법인',
    contact_name:  '',
    purpose:       '',
    products:      '',
    content:       '',
    next_action:   '',
    follow_up_date: '',
  };
}

/* ── Badge ─────────────────────────────────────────────────── */
function Badge({ label, color, bg, bd }: { label: string; color: string; bg: string; bd: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: '100px',
      fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.03em',
      color, background: bg, border: `1px solid ${bd}`, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

/* ── 컴포넌트 ─────────────────────────────────────────────── */
interface Props {
  initialRecords: VisitRecord[];
  userId: string;
  isAdmin: boolean;
}

export default function VisitsClient({ initialRecords, userId, isAdmin }: Props) {
  const [records, setRecords]           = useState<VisitRecord[]>(initialRecords);
  const [formMode, setFormMode]         = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId]             = useState<string | null>(null);
  const [form, setForm]                 = useState<RecordInput>(emptyForm());
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [confirmDeleteId, setConfirmId] = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [formError, setFormError]       = useState('');
  const [actionError, setActionError]   = useState('');
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState<FilterType>('전체');
  const [filterPeriod, setFilterPeriod] = useState<Period>('전체');

  /* ── 통계 ────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const td  = todayStr();
    const ws  = weekStart();
    const ms  = monthStart();
    const [ls, le] = lastMonthRange();
    return {
      today:     records.filter(r => r.visited_at === td).length,
      thisWeek:  records.filter(r => r.visited_at >= ws).length,
      thisMonth: records.filter(r => r.visited_at >= ms).length,
      lastMonth: records.filter(r => r.visited_at >= ls && r.visited_at <= le).length,
      total:     records.length,
    };
  }, [records]);

  /* ── 필터 ────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = records;
    if (filterType !== '전체') list = list.filter(r => r.customer_type === filterType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.customer_name.toLowerCase().includes(q) ||
        (r.contact_name ?? '').toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q) ||
        (r.products ?? '').toLowerCase().includes(q)
      );
    }
    if (filterPeriod !== '전체') {
      if (filterPeriod === '이번주')  list = list.filter(r => r.visited_at >= weekStart());
      else if (filterPeriod === '이번달') list = list.filter(r => r.visited_at >= monthStart());
      else if (filterPeriod === '지난달') {
        const [ls, le] = lastMonthRange();
        list = list.filter(r => r.visited_at >= ls && r.visited_at <= le);
      }
    }
    return list;
  }, [records, filterType, search, filterPeriod]);

  /* ── 폼 제어 ─────────────────────────────────────────────── */
  function openCreate() {
    setForm(emptyForm());
    setFormError('');
    setFormMode('create');
    setEditId(null);
    setExpandedId(null);
  }

  function openEdit(rec: VisitRecord) {
    setForm({
      visited_at:    rec.visited_at,
      customer_name: rec.customer_name,
      customer_type: rec.customer_type,
      contact_name:  rec.contact_name  ?? '',
      purpose:       rec.purpose       ?? '',
      products:      rec.products      ?? '',
      content:       rec.content,
      next_action:   rec.next_action   ?? '',
      follow_up_date: rec.follow_up_date ?? '',
    });
    setFormError('');
    setEditId(rec.id);
    setFormMode('edit');
    setExpandedId(null);
  }

  function closeForm() {
    setFormMode('none');
    setEditId(null);
    setFormError('');
  }

  function setField(key: keyof RecordInput, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  /* ── 저장 ─────────────────────────────────────────────────── */
  async function handleSave() {
    setSaving(true);
    setFormError('');

    const result = formMode === 'create'
      ? await createVisitRecord(form)
      : await updateVisitRecord(editId!, form);

    if (result.error) {
      setFormError(result.error);
      setSaving(false);
      return;
    }

    if (result.data) {
      if (formMode === 'create') {
        setRecords(prev => [result.data!, ...prev]);
      } else {
        setRecords(prev => prev.map(r => r.id === editId ? result.data! : r));
      }
    }
    closeForm();
    setSaving(false);
  }

  /* ── 삭제 ─────────────────────────────────────────────────── */
  async function handleDelete(id: string) {
    setDeleting(true);
    setActionError('');
    const result = await deleteVisitRecord(id);
    if (result.error) {
      setActionError(result.error);
    } else {
      setRecords(prev => prev.filter(r => r.id !== id));
      setConfirmId(null);
    }
    setDeleting(false);
  }

  /* ── 렌더 ─────────────────────────────────────────────────── */
  return (
    <div>
      {/* ── 상단 타이틀 + 버튼 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <h1 style={pageTitle}>
          방문 기록
          <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
            (전체 조회)
          </span>
        </h1>
        {formMode === 'none' && (
          <button onClick={openCreate} style={primaryBtn}>
            + 새 방문 기록
          </button>
        )}
      </div>

      {/* ── 통계 카드 ── */}
      <div className="visit-stats-grid">
        {[
          { label: '오늘',   value: stats.today,     color: '#fde68a', rgba: 'rgba(251,191,36,' },
          { label: '이번 주', value: stats.thisWeek,  color: '#86efac', rgba: 'rgba(34,197,94,'  },
          { label: '이번 달', value: stats.thisMonth, color: '#93c5fd', rgba: 'rgba(59,130,246,' },
          { label: '전체',   value: stats.total,     color: '#c084fc', rgba: 'rgba(162,89,255,' },
        ].map(({ label, value, color, rgba }) => (
          <div key={label} style={{
            ...statCard,
            background: `${rgba}0.07)`,
            border: `1px solid ${rgba}0.22)`,
          }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── 폼 (생성 / 수정) ── */}
      {formMode !== 'none' && (
        <div className="auth-card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={sectionTitle}>
            {formMode === 'create' ? '새 방문 기록' : '방문 기록 수정'}
          </h2>

          {formError && (
            <div className="auth-error" style={{ marginBottom: '1rem' }}>{formError}</div>
          )}

          {/* Row 1: 방문일 · 거래처명 · 거래처유형 */}
          <div className="visit-form-grid">
            <Field label="방문일 *">
              <input type="date" value={form.visited_at}
                onChange={e => setField('visited_at', e.target.value)}
                style={inputStyle} disabled={saving} />
            </Field>
            <Field label="거래처명 *">
              <input type="text" value={form.customer_name}
                onChange={e => setField('customer_name', e.target.value)}
                placeholder="거래처명 입력" style={inputStyle} disabled={saving} />
            </Field>
            <Field label="거래처 유형 *">
              <select value={form.customer_type}
                onChange={e => setField('customer_type', e.target.value)}
                style={selectStyle} disabled={saving}>
                {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>

          {/* Row 2: 담당자 · 방문목적 */}
          <div className="visit-form-grid">
            <Field label="담당자명">
              <input type="text" value={form.contact_name}
                onChange={e => setField('contact_name', e.target.value)}
                placeholder="담당자 이름" style={inputStyle} disabled={saving} />
            </Field>
            <Field label="방문 목적">
              <input type="text" value={form.purpose}
                onChange={e => setField('purpose', e.target.value)}
                placeholder="예: 신제품 소개, 수수료 협의" style={inputStyle} disabled={saving} />
            </Field>
          </div>

          {/* Row 3: 논의 제품 */}
          <Field label="논의 제품">
            <input type="text" value={form.products}
              onChange={e => setField('products', e.target.value)}
              placeholder="예: 펠루비프로펜, AJU-S56" style={inputStyle} disabled={saving} />
          </Field>

          {/* Row 4: 협의 내용 */}
          <Field label="협의 내용 *">
            <textarea value={form.content}
              onChange={e => setField('content', e.target.value)}
              placeholder="방문에서 협의한 내용을 상세히 기록하세요."
              rows={4} style={{ ...inputStyle, resize: 'vertical' }} disabled={saving} />
          </Field>

          {/* Row 5: 다음 조치사항 */}
          <Field label="다음 조치사항">
            <textarea value={form.next_action}
              onChange={e => setField('next_action', e.target.value)}
              placeholder="후속 조치 또는 다음 방문 시 확인할 사항"
              rows={2} style={{ ...inputStyle, resize: 'vertical' }} disabled={saving} />
          </Field>

          {/* Row 6: 후속 방문 예정일 */}
          <Field label="후속 방문 예정일">
            <input type="date" value={form.follow_up_date}
              onChange={e => setField('follow_up_date', e.target.value)}
              style={inputStyle} disabled={saving} />
          </Field>

          {/* 버튼 */}
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.2rem' }}>
            <button onClick={closeForm} disabled={saving} style={cancelBtn}>취소</button>
            <button onClick={handleSave} disabled={saving} style={primaryBtn}>
              {saving ? <><span style={spinnerSt} />저장 중…</> : (formMode === 'create' ? '저장' : '수정 완료')}
            </button>
          </div>
        </div>
      )}

      {/* ── 필터 바 ── */}
      <div className="auth-card" style={{ marginBottom: '1rem', padding: '0.9rem 1rem' }}>
        {/* 검색 */}
        <input
          type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  거래처 · 담당자 · 제품 검색"
          style={{ ...inputStyle, width: '100%', marginBottom: '0.7rem' }}
        />
        {/* 거래처유형 + 기간 필터 — 가로 스크롤 */}
        <div className="scroll-x">
          {(['전체', 'CSO법인', '딜러'] as FilterType[]).map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={pillBtn(filterType === t)}>
              {t}
            </button>
          ))}
          <span style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 0.2rem', flexShrink: 0 }} />
          {(['전체', '이번주', '이번달', '지난달'] as Period[]).map(p => (
            <button key={p} onClick={() => setFilterPeriod(p)} style={pillBtn(filterPeriod === p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── 기록 목록 ── */}
      {actionError && (
        <div className="auth-error" style={{ marginBottom: '0.8rem' }}>{actionError}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {filtered.length === 0 ? (
          <div className="auth-card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {records.length === 0 ? '아직 방문 기록이 없습니다. 첫 기록을 작성해보세요.' : '검색 조건에 맞는 기록이 없습니다.'}
            </p>
          </div>
        ) : (
          filtered.map(rec => {
            const meta      = TYPE_META[rec.customer_type];
            const isExpanded = expandedId === rec.id;
            const isConfirm  = confirmDeleteId === rec.id;
            const canEdit    = isAdmin || rec.user_id === userId;

            return (
              <div key={rec.id} className="auth-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* 카드 헤더 */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  style={cardHeader}
                >
                  {/* 날짜 */}
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', flexShrink: 0, minWidth: '72px' }}>
                    {rec.visited_at.replace(/-/g, '.')}
                  </span>

                  {/* 유형 배지 */}
                  <Badge label={rec.customer_type} {...meta} />

                  {/* 거래처명 + 담당자 */}
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', minWidth: '80px' }}>
                    {rec.customer_name}
                    {rec.contact_name && (
                      <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                        · {rec.contact_name}
                      </span>
                    )}
                  </span>

                  {/* 논의 제품 */}
                  {rec.products && (
                    <span style={{ fontSize: '0.75rem', color: '#c084fc', background: 'rgba(162,89,255,0.1)', border: '1px solid rgba(162,89,255,0.2)', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {rec.products.length > 20 ? rec.products.slice(0, 20) + '…' : rec.products}
                    </span>
                  )}

                  {/* 작성자 표시 — 모든 사용자에게 공개 */}
                  {(rec.user_name || rec.user_email) && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      👤 {rec.user_name ?? rec.user_email}
                    </span>
                  )}

                  {/* 후속 예정 */}
                  {rec.follow_up_date && (
                    <span style={{ fontSize: '0.72rem', color: '#fde68a', flexShrink: 0 }}>
                      ↻ {rec.follow_up_date.replace(/-/g, '.')}
                    </span>
                  )}

                  {/* 펼치기 아이콘 */}
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    ▾
                  </span>
                </div>

                {/* 확장 영역 */}
                {isExpanded && (
                  <div style={{ padding: '1rem 1.2rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>

                    {/* 협의 내용 */}
                    <DetailRow label="협의 내용" value={rec.content} multiline />

                    {/* 선택 항목 */}
                    {rec.purpose     && <DetailRow label="방문 목적"      value={rec.purpose} />}
                    {rec.products    && <DetailRow label="논의 제품"      value={rec.products} />}
                    {rec.next_action && <DetailRow label="다음 조치사항"  value={rec.next_action} multiline />}
                    {rec.follow_up_date && <DetailRow label="후속 방문 예정" value={rec.follow_up_date.replace(/-/g, '.')} />}

                    {/* 액션 버튼 */}
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem', flexWrap: 'wrap' }}>
                      {isConfirm ? (
                        <>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>정말 삭제할까요?</span>
                          <button onClick={() => handleDelete(rec.id)} disabled={deleting}
                            style={{ ...dangerBtn, opacity: deleting ? 0.5 : 1 }}>
                            {deleting ? '삭제 중…' : '삭제'}
                          </button>
                          <button onClick={() => { setConfirmId(null); setActionError(''); }} disabled={deleting} style={cancelBtn}>
                            취소
                          </button>
                        </>
                      ) : (
                        <>
                          {canEdit && (
                            <>
                              <button onClick={() => openEdit(rec)} style={editBtn}>수정</button>
                              <button onClick={() => { setConfirmId(rec.id); setActionError(''); }} style={dangerBtn}>삭제</button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── 보조 컴포넌트 ──────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.8rem' }}>
      <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

function DetailRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div style={{ marginBottom: '0.7rem' }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <p style={{
        margin: '0.25rem 0 0', fontSize: '0.88rem', color: 'var(--text-primary)',
        lineHeight: 1.65, whiteSpace: multiline ? 'pre-wrap' : 'normal',
        wordBreak: 'break-word',
      }}>
        {value}
      </p>
    </div>
  );
}

/* ── 스타일 상수 ────────────────────────────────────────────── */
const pageTitle: React.CSSProperties = {
  fontSize: '1.3rem', fontWeight: 700,
  background: 'linear-gradient(135deg, #ffffff 0%, #a8c4ff 100%)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 700, marginBottom: '1.2rem',
  background: 'linear-gradient(135deg, #ffffff 0%, #a8c4ff 100%)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
};

const statCard: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '0.9rem 0.5rem', borderRadius: '14px', gap: '0.2rem',
};

const formGrid3: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0 1rem',
};

const formGrid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 1rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem', borderRadius: '10px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)', fontSize: '16px', fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', minHeight: '44px',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer',
  background: '#1e293b',
};

const primaryBtn: React.CSSProperties = {
  padding: '0.62rem 1.4rem', borderRadius: '10px', border: 'none', fontFamily: 'inherit',
  background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))',
  color: '#fff', fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minHeight: '44px',
};

const cancelBtn: React.CSSProperties = {
  padding: '0.62rem 1.2rem', borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-muted)', fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit',
  minHeight: '44px',
};

const editBtn: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: '8px',
  border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)',
  color: '#93c5fd', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  minHeight: '44px',
};

const dangerBtn: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: '8px',
  border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)',
  color: '#fca5a5', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  minHeight: '44px',
};

const spinnerSt: React.CSSProperties = {
  width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.3)',
  borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block',
  animation: 'spin 0.7s linear infinite', flexShrink: 0,
};

const cardHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap',
  padding: '0.85rem 1.1rem', cursor: 'pointer',
  transition: 'background 0.15s',
};

function pillBtn(active: boolean): React.CSSProperties {
  return {
    padding: '0.45rem 0.9rem', borderRadius: '100px', cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: active ? 700 : 500, fontFamily: 'inherit',
    border: active ? '1px solid rgba(79,142,247,0.5)' : '1px solid rgba(255,255,255,0.09)',
    background: active ? 'rgba(79,142,247,0.18)' : 'rgba(255,255,255,0.04)',
    color: active ? '#93c5fd' : 'var(--text-muted)',
    transition: 'all 0.15s', whiteSpace: 'nowrap', minHeight: '38px', flexShrink: 0,
  };
}
