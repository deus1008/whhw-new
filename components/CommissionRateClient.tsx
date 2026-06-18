'use client';

import { useState, useMemo } from 'react';
import { getCommissionFileUrl } from '@/app/commission-rate/actions';
import type { CommissionDoc, CommissionFolderGroup } from '@/app/commission-rate/types';

/* ── 검색 대상 컬럼 ── */
const SEARCH_COLS = ['구분', '계열', '제품군별', '품목명', '성분명(한글)', '성분명(영문)', '위탁여부'];

function normalizeHeader(s: string): string {
  return s.replace(/\s/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
}

const NORM_SEARCH = SEARCH_COLS.map(normalizeHeader);

type Row = Record<string, string>;

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/* ── 단일 폴더 뷰 ── */
function FolderView({ docs, folderName }: { docs: CommissionDoc[]; folderName: string }) {
  const [selectedId, setSelectedId] = useState<string>(docs[0]?.id ?? '');
  const [rows, setRows]             = useState<Row[]>([]);
  const [headers, setHeaders]       = useState<string[]>([]);
  const [normHeaders, setNormHeaders] = useState<string[]>([]);
  const [query, setQuery]           = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [loaded, setLoaded]         = useState(false);

  function handleDocChange(id: string) {
    setSelectedId(id);
    setRows([]); setHeaders([]); setNormHeaders([]);
    setQuery(''); setAppliedQuery(''); setLoaded(false); setError('');
  }

  function handleSearch() {
    setAppliedQuery(query.trim());
  }

  async function handleLoad() {
    if (!selectedId) return;
    setLoading(true); setError('');
    try {
      const { url, error: urlErr } = await getCommissionFileUrl(selectedId);
      if (urlErr || !url) throw new Error(urlErr ?? 'URL 발급 실패');

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`파일 다운로드 실패 (HTTP ${resp.status})`);

      const buf  = await resp.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (raw.length < 2) throw new Error('시트에 데이터가 없습니다.');

      // 헤더 행 자동 감지
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(10, raw.length); i++) {
        const row = raw[i] as string[];
        const normalized = row.map(c => normalizeHeader(String(c ?? '')));
        if (NORM_SEARCH.some(s => normalized.includes(s))) { headerRowIdx = i; break; }
      }

      const rawHeaders = (raw[headerRowIdx] as string[]).map(c => String(c ?? '').trim());
      const normalizedHdrs = rawHeaders.map(normalizeHeader);

      // 수수료율 컬럼 감지: Excel 퍼센트 셀은 소수로 저장됨 (0.70 = 70%)
      const rateColIdx = new Set<number>();
      for (let j = 0; j < rawHeaders.length; j++) {
        const norm = normalizeHeader(rawHeaders[j]);
        if (norm.includes('수수료율') || norm.includes('수수료(%)') || norm.endsWith('율(%)')) {
          rateColIdx.add(j);
        }
      }

      const dataRows: Row[] = [];
      for (let i = headerRowIdx + 1; i < raw.length; i++) {
        const cells = raw[i] as unknown[];
        const obj: Row = {};
        for (let j = 0; j < rawHeaders.length; j++) {
          if (!rawHeaders[j]) continue;
          const raw_val = cells[j];
          if (rateColIdx.has(j) && typeof raw_val === 'number' && raw_val > 0 && raw_val < 1) {
            obj[rawHeaders[j]] = `${Math.round(raw_val * 100)}%`;
          } else if (typeof raw_val === 'number') {
            obj[rawHeaders[j]] = Math.round(raw_val).toLocaleString('ko-KR');
          } else {
            obj[rawHeaders[j]] = String(raw_val ?? '').trim();
          }
        }
        if (Object.values(obj).every(v => v === '')) continue;
        dataRows.push(obj);
      }

      setHeaders(rawHeaders.filter(Boolean));
      setNormHeaders(normalizedHdrs);
      setRows(dataRows);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일 처리 오류');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = appliedQuery.toLowerCase();
    if (!q) return rows;
    return rows.filter(row =>
      headers.some((h, i) => NORM_SEARCH.includes(normHeaders[i]) && row[h]?.toLowerCase().includes(q))
    );
  }, [rows, appliedQuery, headers, normHeaders]);

  const displayHeaders = useMemo(() => {
    if (!headers.length) return [];
    const searchOnes = headers.filter((_, i) => NORM_SEARCH.includes(normHeaders[i]));
    const rest = headers.filter((_, i) => !NORM_SEARCH.includes(normHeaders[i]));
    return [...searchOnes, ...rest];
  }, [headers, normHeaders]);

  if (docs.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '3rem 0' }}>
        <p style={{ marginBottom: '0.4rem' }}>📂</p>
        <p style={{ fontSize: '0.88rem' }}>
          문서관리 &gt; <strong>{folderName}</strong> 폴더에 Excel 파일이 없습니다.
        </p>
        <p style={{ fontSize: '0.78rem', marginTop: '0.3rem', color: 'rgba(255,255,255,0.25)' }}>
          .xlsx / .xls / .xlsb 파일을 먼저 업로드해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* 파일 선택 */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <select value={selectedId} onChange={e => handleDocChange(e.target.value)} style={SELECT_STYLE}>
          {docs.map(d => (
            <option key={d.id} value={d.id}>{d.filename}  ({fmtDate(d.created_at)})</option>
          ))}
        </select>
        <button
          onClick={handleLoad}
          disabled={loading || !selectedId}
          style={{ ...LOAD_BTN, opacity: loading || !selectedId ? 0.5 : 1, cursor: loading || !selectedId ? 'not-allowed' : 'pointer' }}
        >
          {loading ? '불러오는 중…' : '📊 파일 불러오기'}
        </button>
      </div>
      {error && <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.8rem' }}>{error}</p>}

      {/* 데이터 테이블 */}
      {loaded && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2e8f0', flexShrink: 0 }}>
              총 {rows.length.toLocaleString()}건
              {appliedQuery && ` · 검색 ${filtered.length.toLocaleString()}건`}
            </span>
            <div style={{ flex: 1, minWidth: '200px', maxWidth: '400px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>🔍</span>
              <input
                type="text" value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="구분·계열·제품군·품목명·성분명·위탁여부 검색"
                style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '2rem', paddingRight: query ? '2rem' : '0.75rem', paddingTop: '0.42rem', paddingBottom: '0.42rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.82rem', outline: 'none' }}
              />
              {query && (
                <button onClick={() => { setQuery(''); setAppliedQuery(''); }} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
              )}
            </div>
            <button
              onClick={handleSearch}
              style={{ padding: '0.42rem 1rem', borderRadius: '8px', flexShrink: 0, background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))', border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              검색
            </button>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {SEARCH_COLS.map(col => (
                <span key={col} style={{ padding: '0.12rem 0.5rem', borderRadius: '100px', fontSize: '0.67rem', fontWeight: 600, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', color: '#93c5fd' }}>{col}</span>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', padding: '2.5rem 0', fontSize: '0.88rem' }}>검색 결과가 없습니다.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, width: '3rem', textAlign: 'center' }}>No.</th>
                    {displayHeaders.map(h => (
                      <th key={h} style={{ ...TH, color: SEARCH_COLS.includes(h) ? '#93c5fd' : 'rgba(255,255,255,0.4)', borderBottom: SEARCH_COLS.includes(h) ? '2px solid rgba(96,165,250,0.4)' : '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                      <td style={{ ...TD, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>{i + 1}</td>
                      {displayHeaders.map(h => {
                        const val = row[h] ?? '';
                        const isSearch = SEARCH_COLS.includes(h);
                        const isNumeric = /^[\d,]+$/.test(val);
                        const isPct = /^[\d,]+%$/.test(val);
                        const align = isPct ? 'center' : isNumeric ? 'right' : 'left';
                        const hl = query ? highlight(val, query) : null;
                        return (
                          <td key={h} style={{ ...TD, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: align }}>
                            {hl ? <span dangerouslySetInnerHTML={{ __html: hl }} /> : <span style={{ color: isSearch ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)' }}>{val}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
export default function CommissionRateClient({ folderGroups }: { folderGroups: CommissionFolderGroup[] }) {
  const [activeKey, setActiveKey] = useState<CommissionFolderGroup['key']>('dealer');
  const active = folderGroups.find(g => g.key === activeKey) ?? folderGroups[0];

  return (
    <div>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {folderGroups.map(g => (
          <button
            key={g.key}
            onClick={() => setActiveKey(g.key)}
            style={{
              padding: '0.55rem 1.1rem', borderRadius: '10px', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
              border: activeKey === g.key ? '1px solid rgba(96,165,250,0.5)' : '1px solid rgba(255,255,255,0.1)',
              background: activeKey === g.key ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
              color: activeKey === g.key ? '#93c5fd' : 'rgba(255,255,255,0.5)',
              transition: 'all 0.15s',
            }}
          >
            {g.label}
            <span style={{
              marginLeft: '0.45rem', padding: '0.1rem 0.5rem', borderRadius: '100px',
              fontSize: '0.68rem', fontWeight: 600,
              background: activeKey === g.key ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.06)',
              color: activeKey === g.key ? '#93c5fd' : 'rgba(255,255,255,0.35)',
            }}>
              {g.docs.length}개
            </span>
          </button>
        ))}
      </div>

      {/* 설명 */}
      {active && (
        <div style={{
          padding: '0.65rem 1rem', borderRadius: '8px', marginBottom: '1rem',
          background: activeKey === 'dealer' ? 'rgba(96,165,250,0.07)' : 'rgba(251,191,36,0.07)',
          border: activeKey === 'dealer' ? '1px solid rgba(96,165,250,0.2)' : '1px solid rgba(251,191,36,0.2)',
          fontSize: '0.78rem',
          color: activeKey === 'dealer' ? '#93c5fd' : '#fde68a',
        }}>
          <strong>📁 {active.folderName}</strong>
          <span style={{ marginLeft: '0.6rem', opacity: 0.8 }}>{active.description}</span>
        </div>
      )}

      {/* 콘텐츠 */}
      <div className="auth-card">
        {active && <FolderView key={active.key} docs={active.docs} folderName={active.folderName} />}
      </div>
    </div>
  );
}

/* ── 유틸 ── */
function highlight(val: string, q: string): string | null {
  if (!val || !q) return null;
  const idx = val.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;
  return `${escHtml(val.slice(0, idx))}<mark style="background:rgba(251,191,36,0.35);color:#fde68a;border-radius:2px;padding:0 1px">${escHtml(val.slice(idx, idx + q.length))}</mark>${escHtml(val.slice(idx + q.length))}`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── 스타일 ── */
const SELECT_STYLE: React.CSSProperties = {
  flex: 1, minWidth: '200px',
  padding: '0.55rem 0.75rem', borderRadius: '10px',
  background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'inherit',
  outline: 'none', cursor: 'pointer',
};

const LOAD_BTN: React.CSSProperties = {
  padding: '0.55rem 1.2rem', borderRadius: '10px', flexShrink: 0,
  background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))',
  border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
};

const TH: React.CSSProperties = {
  padding: '0.6rem 0.85rem', textAlign: 'left', fontWeight: 700,
  fontSize: '0.75rem', letterSpacing: '0.02em',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.5)',
  background: 'rgba(255,255,255,0.03)',
  position: 'sticky', top: 0, whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '0.5rem 0.85rem',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.75)',
  verticalAlign: 'middle',
};
