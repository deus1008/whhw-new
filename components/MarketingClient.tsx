'use client';

import { useState, useTransition } from 'react';
import type { MarketingSchedule } from '@/app/marketing/page';
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  type ScheduleInput,
} from '@/app/marketing/actions';

/* ── 카테고리 정의 ─────────────────────────────────────────── */
const CATEGORIES = ['전시회', '학술대회', '설명회', '광고/홍보', '심포지엄', '기타'];

const CAT_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  '전시회':   { dot: '#60a5fa', bg: 'rgba(59,130,246,0.15)',  text: '#93c5fd' },
  '학술대회': { dot: '#a78bfa', bg: 'rgba(139,92,246,0.15)',  text: '#c4b5fd' },
  '설명회':   { dot: '#34d399', bg: 'rgba(52,211,153,0.15)',  text: '#6ee7b7' },
  '광고/홍보':{ dot: '#fb923c', bg: 'rgba(251,146,60,0.15)',  text: '#fdba74' },
  '심포지엄': { dot: '#22d3ee', bg: 'rgba(6,182,212,0.15)',   text: '#67e8f9' },
  '기타':     { dot: '#94a3b8', bg: 'rgba(148,163,184,0.15)', text: '#cbd5e1' },
};
function catColor(cat: string | null) {
  return CAT_COLORS[cat ?? ''] ?? CAT_COLORS['기타'];
}

