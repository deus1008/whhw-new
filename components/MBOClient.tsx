'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import type { MboTarget, Member } from '@/app/mbo/actions';
import {
  getMboTargets,
  getMboStatus,
  setMboStatus,
  getMonthlyActualsByTargets,
  upsertMonthlyEntries,
  createMboTarget,
  updateMboTarget,
  deleteMboTarget,
  updateMboActual,
  reorderMboTargets,
  copyMboTargets,
} from '@/app/mbo/actions';
import type { MonthlyActual } from '@/app/mbo/actions';

/* ── 회계연도(FY) 유틸
   FY2026 = 2026-04-01 ~ 2027-03-31
   FY 월 순서: 1=4월, 2=5월, … 9=12월, 10=1월, 11=2월, 12=3월
─────────────────────────────────────── */
const _CAL_YEAR  = new Date().getFullYear();
const _CAL_MONTH = new Date().getMonth() + 1;
const CUR_FY_YEAR  = _CAL_MONTH >= 4 ? _CAL_YEAR : _CAL_YEAR - 1;
const CUR_FY_MONTH = _CAL_MONTH >= 4 ? _CAL_MONTH - 3 : _CAL_MONTH + 9;

const FY_YEARS = [CUR_FY_YEAR - 1, CUR_FY_YEAR, CUR_FY_YEAR + 1];

// FY월 → 캘린더 {year, month}
function fyToCalendar(fyYear: number, fyMonth: number): { calYear: number; calMonth: number } {
  return fyMonth <= 9
    ? { calYear: fyYear,     calMonth: fyMonth + 3 }
    : { calYear: fyYear + 1, calMonth: fyMonth - 9 };
}

const FY_MONTH_LABEL: Record<number, string> = {
  1:'4월', 2:'5월', 3:'6월', 4:'7월', 5:'8월', 6:'9월',
  7:'10월', 8:'11월', 9:'12월', 10:'1월', 11:'2월', 12:'3월',
};

/* ── 달성률 색상 ── */
function rateColor(rate: number) {
  if (rate >= 95) return '#60a5fa';  // 파랑
  if (rate >= 85) return '#fbbf24';  // 노랑
  return '#f87171';                  // 빨강
}

function rateLabel(rate: number) {
  if (rate >= 95) return '순조';
  if (rate >= 85) return '주의';
  return '미흡';
}

