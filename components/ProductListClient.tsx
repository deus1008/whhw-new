'use client';

import { useState, useMemo, useTransition } from 'react';
import { updateProductFlag } from '@/app/product-list/actions';

export type ProductRow = {
  id?:          string;
  no:           number;
  code:         string;
  name:         string;
  ingredient:   string;
  rate:         number;
  distribution: string;  // 유통중 | 유통중단 | 유통예정
  note:         string;  // 참고사항
  atc?:         string;  // ATC 코드 (식약처 보강)
  isBioequiv?:  boolean | null;  // 생동여부 (null=미확인)
  hasDmf?:      boolean | null;  // DMF원료 사용여부
  isReference?: boolean | null;  // 대조약 여부 (식약처)
  maker?:       string;  // 제조원(위탁제조사)
  isConsignment?: boolean | null;  // 위탁생산 여부
  permitDate?:  string;  // 허가일자 (YYYYMMDD)
  permitNo?:    string;  // 품목허가번호
  packageUnit?: string;  // 포장단위
};

const fmtYmd = (s?: string) => {
  const d = String(s || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : (s || '');
};

const DIST_STYLE: Record<string, { color: string; bg: string }> = {
  '유통중':   { color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  '유통중단': { color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  '유통예정': { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
};

export default function ProductListClient({
  rows,
  filename,
  signedUrl,
  updatedAt,
  isAdmin = false,
}: {
  rows:      ProductRow[];
  filename:  string;
  signedUrl: string | null;
  updatedAt: string;
  isAdmin?:  boolean;
}) {
  const [query, setQuery]   = useState('');
  const [dist,  setDist]    = useState<string | null>(null);
  // 생동/DMF/대조약 편집 반영용 로컬 상태
  type FlagState = { isBioequiv: boolean | null; hasDmf: boolean | null; isReference: boolean | null };
  const [flags, setFlags] = useState<Record<string, FlagState>>(
    () => Object.fromEntries(rows.filter(r => r.id).map(r => [r.id!, {
      isBioequiv: r.isBioequiv ?? null, hasDmf: r.hasDmf ?? null, isReference: r.isReference ?? null,
    }])),
  );
  const [, startTransition] = useTransition();

  const FIELD_KEY = {
    is_bioequiv: 'isBioequiv', has_dmf: 'hasDmf', is_reference_drug: 'isReference',
  } as const;

  // 미확인(null) → 예(true) → 아니오(false) → 미확인 순으로 순환
  function cycleFlag(id: string | undefined, field: keyof typeof FIELD_KEY, cur: boolean | null) {
    if (!id || !isAdmin) return;
    const next = cur === null ? true : cur === true ? false : null;
    const key = FIELD_KEY[field];
    setFlags(f => ({ ...f, [id]: { ...f[id], [key]: next } }));
    startTransition(async () => { await updateProductFlag(id, field, next); });
  }

  // 유통여부 값 목록
  const distValues = useMemo(() => {
    const s = new Set(rows.map(r => r.distribution).filter(Boolean));
    const ORDER = ['유통중', '유통예정', '유통중단'];
    return ORDER.filter(v => s.has(v));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (dist && r.distribution !== dist) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.ingredient.toLowerCase().includes(q) ||
        r.code.includes(q) ||
        (r.atc ?? '').toLowerCase().includes(q) ||
        (r.maker ?? '').toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q)
      );
    });
  }, [rows, query, dist]);

  return (
    <div>
      {/* 검색 + 다운로드 */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <span style={{
            position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
            color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="품목명, 성분명, 보험코드, 제조원, 참고사항 검색..."
            style={{
              width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.2rem',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', color: 'rgba(255,255,255,0.9)',
              fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        {signedUrl && (
          <a
            href={signedUrl}
            download={filename}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.5rem 1rem', borderRadius: '8px',
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.35)',
              color: '#a5b4fc', fontSize: '0.82rem', fontWeight: 600,
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            ⬇ 엑셀 다운로드
          </a>
        )}
      </div>

      {/* 유통여부 필터 칩 */}
      {distValues.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {distValues.map(v => {
            const s = DIST_STYLE[v] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
            const active = dist === v;
            return (
              <button key={v} onClick={() => setDist(active ? null : v)} style={{
                fontSize: '0.75rem', padding: '0.25rem 0.8rem', borderRadius: '100px',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 700 : 400,
                background: active ? s.bg : 'transparent',
                border: `1px solid ${active ? s.color + '70' : 'rgba(255,255,255,0.12)'}`,
                color: active ? s.color : 'rgba(255,255,255,0.45)',
              }}>
                {v} {active ? `(${filtered.length})` : `(${rows.filter(r => r.distribution === v).length})`}
              </button>
            );
          })}
          {dist && (
            <button onClick={() => setDist(null)} style={{
              fontSize: '0.68rem', padding: '0.2rem 0.55rem', borderRadius: '100px',
              cursor: 'pointer', fontFamily: 'inherit',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.3)',
            }}>✕ 초기화</button>
          )}
        </div>
      )}

      {/* 결과 카운트 + 기준일 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          {(query || dist)
            ? <><span style={{ color: '#a5b4fc', fontWeight: 600 }}>{filtered.length.toLocaleString()}</span>건 / 전체 {rows.length.toLocaleString()}건</>
            : <>전체 <span style={{ color: '#a5b4fc', fontWeight: 600 }}>{rows.length.toLocaleString()}</span>건</>
          }
        </p>
        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
          기준: {updatedAt}
        </p>
      </div>

      {/* 테이블 */}
      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.88rem' }}>
          검색 결과가 없습니다.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                <th style={{ ...th, width: '3rem', textAlign: 'center' }}>NO</th>
                <th style={{ ...th, minWidth: '110px' }}>보험코드</th>
                <th style={{ ...th, minWidth: '200px' }}>품목명</th>
                <th style={{ ...th, minWidth: '240px' }}>성분명</th>
                <th style={{ ...th, width: '80px' }}>ATC</th>
                <th style={{ ...th, width: '60px', textAlign: 'center' }}>생동</th>
                <th style={{ ...th, width: '60px', textAlign: 'center' }}>DMF</th>
                <th style={{ ...th, width: '62px', textAlign: 'center' }}>대조약</th>
                <th style={{ ...th, minWidth: '140px' }}>제조원</th>
                <th style={{ ...th, width: '66px', textAlign: 'center' }}>생산</th>
                <th style={{ ...th, width: '92px' }}>허가일자</th>
                <th style={{ ...th, minWidth: '130px' }}>포장</th>
                <th style={{ ...th, width: '75px', textAlign: 'right' }}>수수료율</th>
                <th style={{ ...th, width: '80px', textAlign: 'center' }}>유통여부</th>
                <th style={{ ...th, minWidth: '120px' }}>참고사항</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const ds = DIST_STYLE[row.distribution] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' };
                return (
                  <tr key={row.no} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}>
                    <td style={{ ...td, textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>{row.no}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)' }}>{row.code}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{row.name}</td>
                    <td style={{ ...td, fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)' }}>{row.ingredient}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{row.atc || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <FlagBadge value={row.id ? flags[row.id]?.isBioequiv ?? null : (row.isBioequiv ?? null)} label="생동"
                        editable={isAdmin && !!row.id} onClick={() => cycleFlag(row.id, 'is_bioequiv', row.id ? flags[row.id]?.isBioequiv ?? null : null)} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <FlagBadge value={row.id ? flags[row.id]?.hasDmf ?? null : (row.hasDmf ?? null)} label="DMF"
                        editable={isAdmin && !!row.id} onClick={() => cycleFlag(row.id, 'has_dmf', row.id ? flags[row.id]?.hasDmf ?? null : null)} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <FlagBadge value={row.id ? flags[row.id]?.isReference ?? null : (row.isReference ?? null)} label="대조약"
                        editable={isAdmin && !!row.id} onClick={() => cycleFlag(row.id, 'is_reference_drug', row.id ? flags[row.id]?.isReference ?? null : null)} />
                    </td>
                    <td style={{ ...td, fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)' }}>{row.maker || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {row.isConsignment == null ? <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span> : (
                        <span style={{
                          fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', whiteSpace: 'nowrap',
                          background: row.isConsignment ? 'rgba(251,191,36,0.12)' : 'rgba(52,211,153,0.12)',
                          color: row.isConsignment ? '#fbbf24' : '#34d399',
                        }}>{row.isConsignment ? '위탁' : '자사'}</span>
                      )}
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{fmtYmd(row.permitDate) || '—'}</td>
                    <td style={{ ...td, fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)' }}>{row.packageUnit || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#a5b4fc' }}>
                      {row.rate > 0 ? `${(row.rate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {row.distribution ? (
                        <span style={{
                          fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '4px',
                          background: ds.bg, color: ds.color, whiteSpace: 'nowrap',
                        }}>
                          {row.distribution}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ ...td, fontSize: '0.77rem', color: 'rgba(255,255,255,0.5)' }}>
                      {row.note || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        input::placeholder { color: rgba(255,255,255,0.25); }
        input:focus { border-color: rgba(99,102,241,0.5) !important; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
      `}</style>
    </div>
  );
}

function FlagBadge({ value, label, editable, onClick }: {
  value: boolean | null; label: string; editable: boolean; onClick: () => void;
}) {
  const style = value === true
    ? { color: '#34d399', bg: 'rgba(52,211,153,0.14)', text: label }
    : value === false
    ? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', text: '아니오' }
    : { color: 'rgba(255,255,255,0.3)', bg: 'transparent', text: '—' };
  return (
    <span
      onClick={editable ? onClick : undefined}
      title={editable ? '클릭: 미확인 → 예 → 아니오' : (value === null ? '미확인' : undefined)}
      style={{
        display: 'inline-block', minWidth: '2.4rem', padding: '0.15rem 0.4rem', borderRadius: '5px',
        fontSize: '0.7rem', fontWeight: 600, background: style.bg, color: style.color,
        border: value === true ? '1px solid rgba(52,211,153,0.3)' : '1px solid transparent',
        cursor: editable ? 'pointer' : 'default', userSelect: 'none',
      }}
    >
      {style.text}
    </span>
  );
}

const th: React.CSSProperties = {
  padding: '0.45rem 0.7rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)',
  fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', textAlign: 'left',
};
const td: React.CSSProperties = {
  padding: '0.4rem 0.7rem', fontSize: '0.83rem', color: 'rgba(255,255,255,0.85)',
  borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle',
};
