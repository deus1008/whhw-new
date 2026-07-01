'use client';

import { useState, useTransition } from 'react';
import type { MarketingSchedule } from '@/app/calendar/page';
import {
  createSchedule,
  updateSchedule,
  deleteSchedule,
  createCategory,
  updateCategory,
  deleteCategory,
  swapCategoryOrder,
  type ScheduleInput,
  type ScheduleCategory,
} from '@/app/calendar/actions';

/* ── 색상 헬퍼 ──────────────────────────────────────────────── */
const COLOR_PALETTE = [
  '#a78bfa', '#c084fc', '#f472b6', '#fb7185',
  '#fb923c', '#fbbf24', '#a3e635', '#34d399',
  '#22d3ee', '#60a5fa', '#818cf8', '#4ade80',
  '#f87171', '#38bdf8', '#94a3b8', '#e2e8f0',
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function catColorFromHex(hex: string | null) {
  const c = hex ?? '#94a3b8';
  const [r, g, b] = hexToRgb(c);
  return {
    dot:  c,
    bg:   `rgba(${r},${g},${b},0.15)`,
    text: `#${[r,g,b].map(ch => Math.min(255, Math.round(ch + (255-ch)*0.3)).toString(16).padStart(2,'0')).join('')}`,
  };
}

/* ── 날짜 유틸 ─────────────────────────────────────────────── */
const DAYS_KO   = ['일','월','화','수','목','금','토'];
const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDate(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${y}.${m}.${d}`;
}
function getCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay    = new Date(year, month, 1).getDay();
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
  initialSchedules:  MarketingSchedule[];
  initialCategories: ScheduleCategory[];
  userId:            string;
  isAdmin:           boolean;
}

/* ── 컴포넌트 ───────────────────────────────────────────────── */
export default function MarketingClient({
  initialSchedules, initialCategories, userId, isAdmin,
}: Props) {
  const today = new Date();

  /* ── 일정 상태 ─────────────────────────────────────────── */
  const [schedules, setSchedules] = useState<MarketingSchedule[]>(initialSchedules);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterCat, setFilterCat]  = useState<string | null>(null);
  const [modalOpen, setModalOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState<MarketingSchedule | null>(null);
  const [form, setForm]             = useState<ScheduleInput>(EMPTY);
  const [formError, setFormError]   = useState('');
  const [confirmId, setConfirmId]   = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* ── 카테고리 상태 ─────────────────────────────────────── */
  const [cats, setCats] = useState<ScheduleCategory[]>(initialCategories);
  const [catModalOpen, setCatModalOpen]   = useState(false);
  const [catEditId, setCatEditId]         = useState<string | null>(null); // null = 추가 모드
  const [catForm, setCatForm]             = useState({ name: '', color: COLOR_PALETTE[0] });
  const [catFormOpen, setCatFormOpen]     = useState(false);
  const [catError, setCatError]           = useState('');
  const [catConfirmId, setCatConfirmId]   = useState<string | null>(null);
  const [isPendingCat, startCatTrans]     = useTransition();

  /* ── 카테고리 색상 조회 ──────────────────────────────── */
  function catColor(name: string | null) {
    const found = cats.find(c => c.name === (name ?? ''));
    return catColorFromHex(found?.color ?? '#94a3b8');
  }

  /* ── 달력 계산 ─────────────────────────────────────── */
  const grid     = getCalendarGrid(year, month);
  const todayYMD = toYMD(today);
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  const thirtyDaysLaterYMD = toYMD(thirtyDaysLater);

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthSchedules = schedules.filter(s => s.start_date.startsWith(monthStr));

  const visibleMonthSchedules = filterCat
    ? monthSchedules.filter(s => (s.category ?? '기타') === filterCat)
    : monthSchedules;

  const eventMap: Record<string, MarketingSchedule[]> = {};
  for (const s of visibleMonthSchedules) {
    if (!eventMap[s.start_date]) eventMap[s.start_date] = [];
    eventMap[s.start_date].push(s);
  }

  const listSchedules = (() => {
    let base = selectedDate
      ? schedules.filter(s => s.start_date === selectedDate)
      : schedules.filter(s => s.start_date >= todayYMD && s.start_date <= thirtyDaysLaterYMD);
    if (filterCat) base = base.filter(s => (s.category ?? '기타') === filterCat);
    return base;
  })();

  /* ── 월 이동 ───────────────────────────────────────── */
  function prevMonth() {
    if (month === 0) { setYear(y => y-1); setMonth(11); }
    else setMonth(m => m-1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y+1); setMonth(0); }
    else setMonth(m => m+1);
    setSelectedDate(null);
  }

  /* ── 일정 모달 ─────────────────────────────────────── */
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
  function closeModal() {
    setModalOpen(false); setEditTarget(null); setForm(EMPTY); setFormError('');
  }

  function handleSave() {
    startTransition(async () => {
      setFormError('');
      const result = editTarget
        ? await updateSchedule(editTarget.id, form)
        : await createSchedule(form);
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

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteSchedule(id);
      if (result.error) { alert(result.error); return; }
      setSchedules(prev => prev.filter(s => s.id !== id));
      setConfirmId(null);
    });
  }

  function canEdit(s: MarketingSchedule) { return isAdmin || s.user_id === userId; }

  /* ── 카테고리 관리 모달 ─────────────────────────────── */
  function openCatAdd() {
    setCatEditId(null);
    setCatForm({ name: '', color: COLOR_PALETTE[0] });
    setCatError('');
    setCatFormOpen(true);
  }
  function openCatEdit(cat: ScheduleCategory) {
    setCatEditId(cat.id);
    setCatForm({ name: cat.name, color: cat.color });
    setCatError('');
    setCatFormOpen(true);
  }
  function closeCatForm() {
    setCatFormOpen(false); setCatEditId(null);
    setCatForm({ name: '', color: COLOR_PALETTE[0] }); setCatError('');
  }
  function closeCatModal() {
    setCatModalOpen(false); closeCatForm(); setCatConfirmId(null);
  }

  function handleCatSave() {
    startCatTrans(async () => {
      setCatError('');
      if (catEditId) {
        const result = await updateCategory(catEditId, catForm);
        if (result.error) { setCatError(result.error); return; }
        setCats(prev => prev.map(c => c.id === catEditId ? result.data! : c));
      } else {
        const maxOrder = cats.reduce((m, c) => Math.max(m, c.sort_order), -1);
        const result = await createCategory({ ...catForm, sort_order: maxOrder + 1 });
        if (result.error) { setCatError(result.error); return; }
        setCats(prev => [...prev, result.data!]);
      }
      closeCatForm();
    });
  }

  function handleCatDelete(id: string) {
    startCatTrans(async () => {
      const result = await deleteCategory(id);
      if (result.error) { alert(result.error); return; }
      setCats(prev => prev.filter(c => c.id !== id));
      setCatConfirmId(null);
    });
  }

  function handleCatMove(idx: number, dir: -1 | 1) {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= cats.length) return;
    const a = cats[idx];
    const b = cats[targetIdx];
    // 낙관적 업데이트
    const next = [...cats];
    next[idx] = { ...b, sort_order: a.sort_order };
    next[targetIdx] = { ...a, sort_order: b.sort_order };
    setCats(next.sort((x, y) => x.sort_order - y.sort_order));
    startCatTrans(async () => {
      await swapCategoryOrder(a.id, a.sort_order, b.id, b.sort_order);
    });
  }

  /* ── 렌더 ──────────────────────────────────────────── */
  return (
    <div>
      {/* 제목 + 추가 버튼 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:'0.8rem' }}>
        <h1 style={{ fontSize:'clamp(1.2rem,3vw,1.6rem)', fontWeight:700, color:'var(--text-primary)', margin:0 }}>
          📅 주요 일정
        </h1>
        <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
          {isAdmin && (
            <button onClick={() => setCatModalOpen(true)} style={mgmtBtn}>
              ⚙ 유형 관리
            </button>
          )}
          <button onClick={() => openCreate()} style={addBtn}>+ 일정 등록</button>
        </div>
      </div>

      {/* 캘린더 */}
      <div className="auth-card" style={{ marginBottom:'1.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.2rem' }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <span style={{ fontWeight:700, fontSize:'1.05rem', color:'var(--text-primary)' }}>
            {year}년 {MONTHS_KO[month]}
          </span>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>

        <div style={calGrid}>
          {DAYS_KO.map((d, i) => (
            <div key={d} style={{ textAlign:'center', fontSize:'0.72rem', fontWeight:600,
              color: i===0 ? '#fca5a5' : i===6 ? '#93c5fd' : 'var(--text-muted)',
              paddingBottom:'0.5rem' }}>
              {d}
            </div>
          ))}
        </div>

        <div style={calGrid}>
          {grid.map((day, idx) => {
            if (!day) return <div key={`pad-${idx}`} />;
            const ymd    = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const isToday = ymd === todayYMD;
            const isSel   = ymd === selectedDate;
            const events  = eventMap[ymd] ?? [];
            const dow     = idx % 7;
            return (
              <div key={ymd} onClick={() => setSelectedDate(isSel ? null : ymd)} style={{
                borderRadius:'8px', padding:'0.3rem 0.2rem', cursor:'pointer', minHeight:'52px',
                background: isSel ? 'rgba(79,142,247,0.18)' : isToday ? 'rgba(255,255,255,0.05)' : 'transparent',
                border: isSel ? '1px solid rgba(79,142,247,0.5)' : isToday ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                transition:'background 0.12s',
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isToday ? 'rgba(255,255,255,0.05)' : 'transparent'; }}
              >
                <div style={{ textAlign:'center', fontSize:'0.78rem', fontWeight: isToday ? 700 : 400,
                  color: isToday ? '#93c5fd' : dow===0 ? '#fca5a5' : dow===6 ? '#93c5fd' : 'var(--text-primary)',
                  marginBottom:'0.2rem' }}>
                  {day}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'2px', justifyContent:'center' }}>
                  {events.slice(0,3).map(e => (
                    <span key={e.id} style={{ width:'5px', height:'5px', borderRadius:'50%',
                      background: catColor(e.category).dot, flexShrink:0 }} />
                  ))}
                  {events.length > 3 && (
                    <span style={{ fontSize:'0.55rem', color:'var(--text-muted)', lineHeight:1 }}>+{events.length-3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 카테고리 필터 */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem', marginTop:'1rem', paddingTop:'0.8rem', borderTop:'1px solid rgba(255,255,255,0.06)', alignItems:'center' }}>
          {cats.map(cat => {
            const active = filterCat === cat.name;
            const cc = catColorFromHex(cat.color);
            return (
              <button key={cat.id} onClick={() => setFilterCat(active ? null : cat.name)} style={{
                display:'inline-flex', alignItems:'center', gap:'4px',
                fontSize:'0.72rem', cursor:'pointer', fontFamily:'inherit',
                padding:'0.18rem 0.55rem', borderRadius:'100px',
                background: active ? cc.bg : 'transparent',
                border: active ? `1px solid ${cat.color}55` : '1px solid rgba(255,255,255,0.1)',
                color: active ? cc.text : 'var(--text-muted)',
                transition:'all 0.15s',
              }}>
                <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:cat.color, flexShrink:0, opacity: active ? 1 : 0.6 }} />
                {cat.name}
              </button>
            );
          })}
          {filterCat && (
            <button onClick={() => setFilterCat(null)} style={{
              fontSize:'0.68rem', cursor:'pointer', fontFamily:'inherit',
              padding:'0.18rem 0.5rem', borderRadius:'100px',
              background:'transparent', border:'1px solid rgba(255,255,255,0.1)',
              color:'rgba(255,255,255,0.3)',
            }}>✕ 전체</button>
          )}
        </div>
      </div>

      {/* 일정 목록 */}
      <div className="auth-card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
          <h2 style={{ fontSize:'0.95rem', fontWeight:700, color:'var(--text-primary)', margin:0, display:'flex', alignItems:'center', flexWrap:'wrap', gap:'0.4rem' }}>
            {selectedDate ? `${formatDate(selectedDate)} 일정` : `오늘부터 1개월 (${formatDate(todayYMD)} ~ ${formatDate(thirtyDaysLaterYMD)})`}
            {filterCat && (
              <span style={{ fontSize:'0.72rem', fontWeight:600, padding:'1px 8px', borderRadius:'100px',
                background: catColor(filterCat).bg, color: catColor(filterCat).text }}>
                {filterCat}
              </span>
            )}
            <span style={{ background:'rgba(79,142,247,0.12)', border:'1px solid rgba(79,142,247,0.25)',
              borderRadius:'100px', padding:'2px 10px', fontSize:'0.72rem', fontWeight:600, color:'#93c5fd' }}>
              {listSchedules.length}
            </span>
          </h2>
          {selectedDate && (
            <button onClick={() => openCreate(selectedDate)} style={{ ...addBtn, fontSize:'0.75rem', padding:'0.3rem 0.8rem' }}>
              + 이 날 등록
            </button>
          )}
        </div>

        {listSchedules.length === 0 ? (
          <p style={{ color:'var(--text-muted)', fontSize:'0.85rem', textAlign:'center', padding:'2rem 0' }}>
            {selectedDate ? '이 날 등록된 일정이 없습니다.' : '향후 30일간 등록된 일정이 없습니다.'}
          </p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
            {listSchedules.map(s => {
              const cc      = catColor(s.category);
              const isConf  = confirmId === s.id;
              const editable = canEdit(s);
              return (
                <div key={s.id} style={{ borderRadius:'10px', background:'rgba(255,255,255,0.03)',
                  border:'1px solid rgba(255,255,255,0.07)', padding:'0.75rem 1rem' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'0.8rem', flexWrap:'wrap' }}>
                    {s.category && (
                      <span style={{ fontSize:'0.68rem', fontWeight:600, padding:'2px 8px',
                        borderRadius:'100px', background:cc.bg, color:cc.text,
                        whiteSpace:'nowrap', flexShrink:0, marginTop:'2px' }}>
                        {s.category}
                      </span>
                    )}
                    <span style={{ flex:1, fontSize:'0.9rem', fontWeight:600, color:'var(--text-primary)', wordBreak:'break-word' }}>
                      {s.title}
                    </span>
                    {editable && (
                      <div style={{ display:'flex', gap:'0.35rem', flexShrink:0 }}>
                        {isConf ? (
                          <>
                            <span style={{ fontSize:'0.73rem', color:'var(--text-muted)', alignSelf:'center' }}>삭제?</span>
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
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.8rem', marginTop:'0.45rem' }}>
                    <Meta icon="📅" value={s.end_date && s.end_date !== s.start_date
                      ? `${formatDate(s.start_date)} ~ ${formatDate(s.end_date)}`
                      : formatDate(s.start_date)} />
                    {s.location  && <Meta icon="📍" value={s.location} />}
                    {s.assignee  && <Meta icon="👤" value={s.assignee} />}
                    {s.author_name && <Meta icon="✍️" value={s.author_name} />}
                  </div>
                  {s.memo && (
                    <p style={{ margin:'0.45rem 0 0', fontSize:'0.78rem', color:'var(--text-muted)',
                      lineHeight:1.6, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                      {s.memo}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 일정 등록/수정 모달 ── */}
      {modalOpen && (
        <div onClick={closeModal} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={modalBox}>
            <h2 style={{ margin:'0 0 1.4rem', fontSize:'1.05rem', fontWeight:700, color:'var(--text-primary)' }}>
              {editTarget ? '일정 수정' : '일정 등록'}
            </h2>
            {formError && <div className="auth-error" style={{ marginBottom:'1rem' }}>{formError}</div>}

            <Field label="제목 *">
              <input className="auth-input" style={{ marginBottom:0 }}
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="일정 제목" disabled={isPending} />
            </Field>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.8rem', marginBottom:'0.8rem' }}>
              <Field label="시작일 *" mb={0}>
                <input type="date" className="auth-input" style={{ marginBottom:0 }}
                  value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  disabled={isPending} />
              </Field>
              <Field label="종료일" mb={0}>
                <input type="date" className="auth-input" style={{ marginBottom:0 }}
                  value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  min={form.start_date} disabled={isPending} />
              </Field>
            </div>

            <Field label="카테고리">
              <select className="auth-input" style={{ marginBottom:0, background:'#1e293b' }}
                value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                disabled={isPending}>
                <option value="" style={{ background:'#1e293b', color:'#e2e8f0' }}>— 선택 안함 —</option>
                {cats.map(c => (
                  <option key={c.id} value={c.name} style={{ background:'#1e293b', color:'#e2e8f0' }}>{c.name}</option>
                ))}
              </select>
            </Field>

            <Field label="장소">
              <input className="auth-input" style={{ marginBottom:0 }}
                value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="행사 장소" disabled={isPending} />
            </Field>

            <Field label="담당자">
              <input className="auth-input" style={{ marginBottom:0 }}
                value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                placeholder="담당 직원 이름" disabled={isPending} />
            </Field>

            <Field label="메모">
              <textarea className="auth-input" style={{ marginBottom:0, minHeight:'80px', resize:'vertical' }}
                value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                placeholder="상세 내용 또는 비고" disabled={isPending} />
            </Field>

            <div style={{ display:'flex', gap:'0.6rem', marginTop:'1.2rem' }}>
              <button onClick={handleSave} disabled={isPending}
                style={{ ...saveBtn, opacity: isPending ? 0.6 : 1, cursor: isPending ? 'not-allowed' : 'pointer' }}>
                {isPending ? '저장 중…' : (editTarget ? '수정 완료' : '등록')}
              </button>
              <button onClick={closeModal} disabled={isPending} style={cancelBtn2}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 카테고리 관리 모달 ── */}
      {catModalOpen && (
        <div onClick={closeCatModal} style={overlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalBox, maxWidth:'460px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.2rem' }}>
              <h2 style={{ margin:0, fontSize:'1.05rem', fontWeight:700, color:'var(--text-primary)' }}>
                일정 유형 관리
              </h2>
              <button onClick={closeCatModal} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1.1rem', lineHeight:1, padding:'2px 6px', fontFamily:'inherit' }}>✕</button>
            </div>

            {/* 카테고리 목록 */}
            <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', marginBottom:'1rem' }}>
              {cats.map((cat, idx) => {
                const isDelConf = catConfirmId === cat.id;
                return (
                  <div key={cat.id} style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                    padding:'0.5rem 0.7rem', borderRadius:'8px',
                    background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                    <span style={{ width:'10px', height:'10px', borderRadius:'50%', background:cat.color, flexShrink:0 }} />
                    <span style={{ flex:1, fontSize:'0.87rem', color:'var(--text-primary)' }}>{cat.name}</span>

                    {isDelConf ? (
                      <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                        <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>삭제?</span>
                        <button onClick={() => handleCatDelete(cat.id)} disabled={isPendingCat}
                          style={{ ...confirmDeleteBtn, opacity: isPendingCat ? 0.5 : 1 }}>확인</button>
                        <button onClick={() => setCatConfirmId(null)} style={cancelBtn}>취소</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', gap:'0.25rem' }}>
                        <button onClick={() => handleCatMove(idx, -1)} disabled={idx === 0 || isPendingCat}
                          style={{ ...arrowBtn, opacity: idx === 0 ? 0.25 : 1 }}>↑</button>
                        <button onClick={() => handleCatMove(idx, 1)} disabled={idx === cats.length-1 || isPendingCat}
                          style={{ ...arrowBtn, opacity: idx === cats.length-1 ? 0.25 : 1 }}>↓</button>
                        <button onClick={() => openCatEdit(cat)} style={editBtn}>수정</button>
                        <button onClick={() => { setCatConfirmId(cat.id); setCatFormOpen(false); }} style={deleteBtn}>삭제</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 추가 버튼 */}
            {!catFormOpen && (
              <button onClick={openCatAdd} style={{ width:'100%', padding:'0.45rem', borderRadius:'8px',
                background:'rgba(79,142,247,0.08)', border:'1px dashed rgba(79,142,247,0.3)',
                color:'#93c5fd', cursor:'pointer', fontSize:'0.83rem', fontFamily:'inherit' }}>
                + 유형 추가
              </button>
            )}

            {/* 추가/수정 폼 */}
            {catFormOpen && (
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:'1rem' }}>
                <p style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-muted)', margin:'0 0 0.6rem' }}>
                  {catEditId ? '유형 수정' : '새 유형 추가'}
                </p>
                {catError && <div className="auth-error" style={{ marginBottom:'0.6rem', fontSize:'0.8rem' }}>{catError}</div>}

                <Field label="이름" mb={0.6}>
                  <input className="auth-input" style={{ marginBottom:0 }}
                    value={catForm.name}
                    onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="유형 이름" disabled={isPendingCat}
                    onKeyDown={e => { if (e.key === 'Enter') handleCatSave(); }} />
                </Field>

                <Field label="색상" mb={0.8}>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginTop:'0.2rem' }}>
                    {COLOR_PALETTE.map(color => (
                      <button
                        key={color}
                        onClick={() => setCatForm(f => ({ ...f, color }))}
                        style={{
                          width:'24px', height:'24px', borderRadius:'50%',
                          background: color, border: catForm.color === color
                            ? '2px solid #fff' : '2px solid transparent',
                          cursor:'pointer', padding:0, flexShrink:0,
                          boxShadow: catForm.color === color ? `0 0 0 2px ${color}88` : 'none',
                        }}
                      />
                    ))}
                    {/* 직접 입력 */}
                    <input
                      type="color"
                      value={catForm.color}
                      onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))}
                      title="직접 선택"
                      style={{ width:'24px', height:'24px', borderRadius:'50%', border:'2px solid rgba(255,255,255,0.15)',
                        cursor:'pointer', padding:'1px', background:'transparent' }}
                    />
                  </div>
                </Field>

                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button onClick={handleCatSave} disabled={isPendingCat}
                    style={{ ...saveBtn, flex:'none', padding:'0.4rem 1.2rem', fontSize:'0.83rem',
                      opacity: isPendingCat ? 0.6 : 1 }}>
                    {isPendingCat ? '저장 중…' : '저장'}
                  </button>
                  <button onClick={closeCatForm} style={{ ...cancelBtn2, padding:'0.4rem 0.9rem', fontSize:'0.83rem' }}>
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 헬퍼 컴포넌트 ──────────────────────────────────────────── */
function Meta({ icon, value }: { icon: string; value: string }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'3px', fontSize:'0.75rem', color:'var(--text-muted)' }}>
      <span>{icon}</span>{value}
    </span>
  );
}
function Field({ label, children, mb = 0.8 }: { label: string; children: React.ReactNode; mb?: number }) {
  return (
    <div style={{ marginBottom:`${mb}rem` }}>
      <label style={{ display:'block', fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:'0.3rem', fontWeight:500 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/* ── 스타일 ─────────────────────────────────────────────────── */
const calGrid: React.CSSProperties = {
  display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'2px',
};
const overlay: React.CSSProperties = {
  position:'fixed', inset:0, zIndex:50,
  background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)',
  display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem',
};
const modalBox: React.CSSProperties = {
  background:'var(--card-bg, #12172b)', border:'1px solid rgba(255,255,255,0.1)',
  borderRadius:'16px', padding:'1.8rem', width:'100%', maxWidth:'500px',
  maxHeight:'90vh', overflowY:'auto',
};
const navBtn: React.CSSProperties = {
  background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)',
  color:'var(--text-primary)', borderRadius:'8px', cursor:'pointer',
  fontSize:'1.1rem', lineHeight:1, padding:'0.3rem 0.7rem', fontFamily:'inherit',
};
const addBtn: React.CSSProperties = {
  background:'rgba(79,142,247,0.15)', border:'1px solid rgba(79,142,247,0.35)',
  color:'#93c5fd', borderRadius:'8px', cursor:'pointer',
  fontSize:'0.83rem', fontWeight:600, padding:'0.42rem 1rem', fontFamily:'inherit',
};
const mgmtBtn: React.CSSProperties = {
  background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)',
  color:'var(--text-muted)', borderRadius:'8px', cursor:'pointer',
  fontSize:'0.83rem', fontWeight:500, padding:'0.42rem 1rem', fontFamily:'inherit',
};
const editBtn: React.CSSProperties = {
  background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)',
  color:'var(--text-muted)', borderRadius:'6px', cursor:'pointer',
  fontSize:'0.73rem', padding:'0.22rem 0.6rem', fontFamily:'inherit',
};
const deleteBtn: React.CSSProperties = {
  background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
  color:'#fca5a5', borderRadius:'6px', cursor:'pointer',
  fontSize:'0.73rem', padding:'0.22rem 0.6rem', fontFamily:'inherit',
};
const confirmDeleteBtn: React.CSSProperties = {
  background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.35)',
  color:'#fca5a5', borderRadius:'6px', cursor:'pointer',
  fontSize:'0.73rem', padding:'0.22rem 0.6rem', fontFamily:'inherit',
};
const cancelBtn: React.CSSProperties = {
  background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
  color:'var(--text-muted)', borderRadius:'6px', cursor:'pointer',
  fontSize:'0.73rem', padding:'0.22rem 0.6rem', fontFamily:'inherit',
};
const saveBtn: React.CSSProperties = {
  flex:1, background:'rgba(79,142,247,0.2)', border:'1px solid rgba(79,142,247,0.4)',
  color:'#93c5fd', borderRadius:'8px', cursor:'pointer',
  fontSize:'0.88rem', fontWeight:600, padding:'0.55rem 1rem', fontFamily:'inherit',
};
const cancelBtn2: React.CSSProperties = {
  background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
  color:'var(--text-muted)', borderRadius:'8px', cursor:'pointer',
  fontSize:'0.88rem', padding:'0.55rem 1rem', fontFamily:'inherit',
};
const arrowBtn: React.CSSProperties = {
  background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)',
  color:'var(--text-muted)', borderRadius:'5px', cursor:'pointer',
  fontSize:'0.7rem', padding:'0.18rem 0.45rem', fontFamily:'inherit', lineHeight:1,
};
