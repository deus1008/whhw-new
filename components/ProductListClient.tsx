'use client';

import { useState, useMemo } from 'react';

export type ProductRow = {
  제조사:       string;
  품목그룹:     string;
  품목명:       string;
  성분명:       string;
  보험코드:     string;
  규격:         string;
  급여:         string;
  약가:         string;
  사용:         string;
  비고:         string;
  // 검색 전용 (비표시)
  _내부품목명:  string;
  _대표코드:    string;
};

const COLS: { key: keyof ProductRow; label: string; style?: React.CSSProperties }[] = [
  { key: '제조사',   label: '제조사',       style: { minWidth: '90px' } },
  { key: '품목그룹', label: '품목그룹',      style: { minWidth: '80px' } },
  { key: '품목명',   label: '품목명',       style: { minWidth: '200px', fontWeight: 600 } },
  { key: '성분명',   label: '성분명',       style: { minWidth: '140px' } },
  { key: '보험코드', label: '보험코드',      style: { minWidth: '110px' } },
  { key: '규격',     label: '규격',        style: { minWidth: '80px' } },
  { key: '급여',     label: '급여',        style: { minWidth: '60px', textAlign: 'center' } },
  { key: '약가',     label: '약가(원)',     style: { minWidth: '70px', textAlign: 'right' } },
  { key: '비고',     label: '비고',        style: { minWidth: '120px' } },
];

export default function ProductListClient({
  rows,
  filename,
  signedUrl,
  updatedAt,
}: {
  rows: ProductRow[];
  filename: string;
  signedUrl: string | null;
  updatedAt: string;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.제조사.toLowerCase().includes(q) ||
      r.품목명.toLowerCase().includes(q) ||
      r._내부품목명.toLowerCase().includes(q) ||
      r.성분명.toLowerCase().includes(q) ||
      r.보험코드.toLowerCase().includes(q) ||
      r._대표코드.toLowerCase().includes(q) ||
      r.비고.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div>
      {/* 검색 + 다운로드 */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{
            position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
            color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="품목명, 성분명, 제조사, 보험코드 검색..."
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

      {/* 결과 카운트 + 기준일 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          {query
            ? <><span style={{ color: '#a5b4fc', fontWeight: 600 }}>{filtered.length.toLocaleString()}</span>건 검색됨 / 전체 {rows.length.toLocaleString()}건</>
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
                <th style={{ padding: '0.45rem 0.6rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', minWidth: '32px' }}>
                  #
                </th>
                {COLS.map(c => (
                  <th key={c.key} style={{ padding: '0.45rem 0.6rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', ...c.style, textAlign: (c.style?.textAlign as React.CSSProperties['textAlign']) ?? 'left' }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)';
                const inUse = row.사용 === '0' || row.사용.toLowerCase() === 'false';
                return (
                  <tr key={i} style={{ background: bg, opacity: inUse ? 0.45 : 1 }}>
                    <td style={{ padding: '0.38rem 0.6rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                      {i + 1}
                    </td>
                    {COLS.map(c => (
                      <td key={c.key} style={{ padding: '0.38rem 0.6rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle', ...c.style, fontWeight: c.key === '품목명' ? 600 : 'normal' }}>
                        {c.key === '급여' ? (
                          <span style={{
                            fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '3px',
                            background: row[c.key] === '급여' ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)',
                            color: row[c.key] === '급여' ? '#4ade80' : 'rgba(255,255,255,0.5)',
                            whiteSpace: 'nowrap',
                          }}>
                            {row[c.key] || '-'}
                          </span>
                        ) : c.key === '약가' ? (
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {row[c.key] && row[c.key] !== '0' && row[c.key] !== ''
                              ? Number(row[c.key]).toLocaleString()
                              : <span style={{ color: 'rgba(255,255,255,0.25)' }}>-</span>}
                          </span>
                        ) : (
                          <span style={{ whiteSpace: c.key === '품목명' || c.key === '성분명' ? 'normal' : 'nowrap' }}>
                            {row[c.key] || <span style={{ color: 'rgba(255,255,255,0.2)' }}>-</span>}
                          </span>
                        )}
                      </td>
                    ))}
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