/* ── 날짜 유틸 ─────────────────────────────────────────────── */
const DAYS_KO   = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDate(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${y}.${m}.${d}`;
}
function getCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay   = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

/* ── 빈 폼 ─────────────────────────────────────────────────── */
const EMPTY: ScheduleInput = {
  title: '', start_date: '', end_date: '',
  category: '', location: '', assignee: '', memo: '',
};

/* ── Props ──────────────────────────────────────────────────── */
interface Props {
  initialSchedules: MarketingSchedule[];
  userId:  string;
  isAdmin: boolean;
}

/* ── 컴포넌트 ───────────────────────────────────────────────── */
export default function MarketingClient({ initialSchedules, userId, isAdmin }: Props) {
  const today = new Date();
  const [schedules, setSchedules] = useState<MarketingSchedule[]>(initialSchedules);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 모달 상태
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState<MarketingSchedule | null>(null);
  const [form,       setForm]       = useState<ScheduleInput>(EMPTY);
  const [formError,  setFormError]  = useState('');
  const [confirmId,  setConfirmId]  = useState<string | null>(null);
  const [isPending,  startTransition] = useTransition();

  /* ── 달력 계산 ─────────────────────────────────────────── */
  const grid = getCalendarGrid(year, month);
  const todayYMD = toYMD(today);

  // 이번 달 일정 (시작일 기준)
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthSchedules = schedules.filter(s => s.start_date.startsWith(monthStr));

  // 날짜별 이벤트 맵
  const eventMap: Record<string, MarketingSchedule[]> = {};
  for (const s of monthSchedules) {
    const key = s.start_date;
    if (!eventMap[key]) eventMap[key] = [];
    eventMap[key].push(s);
  }

  // 목록에 보여줄 일정
  const listSchedules = selectedDate
    ? schedules.filter(s => s.start_date === selectedDate)
    : monthSchedules;

  /* ── 월 이동 ───────────────────────────────────────────── */
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  /* ── 모달 열기 ─────────────────────────────────────────── */
  function openCreate(date?: string) {
    setEditTarget(null);
    setForm({ ...EMPTY, start_date: date ?? toYMD(today) });
    setFormError('');
    setModalOpen(true);
  }
  function openEdit(s: MarketingSchedule) {
    setEditTarget(s);
    setForm({
      title:      s.title,
      start_date: s.start_date,
      end_date:   s.end_date ?? '',
      category:   s.category ?? '',
      location:   s.location ?? '',
      assignee:   s.assignee ?? '',
      memo:       s.memo ?? '',
    });
    setFormError('');
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditTarget(null); setForm(EMPTY); setFormError(''); }

  /* ── 저장 ──────────────────────────────────────────────── */
  function handleSave() {
    startTransition(async () => {
      setFormError('');
      let result;
      if (editTarget) {
        result = await updateSchedule(editTarget.id, form);
      } else {
        result = await createSchedule(form);
      }
      if (result.error) { setFormError(result.error); return; }
      if (result.data) {
        setSchedules(prev =>
          editTarget
            ? prev.map(s => s.id === editTarget.id ? result.data! : s)
            : [result.data!, ...prev].sort((a, b) => a.start_date.localeCompare(b.start_date)),
        );
      }
      closeModal();
    });
  }

  /* ── 삭제 ──────────────────────────────────────────────── */
  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteSchedule(id);
      if (result.error) { alert(result.error); return; }
      setSchedules(prev => prev.filter(s => s.id !== id));
      setConfirmId(null);
    });
  }

  /* ── 권한 확인 ─────────────────────────────────────────── */
  function canEdit(s: MarketingSchedule) { return isAdmin || s.user_id === userId; }

  /* ── 렌더 ──────────────────────────────────────────────── */
  return (
    <div>
      {/* ── 제목 + 추가 버튼 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <h1 style={{ fontSize: 'clamp(1.2rem, 3vw, 1.6rem)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          📅 주요 일정
        </h1>
        <button onClick={() => openCreate()} style={addBtn}>+ 일정 등록</button>
      </div>

      {/* ── 캘린더 ── */}
      <div className="auth-card" style={{ marginBottom: '1.5rem' }}>
        {/* 월 네비게이션 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
            {year}년 {MONTHS_KO[month]}
          </span>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>

        {/* 요일 헤더 */}
        <div style={calGrid}>
          {DAYS_KO.map((d, i) => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 600,
              color: i === 0 ? '#fca5a5' : i === 6 ? '#93c5fd' : 'var(--text-muted)',
              paddingBottom: '0.5rem' }}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div style={calGrid}>
          {grid.map((day, idx) => {
            if (!day) return <div key={`pad-${idx}`} />;
            const ymd      = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const isToday  = ymd === todayYMD;
            const isSel    = ymd === selectedDate;
            const events   = eventMap[ymd] ?? [];
            const dow      = idx % 7;

            return (
              <div
                key={ymd}
                onClick={() => setSelectedDate(isSel ? null : ymd)}
                style={{
                  borderRadius: '8px',
                  padding: '0.3rem 0.2rem',
                  cursor: 'pointer',
                  minHeight: '52px',
                  background: isSel ? 'rgba(79,142,247,0.18)' : isToday ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: isSel ? '1px solid rgba(79,142,247,0.5)' : isToday ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                  transition: 'background 0.12s',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isToday ? 'rgba(255,255,255,0.05)' : 'transparent'; }}
              >
                <div style={{
                  textAlign: 'center', fontSize: '0.78rem', fontWeight: isToday ? 700 : 400,
                  color: isToday ? '#93c5fd' : dow === 0 ? '#fca5a5' : dow === 6 ? '#93c5fd' : 'var(--text-primary)',
                  marginBottom: '0.2rem',
                }}>
                  {day}
                </div>
                {/* 이벤트 점 (최대 3개) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>
                  {events.slice(0, 3).map(e => (
                    <span key={e.id} style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: catColor(e.category).dot,
                      flexShrink: 0,
                    }} />
                  ))}
                  {events.length > 3 && (
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', lineHeight: 1 }}>+{events.length - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 카테고리 범례 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {CATEGORIES.map(cat => (
            <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: catColor(cat).dot, flexShrink: 0 }} />
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* ── 일정 목록 ── */}
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {selectedDate ? `${formatDate(selectedDate)} 일정` : `${year}년 ${MONTHS_KO[month]} 전체 일정`}
            <span style={{
              marginLeft: '0.5rem',
              background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.25)',
              borderRadius: '100px', padding: '2px 10px',
              fontSize: '0.72rem', fontWeight: 600, color: '#93c5fd',
            }}>{listSchedules.length}</span>
          </h2>
          {selectedDate && (
            <button onClick={() => openCreate(selectedDate)} style={{ ...addBtn, fontSize: '0.75rem', padding: '0.3rem 0.8rem' }}>
              + 이 날 등록
            </button>
          )}
        </div>

        {listSchedules.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
            {selectedDate ? '이 날 등록된 일정이 없습니다.' : '이번 달 등록된 일정이 없습니다.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {listSchedules.map(s => {
              const cc      = catColor(s.category);
              const isConf  = confirmId === s.id;
              const editable = canEdit(s);

              return (
                <div key={s.id} style={{
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  padding: '0.75rem 1rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem', flexWrap: 'wrap' }}>
                    {/* 카테고리 배지 */}
                    {s.category && (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px',
                        borderRadius: '100px', background: cc.bg, color: cc.text,
                        whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px',
                      }}>
                        {s.category}
                      </span>
                    )}
                    {/* 제목 */}
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                      {s.title}
                    </span>
                    {/* 버튼 */}
                    {editable && (
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        {isConf ? (
                          <>
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', alignSelf: 'center' }}>삭제?</span>
                            <button onClick={() => handleDelete(s.id)} disabled={isPending}
                              style={{ ...confirmDeleteBtn, opacity: isPending ? 0.5 : 1 }}>확인</button>
                            <button onClick={() => setConfirmId(null)} disabled={isPending} style={cancelBtn}>취소</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => openEdit(s)} style={editBtn}>수정</button>
                            <button onClick={() => setConfirmId(s.id)} style={deleteBtn}>삭제</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 날짜 / 장소 / 담당자 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', marginTop: '0.45rem' }}>
                    <Meta icon="📅" value={s.end_date && s.end_date !== s.start_date
                      ? `${formatDate(s.start_date)} ~ ${formatDate(s.end_date)}`
                      : formatDate(s.start_date)} />
                    {s.location  && <Meta icon="📍" value={s.location} />}
                    {s.assignee  && <Meta icon="👤" value={s.assignee} />}
                    {s.user_email && <Meta icon="✍️" value={s.user_email} />}
                  </div>

                  {/* 메모 */}
                  {s.memo && (
                    <p style={{
                      margin: '0.45rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)',
                      lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {s.memo}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 등록/수정 모달 ── */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg, #12172b)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px', padding: '1.8rem',
              width: '100%', maxWidth: '500px',
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 1.4rem', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {editTarget ? '일정 수정' : '일정 등록'}
            </h2>

            {formError && (
              <div className="auth-error" style={{ marginBottom: '1rem' }}>{formError}</div>
            )}

            <Field label="제목 *">
              <input className="auth-input" style={{ marginBottom: 0 }}
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="일정 제목" disabled={isPending} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
              <Field label="시작일 *" mb={0}>
                <input type="date" className="auth-input" style={{ marginBottom: 0 }}
                  value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  disabled={isPending} />
              </Field>
              <Field label="종료일" mb={0}>
                <input type="date" className="auth-input" style={{ marginBottom: 0 }}
                  value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  min={form.start_date} disabled={isPending} />
              </Field>
            </div>

            <Field label="카테고리">
              <select className="auth-input" style={{ marginBottom: 0 }}
                value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                disabled={isPending}>
                <option value="">— 선택 안함 —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <Field label="장소">
              <input className="auth-input" style={{ marginBottom: 0 }}
                value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="행사 장소" disabled={isPending} />
            </Field>

            <Field label="담당자">
              <input className="auth-input" style={{ marginBottom: 0 }}
                value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                placeholder="담당 직원 이름" disabled={isPending} />
            </Field>

            <Field label="메모">
              <textarea className="auth-input" style={{ marginBottom: 0, minHeight: '80px', resize: 'vertical' }}
                value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="상세 내용 또는 비고" disabled={isPending} />
            </Field>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.2rem' }}>
              <button
                onClick={handleSave}
                disabled={isPending}
                style={{ ...saveBtn, opacity: isPending ? 0.6 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}
              >
                {isPending ? '저장 중…' : (editTarget ? '수정 완료' : '등록')}
              </button>
              <button onClick={closeModal} disabled={isPending} style={cancelBtn2}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 헬퍼 컴포넌트 ──────────────────────────────────────────── */
function Meta({ icon, value }: { icon: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
      <span>{icon}</span>{value}
    </span>
  );
}
function Field({ label, children, mb = 0.8 }: { label: string; children: React.ReactNode; mb?: number }) {
  return (
    <div style={{ marginBottom: `${mb}rem` }}>
      <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem', fontWeight: 500 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/* ── 스타일 상수 ─────────────────────────────────────────────── */
const calGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px',
};
const navBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text-primary)', borderRadius: '8px', cursor: 'pointer',
  fontSize: '1.1rem', lineHeight: 1, padding: '0.3rem 0.7rem', fontFamily: 'inherit',
};
const addBtn: React.CSSProperties = {
  background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.35)',
  color: '#93c5fd', borderRadius: '8px', cursor: 'pointer',
  fontSize: '0.83rem', fontWeight: 600, padding: '0.42rem 1rem', fontFamily: 'inherit',
};
const editBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-muted)', borderRadius: '6px', cursor: 'pointer',
  fontSize: '0.73rem', padding: '0.22rem 0.6rem', fontFamily: 'inherit',
};
const deleteBtn: React.CSSProperties = {
  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
  color: '#fca5a5', borderRadius: '6px', cursor: 'pointer',
  fontSize: '0.73rem', padding: '0.22rem 0.6rem', fontFamily: 'inherit',
};
const confirmDeleteBtn: React.CSSProperties = {
  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
  color: '#fca5a5', borderRadius: '6px', cursor: 'pointer',
  fontSize: '0.73rem', padding: '0.22rem 0.6rem', fontFamily: 'inherit',
};
const cancelBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text-muted)', borderRadius: '6px', cursor: 'pointer',
  fontSize: '0.73rem', padding: '0.22rem 0.6rem', fontFamily: 'inherit',
};
const saveBtn: React.CSSProperties = {
  flex: 1, background: 'rgba(79,142,247,0.2)', border: '1px solid rgba(79,142,247,0.4)',
  color: '#93c5fd', borderRadius: '8px', cursor: 'pointer',
  fontSize: '0.88rem', fontWeight: 600, padding: '0.55rem 1rem', fontFamily: 'inherit',
};
const cancelBtn2: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer',
  fontSize: '0.88rem', padding: '0.55rem 1rem', fontFamily: 'inherit',
};
