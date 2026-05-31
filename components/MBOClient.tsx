'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import type { MboTarget, Member } from '@/app/mbo/actions';
import {
  getMboTargets,
  createMboTarget,
  updateMboTarget,
  deleteMboTarget,
  updateMboActual,
  reorderMboTargets,
} from '@/app/mbo/actions';

const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const CUR_YEAR = new Date().getFullYear();
const CUR_MONTH = new Date().getMonth() + 1;

/* ── 달성률 색상 ── */
function rateColor(rate: number) {
  if (rate >= 100) return '#34d399';  // 초과달성 — 에메랄드
  if (rate >= 80)  return '#60a5fa';  // 순조 — 블루
  if (rate >= 50)  return '#fbbf24';  // 주의 — 노랑
  return '#f87171';                   // 미흡 — 빨강
}

function rateLabel(rate: number) {
  if (rate >= 100) return '달성';
  if (rate >= 80)  return '순조';
  if (rate >= 50)  return '주의';
  return '미흡';
}

/* 숫자이면 세자리 콤마, 텍스트면 그대로 */
function fmtVal(v: string): string {
  const n = Number(v);
  if (v !== '' && !isNaN(n)) return n.toLocaleString();
  return v || '-';
}

/* 달성률 계산 — 숫자일 때만, 텍스트면 null */
function calcRate(actual: string, target: string): number | null {
  const t = Number(target);
  const a = Number(actual);
  if (target === '' || isNaN(t) || t === 0) return null;
  if (actual === '' || isNaN(a)) return null;
  return Math.round((a / t) * 100);
}

/* ── 연도 옵션 ── */
const YEARS = [CUR_YEAR - 1, CUR_YEAR, CUR_YEAR + 1];

