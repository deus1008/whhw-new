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
  '유통중':   { color: '#15803d', bg: 'rgba(52,211,153,0.12)' },
  '유통중단': { color: '#b91c1c', bg: 'rgba(248,113,113,0.12)' },
  '유통예정': { color: '#b45309', bg: 'rgba(251,191,36,0.12)' },
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
  const [bioOnly, setBioOnly] = useState(false);                              // 생동품목만
  const [prod,    setProd]    = useState<'inhouse' | 'consign' | null>(null); // 자사생산/위탁생산(상호배타)
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

  // 생동여부는 로컬 편집(flags) 우선
  const bioOf = (r: ProductRow) => (r.id && flags[r.id] ? flags[r.id].isBioequiv : (r.isBioequiv ?? null));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (dist && r.distribution !== dist) return false;
      if (bioOnly && bioOf(r) !== true) return false;
      if (prod === 'inhouse' && r.isConsignment !== false) return false;
      if (prod === 'consign' && r.isConsignment !== true)  return false;
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
  }, [rows, query, dist, bioOnly, prod, flags]);

  return (
    <div>
      {/* 검색 + 다운로드 */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <span style={{
            position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
            color: '#94a3b8', fontSize: '0.9rem', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="품목명, 성분명, 보험코드, 제조원, 참고사항 검색..."
            style={{
              width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.2rem',
              background: '#ffffff',
              border: '1px solid #d7dce5',
              borderRadius: '8px', color: '#111827',
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
              background: '#eaf1fe',
              border: '1px solid #cdddfb',
              color: '#2563eb', fontSize: '0.82rem', fontWeight: 600,
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
                border: `1px solid ${active ? s.color + '70' : '#e5e9f0'}`,
                color: active ? s.color : '#94a3b8',
              }}>
                {v} {active ? `(${filtered.length})` : `(${rows.filter(r => r.distribution === v).length})`}
              </button>
            );
          })}
          {dist && (
            <button onClick={() => setDist(null)} style={{
              fontSize: '0.68rem', padding: '0.2rem 0.55rem', borderRadius: '100px',
              cursor: 'pointer', fontFamily: 'inherit',
              background: 'transparent', border: '1px solid #e5e9f0',
              color: '#94a3b8',
            }}>✕ 초기화</button>
          )}
        </div>
      )}

      {/* 속성 필터: 생동품목(독립) / 자사·위탁생산(상호배타) — 유통 필터와 자유 조합 */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {[
          { label: '생동품목', color: '#0891b2', bg: 'rgba(34,211,238,0.12)', active: bioOnly,             count: rows.filter(r => bioOf(r) === true).length,        toggle: () => setBioOnly(v => !v) },
          { label: '자사생산', color: '#059669', bg: 'rgba(52,211,153,0.12)', active: prod === 'inhouse',   count: rows.filter(r => r.isConsignment === false).length, toggle: () => setProd(p => p === 'inhouse' ? null : 'inhouse') },
          { label: '위탁생산', color: '#b45309', bg: 'rgba(251,191,36,0.12)', active: prod === 'consign',   count: rows.filter(r => r.isConsignment === true).length,  toggle: () => setProd(p => p === 'consign' ? null : 'consign') },
        ].map(o => (
          <button key={o.label} onClick={o.toggle} style={{
            fontSize: '0.75rem', padding: '0.25rem 0.8rem', borderRadius: '100px',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: o.active ? 700 : 400,
            background: o.active ? o.bg : 'transparent',
            border: `1px solid ${o.active ? o.color + '70' : '#e5e9f0'}`,
            color: o.active ? o.color : '#94a3b8',
          }}>
            {o.label} ({o.count})
          </button>
        ))}
        {(bioOnly || prod) && (
          <button onClick={() => { setBioOnly(false); setProd(null); }} style={{
            fontSize: '0.68rem', padding: '0.2rem 0.55rem', borderRadius: '100px',
            cursor: 'pointer', fontFamily: 'inherit',
            background: 'transparent', border: '1px solid #e5e9f0',
            color: '#94a3b8',
          }}>✕ 초기화</button>
        )}
      </div>

      {/* 결과 카운트 + 기준일 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
        <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
          {(query || dist || bioOnly || prod)
            ? <><span style={{ color: '#2563eb', fontWeight: 600 }}>{filtered.length.toLocaleString()}</span>건 / 전체 {rows.length.toLocaleString()}건</>
            : <>전체 <span style={{ color: '#2563eb', fontWeight: 600 }}>{rows.length.toLocaleString()}</span>건</>
          }
        </p>
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
          기준: {updatedAt}
        </p>
      </div>

      {/* 테이블 */}
      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.88rem' }}>
          검색 결과가 없습니다.
        </p>
      ) : (
       <>
        <div className="resp-table" style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #e5e9f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f1f4f9' }}>
                <th style={{ ...th, width: '3rem', textAlign: 'center' }}>NO</th>
                <th style={{ ...th, minWidth: '88px' }}>보험코드</th>
                <th style={{ ...th, minWidth: '160px' }}>품목명</th>
                <th style={{ ...th, minWidth: '144px' }}>성분명</th>
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
                  <tr key={row.no} style={{ background: i % 2 === 0 ? 'transparent' : '#fafbfd' }}>
                    <td style={{ ...td, textAlign: 'center', color: '#94a3b8' }}>{row.no}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569' }}>{row.code}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{row.name}</td>
                    <td style={{ ...td, fontSize: '0.78rem', color: '#475569' }}>{row.ingredient}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <FlagBadge value={row.id ? flags[row.id]?.isBioequiv ?? null : (row.isBioequiv ?? null)} label="생동" falseText="-"
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
                    <td style={{ ...td, fontSize: '0.78rem', color: '#475569' }}>{row.maker || '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {row.isConsignment == null ? <span style={{ color: '#94a3b8' }}>—</span> : (
                        <span style={{
                          fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', whiteSpace: 'nowrap',
                          background: row.isConsignment ? 'rgba(251,191,36,0.12)' : 'rgba(52,211,153,0.12)',
                          color: row.isConsignment ? '#b45309' : '#15803d',
                        }}>{row.isConsignment ? '위탁' : '자사'}</span>
                      )}
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>{fmtYmd(row.permitDate) || '—'}</td>
                    <td style={{ ...td, fontSize: '0.75rem', color: '#475569' }}>{row.packageUnit || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>
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
                    <td style={{ ...td, fontSize: '0.77rem', color: '#64748b' }}>
                      {row.note || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="resp-cards">
          {filtered.map(row => {
            const ds = DIST_STYLE[row.distribution] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' };
            return (
              <div key={row.no} className="mcard">
                <div className="mcard-head">
                  <span className="mcard-rank">{row.no}</span>
                  <span className="mcard-title">{row.name}</span>
                </div>
                <div className="mcard-row"><span className="mcard-k">보험코드</span><span className="mcard-v" style={{ fontFamily: 'monospace' }}>{row.code}</span></div>
                <div className="mcard-row"><span className="mcard-k">성분명</span><span className="mcard-v">{row.ingredient}</span></div>
                <div className="mcard-row">
                  <span className="mcard-k">생동</span>
                  <span className="mcard-v">
                    <FlagBadge value={row.id ? flags[row.id]?.isBioequiv ?? null : (row.isBioequiv ?? null)} label="생동" falseText="-"
                      editable={isAdmin && !!row.id} onClick={() => cycleFlag(row.id, 'is_bioequiv', row.id ? flags[row.id]?.isBioequiv ?? null : null)} />
                  </span>
                </div>
                <div className="mcard-row">
                  <span className="mcard-k">DMF</span>
                  <span className="mcard-v">
                    <FlagBadge value={row.id ? flags[row.id]?.hasDmf ?? null : (row.hasDmf ?? null)} label="DMF"
                      editable={isAdmin && !!row.id} onClick={() => cycleFlag(row.id, 'has_dmf', row.id ? flags[row.id]?.hasDmf ?? null : null)} />
                  </span>
                </div>
                <div className="mcard-row">
                  <span className="mcard-k">대조약</span>
                  <span className="mcard-v">
                    <FlagBadge value={row.id ? flags[row.id]?.isReference ?? null : (row.isReference ?? null)} label="대조약"
                      editable={isAdmin && !!row.id} onClick={() => cycleFlag(row.id, 'is_reference_drug', row.id ? flags[row.id]?.isReference ?? null : null)} />
                  </span>
                </div>
                <div className="mcard-row"><span className="mcard-k">제조원</span><span className="mcard-v">{row.maker || '—'}</span></div>
                <div className="mcard-row">
                  <span className="mcard-k">생산</span>
                  <span className="mcard-v">
                    {row.isConsignment == null ? <span style={{ color: '#94a3b8' }}>—</span> : (
                      <span style={{
                        fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', whiteSpace: 'nowrap',
                        background: row.isConsignment ? 'rgba(251,191,36,0.12)' : 'rgba(52,211,153,0.12)',
                        color: row.isConsignment ? '#b45309' : '#15803d',
                      }}>{row.isConsignment ? '위탁' : '자사'}</span>
                    )}
                  </span>
                </div>
                <div className="mcard-row"><span className="mcard-k">허가일자</span><span className="mcard-v" style={{ fontFamily: 'monospace' }}>{fmtYmd(row.permitDate) || '—'}</span></div>
                <div className="mcard-row"><span className="mcard-k">포장</span><span className="mcard-v">{row.packageUnit || '—'}</span></div>
                <div className="mcard-row"><span className="mcard-k">수수료율</span><span className="mcard-v" style={{ color: '#2563eb', fontWeight: 600 }}>{row.rate > 0 ? `${(row.rate * 100).toFixed(1)}%` : '—'}</span></div>
                <div className="mcard-row">
                  <span className="mcard-k">유통여부</span>
                  <span className="mcard-v">
                    {row.distribution ? (
                      <span style={{
                        fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '4px',
                        background: ds.bg, color: ds.color, whiteSpace: 'nowrap',
                      }}>{row.distribution}</span>
                    ) : '—'}
                  </span>
                </div>
                <div className="mcard-row"><span className="mcard-k">참고사항</span><span className="mcard-v">{row.note || '—'}</span></div>
              </div>
            );
          })}
        </div>
       </>
      )}

      <style>{`
        input::placeholder { color: #94a3b8; }
        input:focus { border-color: #2563eb !important; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
      `}</style>
    </div>
  );
}

function FlagBadge({ value, label, editable, onClick, falseText = '아니오' }: {
  value: boolean | null; label: string; editable: boolean; onClick: () => void; falseText?: string;
}) {
  const style = value === true
    ? { color: '#15803d', bg: 'rgba(52,211,153,0.14)', text: label }
    : value === false
    ? { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', text: falseText }
    : { color: '#94a3b8', bg: 'transparent', text: '—' };
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
  padding: '0.45rem 0.7rem', fontSize: '0.72rem', color: '#475569',
  fontWeight: 600, borderBottom: '1px solid #e5e9f0', whiteSpace: 'nowrap', textAlign: 'left',
};
const td: React.CSSProperties = {
  padding: '0.4rem 0.7rem', fontSize: '0.83rem', color: '#111827',
  borderBottom: '1px solid #eaeef4', verticalAlign: 'middle',
};
