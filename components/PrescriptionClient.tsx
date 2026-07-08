'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { PrescriptionRow } from '@/app/api/prescription-data/route';
import type { PrescriptionMemo } from '@/app/api/prescription-memos/route';
import { stripCompanyAffix, fmtNum } from '@/lib/format';

type FileInfo  = { id: string; filename: string; createdAt: string };
type SortDir   = 'asc' | 'desc';
type SortKey   = keyof PrescriptionRow | null;

const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem',
};

const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
  '의원':       { bg: 'rgba(79,142,247,0.15)',  color: '#7eb3ff' },
  '병원':       { bg: 'rgba(52,211,153,0.15)',  color: '#6ee7b7' },
  '종합병원':   { bg: 'rgba(167,139,250,0.15)', color: '#c4b5fd' },
  '상급종합':   { bg: 'rgba(251,146,60,0.15)',  color: '#fdba74' },
  '요양병원':   { bg: 'rgba(251,191,36,0.15)',  color: '#fcd34d' },
  '정신병원':   { bg: 'rgba(244,114,182,0.15)', color: '#f9a8d4' },
};

function typeStyle(t: string) {
  for (const k of Object.keys(TYPE_COLOR)) {
    if (t.includes(k)) return TYPE_COLOR[k];
  }
  return { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' };
}

function Skel({ w = '100%', h = '0.85rem' }: { w?: string; h?: string }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: '5px',
      background: 'rgba(255,255,255,0.09)',
      animation: 'skel-pulse 1.4s ease-in-out infinite',
    }} />
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── 메모 패널 ── */
function MemoPanel({
  sourceName, memos, userId, isAdmin, onClose, onAdd, onDelete,
}: {
  sourceName: string;
  memos: PrescriptionMemo[];
  userId: string;
  isAdmin: boolean;
  onClose: () => void;
  onAdd: (sourceName: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleAdd = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    await onAdd(sourceName, text);
    setText('');
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  const sortedMemos = [...memos].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 40,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: 'min(420px, 100vw)',
        background: 'var(--bg-dark, #0f1117)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: '0.2rem' }}>메모 히스토리</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', wordBreak: 'break-all' }}>
              {stripCompanyAffix(sourceName)}
            </div>
          </div>
          <button onClick={onClose} style={{
            flexShrink: 0, background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem',
            cursor: 'pointer', padding: '0.2rem', lineHeight: 1,
          }}>✕</button>
        </div>

        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="메모를 입력하세요..."
            rows={3}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd(); }}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', padding: '0.65rem 0.75rem',
              color: '#fff', fontSize: '0.82rem', resize: 'vertical',
              fontFamily: 'inherit', outline: 'none', lineHeight: 1.55,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.28)' }}>Ctrl+Enter로 저장</span>
            <button onClick={handleAdd} disabled={!text.trim() || saving} style={{
              padding: '0.4rem 1rem', borderRadius: '7px', cursor: text.trim() ? 'pointer' : 'not-allowed',
              background: text.trim() ? 'rgba(79,142,247,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${text.trim() ? 'rgba(79,142,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: text.trim() ? '#7eb3ff' : 'rgba(255,255,255,0.25)',
              fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s',
            }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>
          {sortedMemos.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.82rem', marginTop: '2rem' }}>
              아직 메모가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sortedMemos.map(m => (
                <div key={m.id} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px', padding: '0.75rem 0.9rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#7eb3ff' }}>{m.authorName}</span>
                      <span style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.3)' }}>{formatDate(m.createdAt)}</span>
                    </div>
                    {(isAdmin || m.createdBy === userId) && (
                      <button onClick={() => handleDelete(m.id)} disabled={deletingId === m.id} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem', padding: '0.1rem 0.3rem',
                      }}>
                        {deletingId === m.id ? '...' : '삭제'}
                      </button>
                    )}
                  </div>
                  <p style={{
                    margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)',
                    lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>{m.memo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── 처방처 카드 ── */
function PrescriptionCard({
  row, mc, isSelected, onMemo,
}: {
  row: PrescriptionRow;
  mc: number;
  isSelected: boolean;
  onMemo: () => void;
}) {
  const ts = typeStyle(row.type);
  const name = stripCompanyAffix(row.sourceName);
  const cso  = stripCompanyAffix(row.csoName);
  const loc  = [row.sido, row.gugun].filter(Boolean).join(' ');

  return (
    <div
      className="prx-card"
      style={{
        background: isSelected ? 'rgba(79,142,247,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isSelected ? 'rgba(79,142,247,0.35)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '14px',
        padding: '1rem 1.1rem',
        display: 'flex', flexDirection: 'column', gap: '0.65rem',
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
      }}
    >
      {/* 헤더: 종별 뱃지 + 메모 버튼 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {row.type && (
            <span style={{
              fontSize: '0.67rem', fontWeight: 700, borderRadius: '6px',
              padding: '0.15rem 0.5rem', flexShrink: 0,
              background: ts.bg, color: ts.color,
            }}>{row.type}</span>
          )}
          {row.duplicate && (
            <span style={{
              fontSize: '0.67rem', fontWeight: 600, borderRadius: '6px',
              padding: '0.15rem 0.5rem', flexShrink: 0,
              background: 'rgba(251,191,36,0.15)', color: '#fcd34d',
            }}>중복</span>
          )}
        </div>
        <button
          onClick={onMemo}
          style={{
            flexShrink: 0,
            background: mc > 0 ? 'rgba(79,142,247,0.18)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${mc > 0 ? 'rgba(79,142,247,0.35)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '100px', padding: '0.18rem 0.6rem',
            color: mc > 0 ? '#7eb3ff' : 'rgba(255,255,255,0.3)',
            fontSize: '0.7rem', fontWeight: mc > 0 ? 600 : 400,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {mc > 0 ? `📝 ${mc}` : '+ 메모'}
        </button>
      </div>

      {/* 처방처명 */}
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0', lineHeight: 1.35 }}>
        {name || <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
      </div>

      {/* 위치 */}
      {loc && (
        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: '-0.3rem' }}>
          📍 {loc}
        </div>
      )}

      {/* 구분선 */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

      {/* 수치 스탯 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
        {[
          { label: '의사수', value: row.doctorCount, color: 'rgba(255,255,255,0.7)' },
          { label: '허용품목', value: row.allowedCount, color: '#6ee7b7' },
          { label: '불가품목', value: row.disallowedCount, color: '#fca5a5' },
          { label: '회수불가', value: row.unrecoverableCount, color: '#fdba74' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '8px', padding: '0.4rem 0.3rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{fmtNum(value) || '0'}</div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.1rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* CSO / 담당자 */}
      {(cso || row.internalManager) && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {cso && (
            <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)' }}>
              <span style={{ color: 'rgba(255,255,255,0.25)', marginRight: '0.3rem' }}>CSO</span>
              {cso}
            </span>
          )}
          {row.internalManager && (
            <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.45)' }}>
              <span style={{ color: 'rgba(255,255,255,0.25)', marginRight: '0.3rem' }}>담당</span>
              {row.internalManager}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 시도 표준 순서 ── */
const SIDO_ORDER = ['서울', '경기', '인천', '강원', '대전', '세종', '충북', '충남', '부산', '울산', '경남', '대구', '경북', '광주', '전북', '전남', '제주'];

/* ── 종별 표준 순서 ── */
const TYPE_ORDER = ['상급종합병원', '종합병원', '병원', '의원', '요양병원', '정신병원'];

/* 광주광역시 구군 목록 (전남 vs 광주 구분용) */
const GWANGJU_GUNS = ['동구', '서구', '남구', '북구', '광산구'];

function normalizeSido(sido: string, gugun: string): string {
  const s = sido.trim()
    .replace(/특별시|광역시|특별자치시|특별자치도|도$/g, '')
    .trim();

  // "전남광주" / "광주전남" 처리 → 구군으로 판별
  if (s === '전남광주' || s === '광주전남' || s === '광주/전남') {
    return GWANGJU_GUNS.some(g => (gugun ?? '').includes(g)) ? '광주' : '전남';
  }

  // 알려진 시도명과 매칭
  for (const k of SIDO_ORDER) {
    if (s === k) return k;
  }
  // 포함 관계 (예: "서울특별시" → 이미 특별시 제거됨 → "서울")
  for (const k of SIDO_ORDER) {
    if (s.includes(k)) return k;
  }
  return s || '기타';
}

function normalizeType(type: string): string {
  const t = type.trim();
  if (!t) return '기타';
  if (t.includes('상급종합')) return '상급종합병원';
  if (t.includes('종합병원') || t === '종합') return '종합병원';
  if (t.includes('요양병원') || t === '요양') return '요양병원';
  if (t.includes('정신병원') || t.includes('정신건강')) return '정신병원';
  if (t.includes('병원')) return '병원';
  if (t.includes('의원')) return '의원';
  return t;
}

/* ── 영업 네트워크 현황 피벗 테이블 ── */
function NetworkSummary({ rows }: { rows: PrescriptionRow[] }) {
  const { sidos, types, pivot, sidoTotals, typeTotals, grand, maxCell } = useMemo(() => {
    const pivot = new Map<string, Map<string, number>>();
    const sidoSet = new Set<string>();
    const typeSet = new Set<string>();

    for (const row of rows) {
      const sido = normalizeSido(row.sido ?? '', row.gugun ?? '');
      const type = normalizeType(row.type ?? '');
      sidoSet.add(sido);
      typeSet.add(type);
      if (!pivot.has(sido)) pivot.set(sido, new Map());
      const m = pivot.get(sido)!;
      m.set(type, (m.get(type) ?? 0) + 1);
    }

    // 종별: TYPE_ORDER 기준 정렬, 미포함 종별은 뒤에 가나다순
    const types = [...typeSet].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a), bi = TYPE_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b, 'ko');
    });

    // 시도: SIDO_ORDER 기준 정렬, 미포함 시도는 뒤에
    const sidoTotals = new Map<string, number>();
    for (const [sido, m] of pivot) {
      sidoTotals.set(sido, [...m.values()].reduce((s, v) => s + v, 0));
    }
    const sidos = [...sidoSet].sort((a, b) => {
      const ai = SIDO_ORDER.indexOf(a), bi = SIDO_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b, 'ko');
    });

    const typeTotals = new Map<string, number>();
    for (const type of types) {
      let total = 0;
      for (const m of pivot.values()) total += m.get(type) ?? 0;
      typeTotals.set(type, total);
    }

    const grand = [...sidoTotals.values()].reduce((s, v) => s + v, 0);
    let maxCell = 0;
    for (const m of pivot.values()) for (const v of m.values()) maxCell = Math.max(maxCell, v);

    return { sidos, types, pivot, sidoTotals, typeTotals, grand, maxCell };
  }, [rows]);

  const cellBg = (n: number) => {
    if (!n) return 'transparent';
    const ratio = maxCell > 0 ? n / maxCell : 0;
    const opacity = 0.08 + ratio * 0.55;
    return `rgba(79,142,247,${opacity.toFixed(2)})`;
  };

  const TH: React.CSSProperties = {
    padding: '0.45rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
    color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  };
  const TD: React.CSSProperties = {
    padding: '0.38rem 0.5rem', fontSize: '0.78rem', textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px', marginBottom: '1.25rem', overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '0.85rem 1.1rem',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
      }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0' }}>영업 네트워크 현황</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.15rem' }}>시도 × 종별 처방처 수</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7eb3ff', lineHeight: 1 }}>{grand.toLocaleString()}</div>
          <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.1rem' }}>총 처방처</div>
        </div>
      </div>

      {/* 피벗 테이블 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${(types.length + 2) * 70}px` }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: 'left', minWidth: '72px', position: 'sticky', left: 0, background: 'rgba(15,17,23,0.97)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>시도</th>
              {types.map(t => {
                const ts = typeStyle(t);
                return (
                  <th key={t} style={{ ...TH }}>
                    <span style={{ background: ts.bg, color: ts.color, borderRadius: '5px', padding: '0.1rem 0.4rem', fontSize: '0.67rem' }}>{t}</span>
                  </th>
                );
              })}
              <th style={{ ...TH, color: 'rgba(255,255,255,0.6)', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {sidos.map(sido => {
              const m = pivot.get(sido)!;
              const total = sidoTotals.get(sido) ?? 0;
              return (
                <tr key={sido}>
                  <td style={{
                    ...TD, textAlign: 'left', fontWeight: 600, fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap',
                    position: 'sticky', left: 0, background: 'rgba(15,17,23,0.95)',
                    borderRight: '1px solid rgba(255,255,255,0.07)',
                    padding: '0.38rem 0.75rem',
                  }}>{sido}</td>
                  {types.map(t => {
                    const n = m.get(t) ?? 0;
                    return (
                      <td key={t} style={{
                        ...TD,
                        background: cellBg(n),
                        color: n ? '#e2e8f0' : 'rgba(255,255,255,0.12)',
                        fontWeight: n > 0 ? 600 : 400,
                        transition: 'background 0.15s',
                      }}>
                        {n ? fmtNum(n) : '—'}
                      </td>
                    );
                  })}
                  <td style={{
                    ...TD,
                    fontWeight: 700, color: '#7eb3ff',
                    borderLeft: '1px solid rgba(255,255,255,0.07)',
                  }}>{fmtNum(total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <td style={{
                ...TD, textAlign: 'left', fontSize: '0.72rem', fontWeight: 700,
                color: 'rgba(255,255,255,0.5)', padding: '0.45rem 0.75rem',
                position: 'sticky', left: 0, background: 'rgba(15,17,23,0.97)',
                borderRight: '1px solid rgba(255,255,255,0.07)',
              }}>합계</td>
              {types.map(t => (
                <td key={t} style={{ ...TD, fontWeight: 700, color: 'rgba(255,255,255,0.65)', fontSize: '0.75rem' }}>
                  {fmtNum(typeTotals.get(t) ?? 0)}
                </td>
              ))}
              <td style={{
                ...TD, fontWeight: 800, color: '#7eb3ff', fontSize: '0.85rem',
                borderLeft: '1px solid rgba(255,255,255,0.07)',
              }}>{fmtNum(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const SORT_OPTIONS: { key: keyof PrescriptionRow; label: string }[] = [
  { key: 'sourceName',         label: '처방처명' },
  { key: 'sido',               label: '시도' },
  { key: 'type',               label: '종별' },
  { key: 'doctorCount',        label: '의사수' },
  { key: 'allowedCount',       label: '허용품목' },
  { key: 'disallowedCount',    label: '불가품목' },
  { key: 'unrecoverableCount', label: '회수불가' },
];

/* ── 메인 컴포넌트 ── */
export default function PrescriptionClient({
  allFiles, userId, isAdmin,
}: {
  allFiles: FileInfo[];
  userId: string;
  isAdmin: boolean;
}) {
  const files = allFiles ?? [];
  const [rows,          setRows]          = useState<PrescriptionRow[]>([]);
  const [memoMap,       setMemoMap]       = useState<Record<string, PrescriptionMemo[]>>({});
  const [loading,       setLoading]       = useState(files.length > 0);
  const [fetchError,    setFetchError]    = useState(false);
  const [search,        setSearch]        = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [sortKey,       setSortKey]       = useState<SortKey>(null);
  const [sortDir,       setSortDir]       = useState<SortDir>('asc');
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [page,          setPage]          = useState(1);
  const PAGE_SIZE = 60;

  const ids = useMemo(() => files.map(f => f.id).join(','), [files]);

  const loadAll = useCallback(async () => {
    if (!ids) return;
    setFetchError(false); setLoading(true);
    try {
      const [dataRes, memoRes] = await Promise.all([
        fetch(`/api/prescription-data?ids=${encodeURIComponent(ids)}`),
        fetch('/api/prescription-memos'),
      ]);
      if (dataRes.ok) {
        const d = await dataRes.json();
        setRows(d.rows ?? []);
      } else { setFetchError(true); }
      if (memoRes.ok) {
        const m = await memoRes.json() as { memos: PrescriptionMemo[] };
        const map: Record<string, PrescriptionMemo[]> = {};
        for (const memo of (m.memos ?? [])) {
          if (!map[memo.sourceName]) map[memo.sourceName] = [];
          map[memo.sourceName].push(memo);
        }
        setMemoMap(map);
      }
    } catch { setFetchError(true); }
    finally { setLoading(false); }
  }, [ids]);

  useEffect(() => { if (files.length > 0) loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddMemo = useCallback(async (sourceName: string, text: string) => {
    const res = await fetch('/api/prescription-memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceName, memo: text }),
    });
    if (res.ok) {
      const { memo } = await res.json() as { memo: PrescriptionMemo };
      setMemoMap(prev => ({
        ...prev,
        [sourceName]: [memo, ...(prev[sourceName] ?? [])],
      }));
    }
  }, []);

  const handleDeleteMemo = useCallback(async (id: string) => {
    const res = await fetch(`/api/prescription-memos?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setMemoMap(prev => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = next[key].filter(m => m.id !== id);
        }
        return next;
      });
    }
  }, []);

  const handleSearch = () => { setAppliedSearch(search); setPage(1); };

  const filtered = useMemo(() => {
    const q = appliedSearch.toLowerCase().trim();
    let result = q
      ? rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)))
      : rows;

    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        const an = parseFloat(av), bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
        return String(av).localeCompare(String(bv), 'ko') * dir;
      });
    }
    return result;
  }, [rows, appliedSearch, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const memoCount  = (n: string) => (memoMap[n] ?? []).length;

  if (files.length === 0) {
    return (
      <div style={{ ...CARD_STYLE, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', padding: '2.5rem' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.6rem', opacity: 0.4 }}>📄</div>
        문서관리 &gt; 처방처현황 폴더에 업로드된 파일이 없습니다.
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes skel-pulse { 0%,100%{opacity:.3} 50%{opacity:.65} }
        .prx-card:hover { border-color: rgba(255,255,255,0.14) !important; background: rgba(255,255,255,0.055) !important; }
      `}</style>

      {/* 검색바 + 정렬 */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="처방처명, 시도, 종별, 담당자 등 검색..."
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '10px', padding: '0.55rem 0.75rem 0.55rem 2.2rem',
              color: '#fff', fontSize: '0.82rem', outline: 'none',
            }}
          />
        </div>
        <button
          onClick={handleSearch}
          style={{
            padding: '0.53rem 1.2rem', borderRadius: '10px', cursor: 'pointer',
            background: 'rgba(79,142,247,0.18)',
            border: '1px solid rgba(79,142,247,0.4)',
            color: '#7eb3ff', fontSize: '0.82rem', fontWeight: 600,
            flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >검색</button>

        {/* 정렬 선택 */}
        <select
          value={sortKey ?? ''}
          onChange={e => { setSortKey((e.target.value || null) as SortKey); setPage(1); }}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px', padding: '0.53rem 0.75rem',
            color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">정렬 기준</option>
          {SORT_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>

        {sortKey && (
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            style={{
              padding: '0.5rem 0.8rem', borderRadius: '10px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem',
              flexShrink: 0,
            }}
          >{sortDir === 'asc' ? '↑ 오름차순' : '↓ 내림차순'}</button>
        )}

        {!loading && (
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', flexShrink: 0, marginLeft: 'auto' }}>
            {filtered.length !== rows.length
              ? `${filtered.length} / ${rows.length}건`
              : `총 ${rows.length}건`}
          </span>
        )}
      </div>

      {/* 오류 */}
      {fetchError && !loading && (
        <div style={{ ...CARD_STYLE, textAlign: 'center', padding: '2rem' }}>
          <div style={{ color: '#fca5a5', marginBottom: '0.75rem' }}>파일을 불러오는 중 오류가 발생했습니다.</div>
          <button onClick={loadAll} style={{
            padding: '0.45rem 1.2rem', borderRadius: '8px', cursor: 'pointer',
            background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.35)',
            color: '#7eb3ff', fontSize: '0.82rem',
          }}>다시 시도</button>
        </div>
      )}

      {/* 스켈레톤 */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
          {[...Array(12)].map((_, i) => (
            <div key={i} style={{ ...CARD_STYLE, marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Skel w="4rem" h="1.3rem" />
                <Skel w="3.5rem" h="1.3rem" />
              </div>
              <Skel h="1.1rem" />
              <Skel w="60%" h="0.85rem" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.4rem' }}>
                {[...Array(4)].map((_, j) => <Skel key={j} h="2.8rem" />)}
              </div>
              <Skel w="70%" h="0.8rem" />
            </div>
          ))}
        </div>
      )}

      {/* 네트워크 현황 요약 */}
      {!loading && !fetchError && rows.length > 0 && (
        <NetworkSummary rows={rows} />
      )}

      {/* 카드 그리드 */}
      {!loading && !fetchError && rows.length > 0 && (
        <>
          {paged.length === 0 ? (
            <div style={{ ...CARD_STYLE, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', padding: '3rem' }}>
              검색 결과가 없습니다.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
              {paged.map((row, i) => (
                <PrescriptionCard
                  key={row.sourceName + i}
                  row={row}
                  mc={memoCount(row.sourceName)}
                  isSelected={selectedSource === row.sourceName}
                  onMemo={() => setSelectedSource(row.sourceName)}
                />
              ))}
            </div>
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              padding: '1.25rem 0',
            }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '0.3rem 0.85rem', borderRadius: '8px', cursor: page > 1 ? 'pointer' : 'not-allowed',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: page > 1 ? '#fff' : 'rgba(255,255,255,0.25)', fontSize: '0.78rem',
                }}
              >이전</button>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '0.3rem 0.85rem', borderRadius: '8px', cursor: page < totalPages ? 'pointer' : 'not-allowed',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: page < totalPages ? '#fff' : 'rgba(255,255,255,0.25)', fontSize: '0.78rem',
                }}
              >다음</button>
            </div>
          )}
        </>
      )}

      {/* 메모 패널 */}
      {selectedSource && (
        <MemoPanel
          sourceName={selectedSource}
          memos={memoMap[selectedSource] ?? []}
          userId={userId}
          isAdmin={isAdmin}
          onClose={() => setSelectedSource(null)}
          onAdd={handleAddMemo}
          onDelete={handleDeleteMemo}
        />
      )}
    </>
  );
}