/* ════════════════════════════════════════════
   메인 컴포넌트
════════════════════════════════════════════ */
export default function MBOClient({
  isAdmin,
  currentUserId,
  currentUserEmail,
  members,
}: {
  isAdmin:           boolean;
  currentUserId:     string;
  currentUserEmail:  string;
  members:           Member[];
}) {
  const [year,       setYear]       = useState(CUR_YEAR);
  const [periodType, setPeriodType] = useState<'annual' | 'monthly'>('annual');
  const [month,      setMonth]      = useState(CUR_MONTH);
  const [selectedId, setSelectedId] = useState(currentUserId);   // 지역장 ID
  const [targets,    setTargets]    = useState<MboTarget[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [toast,      setToast]      = useState('');
  const [, startReorder]            = useTransition();

  const effectiveMonth = periodType === 'annual' ? null : month;

  /* ── 데이터 로드 ── */
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMboTargets(selectedId, year, effectiveMonth);
      setTargets(data);
    } catch (e) {
      console.error('[MBO] reload error:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedId, year, effectiveMonth]);

  useEffect(() => { reload(); }, [reload]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  /* ── 행 순서 이동 (낙관적 업데이트) ── */
  function handleMove(fromIdx: number, toIdx: number) {
    const prev = targets;                       // 롤백용 스냅샷
    const next = [...targets];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setTargets(next);                           // 즉시 화면 반영

    startReorder(async () => {
      try {
        const items = next.map((t, i) => ({ id: t.id, sort_order: i }));
        const res = await reorderMboTargets(items);
        if (res.error) {
          setTargets(prev);                     // 실패 시 롤백
          showToast('⚠ ' + res.error);
        }
      } catch {
        setTargets(prev);
        showToast('⚠ 순서 변경 중 오류가 발생했습니다.');
      }
    });
  }

  /* ── 연간 요약: 월별 항목 합산 ── */
  const selectedEmail = members.find(m => m.id === selectedId)?.email ?? currentUserEmail;

  /* ── 달성률 전체 평균 (숫자 항목만) ── */
  const numericTargets = targets.filter(t => calcRate(t.actual_value, t.target_value) !== null);
  const avgRate = numericTargets.length === 0 ? null : Math.round(
    numericTargets.reduce((sum, t) => sum + calcRate(t.actual_value, t.target_value)!, 0)
    / numericTargets.length
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* ── 헤더 카드 ── */}
      <div style={cardStyle}>
        {/* 타이틀 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              🎯 MBO
            </h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.18rem' }}>
              목표관리 (Management by Objectives)
            </p>
          </div>
          {targets.length > 0 && avgRate !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.45rem 1rem', borderRadius: 10,
              background: `rgba(${avgRate >= 100 ? '52,211,153' : avgRate >= 80 ? '96,165,250' : avgRate >= 50 ? '251,191,36' : '248,113,113'},0.12)`,
              border: `1px solid rgba(${avgRate >= 100 ? '52,211,153' : avgRate >= 80 ? '96,165,250' : avgRate >= 50 ? '251,191,36' : '248,113,113'},0.3)`,
            }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: rateColor(avgRate) }}>
                종합 달성률 {avgRate}%
              </span>
              <span style={{
                fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.38rem', borderRadius: 4,
                background: `rgba(${avgRate >= 100 ? '52,211,153' : avgRate >= 80 ? '96,165,250' : avgRate >= 50 ? '251,191,36' : '248,113,113'},0.2)`,
                color: rateColor(avgRate),
              }}>
                {rateLabel(avgRate)}
              </span>
            </div>
          )}
        </div>

        {/* 컨트롤 행 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          {/* 지역장 선택 (admin) */}
          {isAdmin && (
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              style={selectStyle}
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.email}</option>
              ))}
            </select>
          )}

          {/* 연도 */}
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
            {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>

          {/* 연간 / 월별 탭 */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            {(['annual', 'monthly'] as const).map(pt => (
              <button
                key={pt}
                onClick={() => setPeriodType(pt)}
                style={{
                  padding: '0.38rem 0.9rem', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                  background: periodType === pt ? 'rgba(99,102,241,0.25)' : 'transparent',
                  color: periodType === pt ? '#a5b4fc' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {pt === 'annual' ? '연간' : '월별'}
              </button>
            ))}
          </div>

          {/* 월 선택 (월별 탭) */}
          {periodType === 'monthly' && (
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
              {MONTH_NAMES.map((nm, i) => (
                <option key={i + 1} value={i + 1}>{nm}</option>
              ))}
            </select>
          )}
        </div>

        {/* 선택된 멤버 표시 */}
        {isAdmin && (
          <p style={{ fontSize: '0.73rem', color: 'rgba(165,180,252,0.7)', marginTop: '0.7rem', marginBottom: 0 }}>
            📋 {selectedEmail} · {year}년 {periodType === 'annual' ? '연간 목표' : `${month}월 목표`}
          </p>
        )}
      </div>

      {/* ── 목표 테이블 ── */}
      <div style={cardStyle}>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
            ⏳ 불러오는 중…
          </p>
        ) : targets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <p style={{ fontSize: '1.8rem', marginBottom: '0.6rem' }}>🎯</p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              설정된 목표가 없습니다.
            </p>
            {isAdmin && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', opacity: 0.7 }}>
                아래 &ldquo;+ 목표 추가&rdquo; 버튼으로 목표를 입력하세요.
              </p>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['목표 항목', '단위', '목표', '실적', '달성률', '진행', ...(isAdmin ? ['순서', '관리'] : [])].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {targets.map((t, i) => (
                  <TargetRow
                    key={t.id}
                    target={t}
                    isAdmin={isAdmin}
                    isOdd={i % 2 === 1}
                    isFirst={i === 0}
                    isLast={i === targets.length - 1}
                    onMoveUp={i === 0 ? undefined : () => handleMove(i, i - 1)}
                    onMoveDown={i === targets.length - 1 ? undefined : () => handleMove(i, i + 1)}
                    onUpdated={reload}
                    onToast={showToast}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 목표 추가 폼 (admin) ── */}
      {isAdmin && (
        <AddTargetForm
          userId={selectedId}
          year={year}
          month={effectiveMonth}
          currentCount={targets.length}
          onAdded={reload}
          onToast={showToast}
        />
      )}

      {/* ── 토스트 ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          padding: '0.65rem 1.4rem', borderRadius: 10, zIndex: 9999,
          background: 'rgba(30,30,50,0.95)', border: '1px solid rgba(99,102,241,0.4)',
          color: '#a5b4fc', fontSize: '0.85rem', fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   목표 행 (수정 + 실적 입력 인라인)
════════════════════════════════════════════ */
function TargetRow({
  target, isAdmin, isOdd, isFirst, isLast, onMoveUp, onMoveDown, onUpdated, onToast,
}: {
  target:      MboTarget;
  isAdmin:     boolean;
  isOdd:       boolean;
  isFirst:     boolean;
  isLast:      boolean;
  onMoveUp?:   () => void;
  onMoveDown?: () => void;
  onUpdated:   () => void;
  onToast:     (msg: string) => void;
}) {
  const [editMode,    setEditMode]    = useState(false);
  const [actualMode,  setActualMode]  = useState(false);
  const [isPending,   startTransition] = useTransition();

  // 목표 편집 상태
  const [editName,   setEditName]   = useState(target.item_name);
  const [editTarget, setEditTarget] = useState(target.target_value);
  const [editUnit,   setEditUnit]   = useState(target.unit);

  // 실적 입력 상태
  const [actualVal,  setActualVal]  = useState(target.actual_value);
  const [actualNote, setActualNote] = useState(target.note ?? '');

  const rate = calcRate(target.actual_value, target.target_value);

  function handleSaveEdit() {
    startTransition(async () => {
      try {
        const res = await updateMboTarget(target.id, {
          item_name:    editName.trim(),
          target_value: editTarget.trim(),
          unit:         editUnit.trim(),
        });
        if (res.error) { onToast('⚠ ' + res.error); return; }
        onToast('✓ 목표가 수정되었습니다.');
        setEditMode(false);
        onUpdated();
      } catch (e) {
        onToast('⚠ 수정 중 오류가 발생했습니다.');
        console.error('[MBO] handleSaveEdit error:', e);
      }
    });
  }

  function handleDelete() {
    if (!confirm(`"${target.item_name}" 목표를 삭제할까요?`)) return;
    startTransition(async () => {
      try {
        const res = await deleteMboTarget(target.id);
        if (res.error) { onToast('⚠ ' + res.error); return; }
        onToast('✓ 삭제되었습니다.');
        onUpdated();
      } catch (e) {
        onToast('⚠ 삭제 중 오류가 발생했습니다.');
        console.error('[MBO] handleDelete error:', e);
      }
    });
  }

  function handleSaveActual() {
    startTransition(async () => {
      try {
        const res = await updateMboActual(target.id, actualVal.trim(), actualNote);
        if (res.error) { onToast('⚠ ' + res.error); return; }
        onToast('✓ 실적이 저장되었습니다.');
        setActualMode(false);
        onUpdated();
      } catch (e) {
        onToast('⚠ 실적 저장 중 오류가 발생했습니다.');
        console.error('[MBO] handleSaveActual error:', e);
      }
    });
  }

  const rowBg = isOdd ? 'rgba(255,255,255,0.015)' : 'transparent';

  if (editMode && isAdmin) {
    return (
      <tr style={{ background: 'rgba(99,102,241,0.07)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <td style={tdStyle}>
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            style={inlineInputStyle}
            placeholder="항목명"
          />
        </td>
        <td style={tdStyle}>
          <input
            value={editUnit}
            onChange={e => setEditUnit(e.target.value)}
            style={{ ...inlineInputStyle, width: 52 }}
            placeholder="단위"
          />
        </td>
        <td style={tdStyle}>
          <input
            value={editTarget}
            onChange={e => setEditTarget(e.target.value)}
            style={{ ...inlineInputStyle, width: 110 }}
            placeholder="목표값"
          />
        </td>
        <td colSpan={4} style={tdStyle}></td>
        <td style={tdStyle}>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button onClick={handleSaveEdit} disabled={isPending} style={btnSm('primary')}>저장</button>
            <button onClick={() => setEditMode(false)} style={btnSm('muted')}>취소</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr style={{ background: rowBg, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
          {target.item_name}
        </td>
        <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '0.76rem' }}>
          {target.unit || '-'}
        </td>
        <td style={tdStyle}>
          {fmtVal(target.target_value)}
        </td>
        <td style={{ ...tdStyle }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ fontWeight: 600, color: rate !== null ? rateColor(rate) : 'var(--text-primary)' }}>
              {fmtVal(target.actual_value)}
            </span>
            <button
              onClick={() => { setActualVal(String(target.actual_value)); setActualNote(target.note ?? ''); setActualMode(true); }}
              title="실적 입력"
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '0.65rem',
              }}
            >✏</button>
          </div>
          {target.note && (
            <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)', margin: '0.1rem 0 0', opacity: 0.7 }}>
              {target.note}
            </p>
          )}
        </td>
        <td style={tdStyle}>
          {rate !== null ? (
            <>
              <span style={{ fontWeight: 700, color: rateColor(rate), fontSize: '0.88rem' }}>
                {rate}%
              </span>
              <span style={{
                marginLeft: '0.35rem', fontSize: '0.65rem', padding: '0.08rem 0.35rem', borderRadius: 4,
                background: `rgba(${rate >= 100 ? '52,211,153' : rate >= 80 ? '96,165,250' : rate >= 50 ? '251,191,36' : '248,113,113'},0.15)`,
                color: rateColor(rate),
              }}>
                {rateLabel(rate)}
              </span>
            </>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>-</span>
          )}
        </td>
        <td style={{ ...tdStyle, minWidth: 100 }}>
          {rate !== null ? (
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.min(rate, 100)}%`,
                background: rateColor(rate), borderRadius: 4, transition: 'width 0.4s ease',
              }} />
            </div>
          ) : (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.5 }}>텍스트 목표</span>
          )}
        </td>
        {isAdmin && (
          <>
            {/* 순서 이동 버튼 */}
            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <button
                  onClick={onMoveUp}
                  disabled={isFirst || isPending}
                  title="위로"
                  style={{
                    ...btnSm('muted'),
                    padding: '0.2rem 0.5rem',
                    opacity: isFirst ? 0.25 : 1,
                    lineHeight: 1,
                  }}
                >▲</button>
                <button
                  onClick={onMoveDown}
                  disabled={isLast || isPending}
                  title="아래로"
                  style={{
                    ...btnSm('muted'),
                    padding: '0.2rem 0.5rem',
                    opacity: isLast ? 0.25 : 1,
                    lineHeight: 1,
                  }}
                >▼</button>
              </div>
            </td>
            {/* 수정·삭제 */}
            <td style={tdStyle}>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button onClick={() => setEditMode(true)} style={btnSm('muted')}>수정</button>
                <button onClick={handleDelete} disabled={isPending} style={btnSm('danger')}>삭제</button>
              </div>
            </td>
          </>
        )}
      </tr>

      {/* 실적 입력 인라인 행 */}
      {actualMode && (
        <tr style={{ background: 'rgba(52,211,153,0.04)', borderTop: '1px solid rgba(52,211,153,0.1)' }}>
          <td colSpan={isAdmin ? 8 : 6} style={{ padding: '0.6rem 0.7rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                📝 실적 입력 — {target.item_name}
              </span>
              <input
                value={actualVal}
                onChange={e => setActualVal(e.target.value)}
                style={{ ...inlineInputStyle, width: 120 }}
                placeholder={`실적값 (${target.unit || '숫자·텍스트'})`}
              />
              <input
                value={actualNote}
                onChange={e => setActualNote(e.target.value)}
                style={{ ...inlineInputStyle, flex: 1, minWidth: 160 }}
                placeholder="비고 (선택)"
              />
              <button onClick={handleSaveActual} disabled={isPending} style={btnSm('primary')}>저장</button>
              <button onClick={() => setActualMode(false)} style={btnSm('muted')}>취소</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   목표 추가 폼 (admin)
════════════════════════════════════════════ */
function AddTargetForm({
  userId, year, month, currentCount, onAdded, onToast,
}: {
  userId:       string;
  year:         number;
  month:        number | null;
  currentCount: number;
  onAdded:      () => void;
  onToast:      (msg: string) => void;
}) {
  const [open,      setOpen]      = useState(false);
  const [itemName,  setItemName]  = useState('');
  const [targetVal, setTargetVal] = useState('');
  const [unit,      setUnit]      = useState('');
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!itemName.trim()) { onToast('⚠ 항목명을 입력하세요.'); return; }
    if (!targetVal.trim()) { onToast('⚠ 목표값을 입력하세요.'); return; }

    startTransition(async () => {
      const res = await createMboTarget({
        user_id:      userId,
        year,
        month,
        item_name:    itemName.trim(),
        target_value: targetVal.trim(),
        unit:         unit.trim(),
        sort_order:   currentCount,
      });
      if (res.error) { onToast('⚠ ' + res.error); return; }
      onToast('✓ 목표가 추가되었습니다.');
      setItemName(''); setTargetVal(''); setUnit('');
      setOpen(false);
      onAdded();
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.65rem 1.2rem', borderRadius: 10, cursor: 'pointer',
        background: 'rgba(99,102,241,0.12)', border: '1px dashed rgba(99,102,241,0.4)',
        color: '#a5b4fc', fontSize: '0.85rem', fontWeight: 600,
        fontFamily: 'inherit', width: '100%', justifyContent: 'center',
      }}>
        + 목표 추가
      </button>
    );
  }

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a5b4fc', marginBottom: '0.8rem' }}>
        + 새 목표 항목
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 2, minWidth: 160 }}>
          <label style={labelStyle}>항목명 *</label>
          <input
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            placeholder="예: 방문건수, 신규거래처, 매출액"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: 110 }}>
          <label style={labelStyle}>목표값 *</label>
          <input
            value={targetVal}
            onChange={e => setTargetVal(e.target.value)}
            placeholder="숫자 또는 텍스트"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: 80 }}>
          <label style={labelStyle}>단위</label>
          <input
            value={unit}
            onChange={e => setUnit(e.target.value)}
            placeholder="건/원/%"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', paddingBottom: '1px' }}>
          <button onClick={handleAdd} disabled={isPending} style={{
            padding: '0.5rem 1.2rem', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(99,102,241,0.22)', border: '1px solid rgba(99,102,241,0.4)',
            color: '#a5b4fc', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit',
          }}>
            {isPending ? '저장 중…' : '추가'}
          </button>
          <button onClick={() => setOpen(false)} style={{
            padding: '0.5rem 0.9rem', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit',
          }}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 스타일 상수 ── */
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  padding: '1.2rem 1.4rem',
};

const selectStyle: React.CSSProperties = {
  padding: '0.38rem 0.7rem', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer',
};

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.7rem', textAlign: 'left', fontWeight: 600,
  color: 'var(--text-muted)', fontSize: '0.75rem', letterSpacing: '0.02em',
  borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem',
  color: 'rgba(240,244,255,0.8)',
  verticalAlign: 'middle',
};

const inlineInputStyle: React.CSSProperties = {
  padding: '0.3rem 0.55rem', borderRadius: 6, fontSize: '0.82rem',
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
  color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%',
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: '0.85rem',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)', fontFamily: 'inherit', width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)',
};

function btnSm(variant: 'primary' | 'muted' | 'danger'): React.CSSProperties {
  const map = {
    primary: { bg: 'rgba(99,102,241,0.18)', border: 'rgba(99,102,241,0.4)', color: '#a5b4fc' },
    muted:   { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', color: 'var(--text-muted)' },
    danger:  { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#fca5a5' },
  }[variant];
  return {
    padding: '0.25rem 0.6rem', borderRadius: 6, cursor: 'pointer',
    background: map.bg, border: `1px solid ${map.border}`,
    color: map.color, fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };
}