function rateRgb(rate: number) {
  if (rate >= 95) return '96,165,250';
  if (rate >= 85) return '251,191,36';
  return '248,113,113';
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


/* ════════════════════════════════════════════
   메인 컴포넌트
════════════════════════════════════════════ */
export default function MBOClient({
  isAdmin,
  currentUserId,
  currentUserEmail,
  members,
  companyId,
}: {
  isAdmin:           boolean;
  currentUserId:     string;
  currentUserEmail:  string;
  members:           Member[];
  companyId:         string | null;
}) {
  const [fyYear,      setFyYear]     = useState(CUR_FY_YEAR);
  const [selectedId,  setSelectedId] = useState(currentUserId);
  const [targets,     setTargets]    = useState<MboTarget[]>([]);
  const [monthlyMap,  setMonthlyMap] = useState<Record<string, MonthlyActual[]>>({});
  const [statusColor, setStatusColor] = useState<string | null>(null);
  const [loading,     setLoading]    = useState(false);
  const [toast,       setToast]      = useState('');
  const [, startReorder]             = useTransition();
  const [, startStatus]              = useTransition();

  // 항상 연간 뷰 (calMonth = null)
  const calYear          = fyYear;
  const effectiveCalMonth = null;

  /* ── 데이터 로드 ── */
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [data, color] = await Promise.all([
        getMboTargets(selectedId, calYear, effectiveCalMonth, companyId),
        getMboStatus(selectedId, calYear, effectiveCalMonth, companyId),
      ]);
      setTargets(data);
      setStatusColor(color);
      // 월별 실적 사전 로드
      if (data.length > 0) {
        const mmap = await getMonthlyActualsByTargets(data.map(t => t.id));
        setMonthlyMap(mmap);
      } else {
        setMonthlyMap({});
      }
    } catch (e) {
      console.error('[MBO] reload error:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedId, calYear]);

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

  /* ── 현수준 색상 설정 ── */
  function handleSetStatus(color: string) {
    setStatusColor(color);                     // 낙관적 업데이트
    startStatus(async () => {
      try {
        const res = await setMboStatus(selectedId, calYear, effectiveCalMonth, color, companyId);
        if (res.error) showToast('⚠ ' + res.error);
      } catch {
        showToast('⚠ 현수준 저장 중 오류가 발생했습니다.');
      }
    });
  }

  /* ── 연간 요약: 월별 항목 합산 ── */
  const selectedName = members.find(m => m.id === selectedId)?.name ?? currentUserEmail;

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
          <CurrentLevelWidget
            color={statusColor}
            isAdmin={isAdmin}
            onSelect={handleSetStatus}
          />
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
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}

          {/* 회계연도 */}
          <select value={fyYear} onChange={e => setFyYear(Number(e.target.value))} style={selectStyle}>
            {FY_YEARS.map(y => <option key={y} value={y}>FY{y}</option>)}
          </select>

          {/* 목표 복사 (admin, 멤버 2명 이상) */}
          {isAdmin && members.length > 1 && (
            <CopyPanel
              fromUserId={selectedId}
              fromEmail={selectedName}
              fyYear={fyYear}
              members={members}
              companyId={companyId}
              onCopied={(toId) => { setSelectedId(toId); reload(); }}
              onToast={showToast}
            />
          )}
        </div>

        {/* 선택된 멤버 표시 */}
        {isAdmin && (
          <p style={{ fontSize: '0.73rem', color: 'rgba(165,180,252,0.7)', marginTop: '0.7rem', marginBottom: 0 }}>
            📋 {selectedName} · FY{fyYear} ({fyYear}.04 ~ {fyYear + 1}.03)
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
                    isAnnual={true}
                    monthlyActuals={monthlyMap[t.id] ?? []}
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
          year={calYear}
          month={null}
          fyYear={fyYear}
          fyMonth={null}
          currentCount={targets.length}
          companyId={companyId}
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
  target, isAdmin, isOdd, isFirst, isLast,
  isAnnual, monthlyActuals,
  onMoveUp, onMoveDown, onUpdated, onToast,
}: {
  target:          MboTarget;
  isAdmin:         boolean;
  isOdd:           boolean;
  isFirst:         boolean;
  isLast:          boolean;
  isAnnual:        boolean;
  monthlyActuals:  MonthlyActual[];
  onMoveUp?:       () => void;
  onMoveDown?:     () => void;
  onUpdated:       () => void;
  onToast:         (msg: string) => void;
}) {
  const [editMode,    setEditMode]    = useState(false);
  const [actualMode,  setActualMode]  = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: rate !== null ? rateColor(rate) : 'var(--text-primary)' }}>
              {fmtVal(target.actual_value)}
            </span>
            {/* 직접 입력 버튼 (월별 없을 때) */}
            {!isAnnual && (
              <button
                onClick={() => { setActualVal(target.actual_value); setActualNote(target.note ?? ''); setActualMode(true); }}
                title="실적 입력"
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '0.65rem',
                }}
              >✏</button>
            )}
            {/* 월별 입력 토글 (연간 뷰) */}
            {isAnnual && (
              <button
                onClick={() => setMonthlyOpen(v => !v)}
                style={{
                  padding: '0.1rem 0.45rem', borderRadius: 4, cursor: 'pointer',
                  fontSize: '0.65rem', fontWeight: 600, fontFamily: 'inherit',
                  background: monthlyOpen ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${monthlyOpen ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.12)'}`,
                  color: monthlyOpen ? '#a5b4fc' : 'var(--text-muted)',
                }}
              >
                {monthlyOpen ? '▲ 월별' : '▼ 월별'}
              </button>
            )}
          </div>
          {target.note && !isAnnual && (
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
                background: `rgba(${rateRgb(rate)},0.15)`,
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

      {/* 실적 입력 인라인 행 (월별 아닐 때) */}
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

      {/* 월별 실적 입력 그리드 */}
      {isAnnual && monthlyOpen && (
        <tr style={{ background: 'rgba(99,102,241,0.04)', borderTop: '1px solid rgba(99,102,241,0.15)' }}>
          <td colSpan={isAdmin ? 8 : 6} style={{ padding: '0.75rem 1rem' }}>
            <MonthlyGrid
              targetId={target.id}
              unit={target.unit}
              monthlyActuals={monthlyActuals}
              onSaved={onUpdated}
              onToast={onToast}
            />
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
  userId, year, month, fyYear, fyMonth, currentCount, companyId, onAdded, onToast,
}: {
  userId:       string;
  year:         number;
  month:        number | null;
  fyYear:       number;
  fyMonth:      number | null;
  currentCount: number;
  companyId:    string | null;
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
        company_id:   companyId,
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
        <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>
          FY{fyYear} {fyMonth ? FY_MONTH_LABEL[fyMonth] : '연간'}
        </span>
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

/* ════════════════════════════════════════════
   월별 목표·실적 입력 그리드
════════════════════════════════════════════ */
// FY순서: [상반기 FY1~6 = 4월~9월], [하반기 FY7~12 = 10월~3월]
const FY_HALVES = [[1,2,3,4,5,6],[7,8,9,10,11,12]] as const;

function MonthlyGrid({
  targetId, unit, monthlyActuals, onSaved, onToast,
}: {
  targetId:       string;
  unit:           string;
  monthlyActuals: MonthlyActual[];
  onSaved:        () => void;
  onToast:        (msg: string) => void;
}) {
  const fyMtoCalM = (fm: number) => fm <= 9 ? fm + 3 : fm - 9;

  // 숫자이면 천단위 콤마 표시, 텍스트면 그대로
  const fmtInput = (raw: string): string => {
    if (!raw || raw.trim() === '') return raw;
    const n = Number(raw.replace(/,/g, ''));
    if (isNaN(n)) return raw;
    return n.toLocaleString();
  };
  // 콤마 제거 → raw 저장
  const parseInput = (v: string): string => v.replace(/,/g, '');

  const init = (field: 'target_value' | 'actual_value') => {
    const v: Record<number, string> = {};
    for (let fm = 1; fm <= 12; fm++) {
      v[fm] = monthlyActuals.find(a => a.month === fyMtoCalM(fm))?.[field] ?? '';
    }
    return v;
  };

  const [tVals,   setTVals]   = useState<Record<number, string>>(() => init('target_value'));
  const [aVals,   setAVals]   = useState<Record<number, string>>(() => init('actual_value'));
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    setTVals(init('target_value'));
    setAVals(init('actual_value'));
  }, [monthlyActuals]); // eslint-disable-line

  /* 저장하기 — 12개월 일괄 */
  async function handleSave() {
    setSaving(true);
    try {
      const entries = Array.from({ length: 12 }, (_, i) => {
        const fm = i + 1;
        return { month: fyMtoCalM(fm), targetValue: tVals[fm] ?? '', actualValue: aVals[fm] ?? '' };
      });
      const res = await upsertMonthlyEntries(targetId, entries);
      if (res.error) onToast('⚠ ' + res.error);
      else { onToast('✓ 월별 데이터가 저장되었습니다.'); onSaved(); }
    } catch {
      onToast('⚠ 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const isAvg = unit.trim() === '%';

  const aggregateOf = (vals: Record<number, string>) => {
    const nums = Object.values(vals).filter(v => v.trim() !== '' && !isNaN(Number(v))).map(Number);
    if (nums.length === 0) return null;
    const total = nums.reduce((a, b) => a + b, 0);
    return isAvg ? Math.round((total / nums.length) * 100) / 100 : total;
  };

  const tSum  = aggregateOf(tVals);
  const aSum  = aggregateOf(aVals);
  const tRate = tSum !== null && aSum !== null && tSum > 0 ? Math.round((aSum / tSum) * 100) : null;

  const cellStyle = (val: string): React.CSSProperties => ({
    ...inlineInputStyle,
    width: '100%', textAlign: 'right', boxSizing: 'border-box' as const,
    background: val ? 'rgba(96,165,250,0.07)' : 'rgba(255,255,255,0.03)',
    borderColor: val ? 'rgba(96,165,250,0.28)' : 'rgba(255,255,255,0.08)',
    fontSize: '0.8rem',
  });

  return (
    <div>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#a5b4fc' }}>📅 월별 목표·실적</span>
        {tSum !== null && (
          <span style={{ fontSize: '0.72rem', color: '#fbbf24', padding: '0.1rem 0.5rem', borderRadius: 5, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)' }}>
            목표 {isAvg ? '평균' : '합계'} {tSum.toLocaleString()}{unit ? ` ${unit}` : ''}
          </span>
        )}
        {aSum !== null && (
          <span style={{ fontSize: '0.72rem', color: '#60a5fa', padding: '0.1rem 0.5rem', borderRadius: 5, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)' }}>
            실적 {isAvg ? '평균' : '합계'} {aSum.toLocaleString()}{unit ? ` ${unit}` : ''}
          </span>
        )}
        {tRate !== null && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: rateColor(tRate), padding: '0.1rem 0.5rem', borderRadius: 5, background: `rgba(${rateRgb(tRate)},0.1)` }}>
            {tRate}%
          </span>
        )}
        {/* 저장하기 버튼 */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginLeft: 'auto', padding: '0.32rem 1rem', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer',
            background: saving ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.22)',
            border: '1px solid rgba(99,102,241,0.45)',
            color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          {saving ? '저장 중…' : '💾 저장하기'}
        </button>
      </div>

      {/* 상반기(4~9월) / 하반기(10~3월) */}
      {FY_HALVES.map((fyMs, hi) => (
        <div key={hi} style={{ marginBottom: hi === 0 ? '0.6rem' : 0 }}>
          {/* 월 이름 행 */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(6, 1fr)', gap: '0.3rem', marginBottom: '0.25rem' }}>
            <div />
            {fyMs.map(fm => (
              <div key={fm} style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>
                {FY_MONTH_LABEL[fm]}
              </div>
            ))}
          </div>
          {/* 목표 행 */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(6, 1fr)', gap: '0.3rem', marginBottom: '0.25rem' }}>
            <div style={{ fontSize: '0.68rem', color: '#fbbf24', fontWeight: 600, display: 'flex', alignItems: 'center' }}>목표</div>
            {fyMs.map(fm => (
              <input key={fm} value={fmtInput(tVals[fm] ?? '')} placeholder="-"
                onChange={e => setTVals(prev => ({ ...prev, [fm]: parseInput(e.target.value) }))}
                style={cellStyle(tVals[fm] ?? '')} />
            ))}
          </div>
          {/* 실적 행 */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(6, 1fr)', gap: '0.3rem', marginBottom: '0.25rem' }}>
            <div style={{ fontSize: '0.68rem', color: '#60a5fa', fontWeight: 600, display: 'flex', alignItems: 'center' }}>실적</div>
            {fyMs.map(fm => (
              <input key={fm} value={fmtInput(aVals[fm] ?? '')} placeholder="-"
                onChange={e => setAVals(prev => ({ ...prev, [fm]: parseInput(e.target.value) }))}
                style={cellStyle(aVals[fm] ?? '')} />
            ))}
          </div>
          {/* 달성률 행 */}
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(6, 1fr)', gap: '0.3rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>달성률</div>
            {fyMs.map(fm => {
              const t = Number(tVals[fm]); const a = Number(aVals[fm]);
              const hasRate = tVals[fm]?.trim() && aVals[fm]?.trim() && !isNaN(t) && !isNaN(a) && t > 0;
              const r = hasRate ? Math.round((a / t) * 100) : null;
              return (
                <div key={fm} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: 28, borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                  background: r === null ? 'transparent' : `rgba(${rateRgb(r)},0.12)`,
                  color: r === null ? 'var(--text-muted)' : rateColor(r),
                  border: r === null ? '1px solid rgba(255,255,255,0.05)' : `1px solid rgba(${rateRgb(r)},0.25)`,
                }}>
                  {r === null ? '-' : `${r}%`}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════
   목표 복사 패널
════════════════════════════════════════════ */
function CopyPanel({
  fromUserId, fromEmail, fyYear, members, companyId, onCopied, onToast,
}: {
  fromUserId: string;
  fromEmail:  string;
  fyYear:     number;
  members:    Member[];
  companyId:  string | null;
  onCopied:   (toId: string) => void;
  onToast:    (msg: string) => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [toId,    setToId]    = useState('');
  const [copying, setCopying] = useState(false);

  const others = members.filter(m => m.id !== fromUserId);

  // 처음 열릴 때 기본값 설정
  function handleOpen() {
    if (others.length > 0 && !toId) setToId(others[0].id);
    setOpen(true);
  }

  async function handleCopy() {
    if (!toId) return;
    const toName = members.find(m => m.id === toId)?.name ?? toId;
    if (!confirm(`"${fromEmail}"의 FY${fyYear} 목표 항목을\n"${toName}"에게 복사할까요?\n\n기존 항목은 삭제됩니다.`)) return;

    setCopying(true);
    try {
      const res = await copyMboTargets(fromUserId, toId, fyYear, companyId);
      if (res.error) { onToast('⚠ ' + res.error); return; }
      onToast(`✓ ${res.count}개 항목을 "${toName}"에게 복사했습니다.`);
      setOpen(false);
      onCopied(toId);
    } catch {
      onToast('⚠ 복사 중 오류가 발생했습니다.');
    } finally {
      setCopying(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        title="이 멤버의 목표 항목을 다른 멤버에게 복사"
        style={{
          padding: '0.38rem 0.8rem', borderRadius: 8, cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        📋 복사하기
      </button>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap',
      padding: '0.45rem 0.8rem', borderRadius: 9,
      background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.28)',
    }}>
      <span style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 600, whiteSpace: 'nowrap' }}>
        📋 복사 대상:
      </span>
      <select
        value={toId}
        onChange={e => setToId(e.target.value)}
        style={{ ...selectStyle, fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
      >
        {others.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <button
        onClick={handleCopy}
        disabled={copying || !toId}
        style={{
          padding: '0.3rem 0.85rem', borderRadius: 7, cursor: copying ? 'not-allowed' : 'pointer',
          background: 'rgba(99,102,241,0.22)', border: '1px solid rgba(99,102,241,0.5)',
          color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {copying ? '복사 중…' : '복사'}
      </button>
      <button
        onClick={() => setOpen(false)}
        style={{
          padding: '0.3rem 0.65rem', borderRadius: 7, cursor: 'pointer',
          background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
          color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'inherit',
        }}
      >
        취소
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════
   현수준 위젯
════════════════════════════════════════════ */
const STATUS_OPTIONS = [
  { key: 'blue',   label: '양호', hex: '#60a5fa', rgb: '96,165,250' },
  { key: 'yellow', label: '주의', hex: '#fbbf24', rgb: '251,191,36' },
  { key: 'red',    label: '위험', hex: '#f87171', rgb: '248,113,113' },
] as const;

function CurrentLevelWidget({
  color, isAdmin, onSelect,
}: {
  color:    string | null;
  isAdmin:  boolean;
  onSelect: (c: string) => void;
}) {
  const active = STATUS_OPTIONS.find(o => o.key === color) ?? null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      {/* 현수준 라벨 */}
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        현수준
      </span>

      {/* 선택된 상태 표시 */}
      {active ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.35rem 0.85rem', borderRadius: 8,
          background: `rgba(${active.rgb},0.12)`,
          border: `1px solid rgba(${active.rgb},0.35)`,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: active.hex, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: active.hex }}>{active.label}</span>
        </div>
      ) : (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.5, fontStyle: 'italic' }}>
          {isAdmin ? '미설정' : '-'}
        </span>
      )}

      {/* 관리자 색상 선택 버튼 */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {STATUS_OPTIONS.map(o => (
            <button
              key={o.key}
              onClick={() => onSelect(o.key)}
              title={o.label}
              style={{
                width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                background: `rgba(${o.rgb},${color === o.key ? '0.85' : '0.25'})`,
                border: `2px solid ${color === o.key ? o.hex : `rgba(${o.rgb},0.4)`}`,
                boxShadow: color === o.key ? `0 0 8px rgba(${o.rgb},0.6)` : 'none',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}
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
