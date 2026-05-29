'use client';

import { useState, useRef, useTransition } from 'react';
import type { MedicalItem } from '@/app/api/medical-search/route';

/* ── 종별코드 → 배지 색 ────────────────────────────────────── */
function clBadgeStyle(clCdNm: string): React.CSSProperties {
  if (clCdNm.includes('상급종합') || clCdNm.includes('종합병원'))
    return { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', color: '#fca5a5' };
  if (clCdNm.includes('병원'))
    return { background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.28)', color: '#fdba74' };
  if (clCdNm.includes('의원'))
    return { background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.24)', color: '#6ee7b7' };
  if (clCdNm.includes('한방') || clCdNm.includes('한의원'))
    return { background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.28)', color: '#c4b5fd' };
  if (clCdNm.includes('치과'))
    return { background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.24)', color: '#67e8f9' };
  if (clCdNm.includes('약국'))
    return { background: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.28)', color: '#fde047' };
  return { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' };
}

type SearchType = 'hospital' | 'pharmacy';

export default function MedicalSearchClient({ apiConfigured }: { apiConfigured: boolean }) {
  const [query, setQuery]           = useState('');
  const [searchType, setSearchType] = useState<SearchType>('hospital');
  const [items, setItems]           = useState<MedicalItem[]>([]);
  const [total, setTotal]           = useState(0);
  const [scanned, setScanned]       = useState(0);   // 약국 전용: 스캔한 레코드 수
  const [page, setPage]             = useState(1);
  const [error, setError]           = useState('');
  const [searched, setSearched]     = useState('');
  const [searchedType, setSearchedType] = useState<SearchType>('hospital');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function doSearch(q: string, type: SearchType, pg = 1) {
    if (!q.trim()) return;
    setError('');
    startTransition(async () => {
      try {
        const res  = await fetch(`/api/medical-search?q=${encodeURIComponent(q)}&type=${type}&page=${pg}`);
        const data = await res.json();
        if (data.error) { setError(data.error); setItems([]); setTotal(0); return; }
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setScanned(data.scanned ?? 0);
        setPage(pg);
        setSearched(q);
        setSearchedType(type);
      } catch {
        setError('검색 중 오류가 발생했습니다.');
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query, searchType);
  }

  // 탭 전환 시 기존 결과 초기화
  function switchTab(type: SearchType) {
    setSearchType(type);
    setItems([]); setTotal(0); setError(''); setSearched('');
    inputRef.current?.focus();
  }

  const totalPages = Math.ceil(total / 12);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.45rem 1.2rem', borderRadius: '8px 8px 0 0',
    fontSize: '0.85rem', fontWeight: active ? 700 : 500,
    background: active ? 'rgba(34,211,238,0.12)' : 'transparent',
    border: `1px solid ${active ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.1)'}`,
    borderBottom: active ? '1px solid transparent' : undefined,
    color: active ? '#67e8f9' : 'var(--text-muted)',
    cursor: 'pointer', fontFamily: 'inherit',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* 검색 헤더 */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, overflow: 'hidden',
      }}>
        {/* 탭 */}
        <div style={{
          display: 'flex', gap: '0.3rem', padding: '0.8rem 1.2rem 0',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <button style={tabStyle(searchType === 'hospital')} onClick={() => switchTab('hospital')}>
            🏥 병원 · 의원
          </button>
          <button style={tabStyle(searchType === 'pharmacy')} onClick={() => switchTab('pharmacy')}>
            💊 약국
          </button>
        </div>

        <div style={{ padding: '1rem 1.2rem 1.2rem' }}>
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
            {searchType === 'hospital'
              ? '병원명·의원명으로 검색 — 종합병원, 병원, 의원, 한의원, 치과 포함'
              : '약국명으로 검색 — 전국 약국 정보 조회'}
          </p>

          {/* 검색창 */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.6rem' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchType === 'hospital'
                ? '기관명을 입력하세요 (예: 서울아산병원, 강남의원)'
                : '약국명을 입력하세요 (예: 온누리약국, 하나약국)'}
              style={{
                flex: 1, padding: '0.65rem 1rem', borderRadius: 10,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)'; }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            />
            <button
              type="submit"
              disabled={isPending || !query.trim()}
              style={{
                padding: '0.65rem 1.4rem', borderRadius: 10,
                cursor: (isPending || !query.trim()) ? 'not-allowed' : 'pointer',
                background: isPending ? 'rgba(34,211,238,0.06)' : 'rgba(34,211,238,0.14)',
                border: '1px solid rgba(34,211,238,0.35)', color: '#67e8f9',
                fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
                opacity: !query.trim() ? 0.45 : 1,
              }}
            >
              {isPending ? '검색 중…' : '검색'}
            </button>
          </form>

          {/* API 미설정 안내 */}
          {!apiConfigured && (
            <div style={{
              marginTop: '0.9rem', padding: '0.7rem 1rem', borderRadius: 10,
              background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)',
              fontSize: '0.78rem', color: '#fde68a', lineHeight: 1.6,
            }}>
              <strong>⚠ API 키 미설정</strong> — <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: 4 }}>MEDICAL_API_KEY</code> 환경변수를 설정해야 합니다.
              <br />Vercel 대시보드 → Settings → Environment Variables 에서 추가해 주세요.
            </div>
          )}
        </div>
      </div>

      {/* 오류 */}
      {error && (
        <div style={{
          padding: '0.8rem 1rem', borderRadius: 10,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#f87171', fontSize: '0.82rem',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* 스켈레톤 */}
      {isPending && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              borderRadius: 12, padding: '1rem', height: 120,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', opacity: 0.5,
            }} />
          ))}
        </div>
      )}

      {/* 결과 */}
      {!isPending && items.length > 0 && (
        <>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            &ldquo;{searched}&rdquo; {searchedType === 'hospital' ? '병원·의원' : '약국'} 검색 결과{' '}
            {total.toLocaleString()}건 (페이지 {page}/{totalPages})
            {searchedType === 'pharmacy' && scanned > 0 && (
              <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', opacity: 0.6 }}>
                · {scanned.toLocaleString()}건 샘플 스캔
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
            {items.map((item, idx) => (
              <MedicalCard key={item.ykiho || idx} item={item} />
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <PageBtn label="◀" disabled={page <= 1} onClick={() => doSearch(searched, searchedType, page - 1)} />
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(pg => (
                <PageBtn key={pg} label={String(pg)} active={pg === page} onClick={() => doSearch(searched, searchedType, pg)} />
              ))}
              {totalPages > 10 && <span style={{ color: 'var(--text-muted)', padding: '0 4px', lineHeight: '2rem' }}>…</span>}
              <PageBtn label="▶" disabled={page >= totalPages} onClick={() => doSearch(searched, searchedType, page + 1)} />
            </div>
          )}
        </>
      )}

      {/* 결과 없음 */}
      {!isPending && searched && items.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>🔍</div>
          <p style={{ fontSize: '0.88rem' }}>
            &ldquo;{searched}&rdquo;에 해당하는 {searchedType === 'hospital' ? '병원·의원' : '약국'}이 없습니다.
          </p>
          <p style={{ fontSize: '0.78rem', marginTop: '0.4rem', opacity: 0.6 }}>
            기관명 일부만 입력하거나 다른 검색어를 시도해 보세요.
            {searchedType === 'pharmacy' && (
              <><br />약국 검색은 전국 샘플 데이터 기반이며 일부 결과가 누락될 수 있습니다.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── 기관 카드 ────────────────────────────────────────────── */
function MedicalCard({ item }: { item: MedicalItem }) {
  const badge = clBadgeStyle(item.clCdNm);
  const region = [item.sidoCdNm, item.sgguCdNm].filter(Boolean).join(' ');

  return (
    <div style={{
      borderRadius: 12, padding: '1rem',
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
      transition: 'border-color 0.15s', display: 'flex', flexDirection: 'column', gap: '0.5rem',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
    >
      {/* 종별 배지 + 기관명 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
        {item.clCdNm && (
          <span style={{
            ...badge, flexShrink: 0,
            padding: '0.12rem 0.5rem', borderRadius: 5, fontSize: '0.67rem', fontWeight: 600,
          }}>
            {item.clCdNm}
          </span>
        )}
        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, margin: 0 }}>
          {item.yadmNm}
        </p>
      </div>

      {/* 진료과목 */}
      {item.dgsbjtCdNm && (
        <p style={{ fontSize: '0.73rem', color: '#67e8f9', margin: 0, opacity: 0.85 }}>
          📋 {item.dgsbjtCdNm}
        </p>
      )}

      {/* 주소 */}
      {item.addr && (
        <p style={{ fontSize: '0.76rem', color: 'rgba(240,244,255,0.65)', margin: 0, lineHeight: 1.4 }}>
          📍 {item.addr}
        </p>
      )}

      {/* 전화번호 + 지역 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        {item.telno ? (
          <a
            href={`tel:${item.telno}`}
            style={{ fontSize: '0.78rem', color: '#6ee7b7', textDecoration: 'none', fontWeight: 500 }}
          >
            📞 {item.telno}
          </a>
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>전화번호 없음</span>
        )}
        {region && (
          <span style={{ fontSize: '0.69rem', color: 'var(--text-muted)', opacity: 0.7 }}>
            {region}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── 페이지 버튼 ────────────────────────────────────────────── */
function PageBtn({ label, active, disabled, onClick }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 36, height: 36, borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: active ? 700 : 400,
        background: active ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? '#67e8f9' : disabled ? 'rgba(107,122,153,0.4)' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  );
}
