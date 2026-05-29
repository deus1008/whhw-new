'use client';

import { useState, useRef, useTransition } from 'react';
import Image from 'next/image';
import type { DrugItem } from '@/app/api/drug-search/route';

const NEDRUG_DETAIL = (seq: string) =>
  `https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=${seq}`;
const NEDRUG_SEARCH = (q: string) =>
  `https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?searchYearly=&opYes=&division=all&search1=&text1=${encodeURIComponent(q)}&search2=&search3=&page=1`;

const hasApiKey: boolean = !!process.env.NEXT_PUBLIC_DRUG_API_CONFIGURED;

export default function DrugSearchClient({ apiConfigured }: { apiConfigured: boolean }) {
  const [query, setQuery]           = useState('');
  const [items, setItems]           = useState<DrugItem[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [error, setError]           = useState('');
  const [searched, setSearched]     = useState('');
  const [searchNote, setSearchNote] = useState('');   // 업체명 검색 시 안내
  const [notInEasyDb, setNotInEasyDb] = useState(false); // 미등재 품목 안내
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function doSearch(q: string, pg = 1) {
    if (!q.trim()) return;
    setError(''); setSearchNote(''); setNotInEasyDb(false);
    startTransition(async () => {
      try {
        const res  = await fetch(`/api/drug-search?q=${encodeURIComponent(q)}&page=${pg}`);
        const data = await res.json();
        if (data.error) { setError(data.error); setItems([]); setTotal(0); return; }
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(pg);
        setSearched(q);
        setExpanded(null);
        setSearchNote(data.searchNote ?? '');
        setNotInEasyDb(!!data.notInEasyDb);
      } catch {
        setError('검색 중 오류가 발생했습니다.');
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query);
  }

  const totalPages = Math.ceil(total / 12);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* 검색 헤더 */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1.2rem 1.4rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              💊 의약품 검색
            </h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              식품의약품안전처 공공데이터 기반 · 의약품 효능·용법·주의사항 조회
            </p>
          </div>
          <a
            href="https://nedrug.mfds.go.kr/index"
            target="_blank" rel="noopener noreferrer"
            style={{
              padding: '0.38rem 0.9rem', borderRadius: 8, fontSize: '0.78rem',
              background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.28)',
              color: '#6ee7b7', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap',
            }}
          >
            🌐 의약품안전나라
          </a>
        </div>

        {/* 검색창 */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.6rem' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="의약품명을 입력하세요 (예: 타이레놀, 아스피린)"
            style={{
              flex: 1, padding: '0.65rem 1rem', borderRadius: 10,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(52,211,153,0.5)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          />
          <button
            type="submit"
            disabled={isPending || !query.trim()}
            style={{
              padding: '0.65rem 1.4rem', borderRadius: 10, cursor: isPending ? 'not-allowed' : 'pointer',
              background: isPending ? 'rgba(52,211,153,0.08)' : 'rgba(52,211,153,0.18)',
              border: '1px solid rgba(52,211,153,0.35)', color: '#6ee7b7',
              fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
              opacity: (!query.trim()) ? 0.45 : 1,
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
            <strong>⚠ API 키 미설정</strong> — 검색 결과를 앱 내에서 보려면 환경변수 <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: 4 }}>DRUG_API_KEY</code>를 설정해야 합니다.
            {' '}<a href="https://www.data.go.kr/data/15075057/openapi.do" target="_blank" rel="noopener noreferrer"
              style={{ color: '#fbbf24', textDecoration: 'underline' }}>data.go.kr에서 키 발급 →</a>
            <br />지금은 아래에서 직접 의약품안전나라로 이동해 검색할 수 있습니다.
          </div>
        )}
      </div>

      {/* 오류 메시지 */}
      {error && (
        <div style={{
          padding: '0.8rem 1rem', borderRadius: 10,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#f87171', fontSize: '0.82rem',
        }}>
          ⚠ {error}
          {error.includes('API 키') && (
            <span> — <a href="https://www.data.go.kr/data/15075057/openapi.do" target="_blank" rel="noopener noreferrer"
              style={{ color: '#fbbf24', textDecoration: 'underline' }}>API 키 발급 방법</a></span>
          )}
        </div>
      )}

      {/* API 미설정 시 사이트 직접 검색 */}
      {!apiConfigured && query.trim() && (
        <div style={{ textAlign: 'center' }}>
          <a
            href={NEDRUG_SEARCH(query)}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1.8rem', borderRadius: 12,
              background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.32)',
              color: '#6ee7b7', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none',
            }}
          >
            🌐 의약품안전나라에서 &quot;{query}&quot; 검색하기
          </a>
        </div>
      )}

      {/* 검색 중 스켈레톤 */}
      {isPending && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              borderRadius: 12, padding: '1rem',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              height: 160, opacity: 0.5,
            }} />
          ))}
        </div>
      )}

      {/* 검색 결과 */}
      {!isPending && items.length > 0 && (
        <>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
            {searchNote ? (
              <span style={{ color: '#fbbf24' }}>ℹ {searchNote}&nbsp;&nbsp;</span>
            ) : null}
            &ldquo;{searched}&rdquo; 검색 결과 {total.toLocaleString()}건 (페이지 {page}/{totalPages})
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {items.map(item => (
              <DrugCard
                key={item.itemSeq}
                item={item}
                expanded={expanded === item.itemSeq}
                onToggle={() => setExpanded(prev => prev === item.itemSeq ? null : item.itemSeq)}
              />
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <PageBtn label="◀" disabled={page <= 1} onClick={() => doSearch(searched, page - 1)} />
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(pg => (
                <PageBtn key={pg} label={String(pg)} active={pg === page} onClick={() => doSearch(searched, pg)} />
              ))}
              {totalPages > 10 && <span style={{ color: 'var(--text-muted)', padding: '0 4px', lineHeight: '2rem' }}>…</span>}
              <PageBtn label="▶" disabled={page >= totalPages} onClick={() => doSearch(searched, page + 1)} />
            </div>
          )}
        </>
      )}

      {/* 결과 없음 */}
      {!isPending && searched && items.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>🔍</div>
          <p style={{ fontSize: '0.88rem', marginBottom: '0.5rem' }}>
            &ldquo;{searched}&rdquo;에 해당하는 의약품이 없습니다.
          </p>
          {notInEasyDb && (
            <div style={{
              margin: '0.8rem auto', maxWidth: 480, padding: '0.75rem 1rem', borderRadius: 10,
              background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)',
              fontSize: '0.78rem', color: '#fde68a', lineHeight: 1.7, textAlign: 'left',
            }}>
              <strong>⚠ 이 API에 등재되지 않은 품목입니다.</strong><br />
              공공데이터포털의 "쉬운 의약품 정보" API는 전체 의약품의 일부만 포함합니다.<br />
              아래 의약품안전나라에서 직접 검색하거나, 성분명·업체명으로 다시 검색해 보세요.
            </div>
          )}
          <a
            href={NEDRUG_SEARCH(searched)}
            target="_blank" rel="noopener noreferrer"
            style={{
              marginTop: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 1.2rem', borderRadius: 10,
              background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.28)',
              color: '#6ee7b7', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none',
            }}
          >
            🌐 의약품안전나라에서 &ldquo;{searched}&rdquo; 검색 →
          </a>
        </div>
      )}
    </div>
  );
}

/* ── 의약품 카드 ────────────────────────────────────────────── */
function DrugCard({ item, expanded, onToggle }: {
  item: DrugItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(52,211,153,0.3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
    >
      {/* 이미지 */}
      {item.itemImage && (
        <div style={{ background: 'rgba(255,255,255,0.04)', height: 110, position: 'relative', overflow: 'hidden' }}>
          <Image
            src={item.itemImage}
            alt={item.itemName}
            fill
            style={{ objectFit: 'contain', padding: '6px' }}
            unoptimized
          />
        </div>
      )}

      <div style={{ padding: '0.9rem 1rem' }}>
        {/* 이름 + 업체 */}
        <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem', lineHeight: 1.35 }}>
          {item.itemName}
        </p>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
          {item.entpName}
          {item.updateDe && <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>· {item.updateDe.slice(0, 4)}.{item.updateDe.slice(4, 6)}.{item.updateDe.slice(6, 8)}</span>}
        </p>

        {/* 효능효과 미리보기 */}
        {item.efcyQesitm && (
          <p style={{
            fontSize: '0.76rem', color: 'rgba(240,244,255,0.65)', lineHeight: 1.55,
            marginBottom: '0.7rem',
            display: '-webkit-box', WebkitLineClamp: expanded ? undefined : 2,
            WebkitBoxOrient: 'vertical', overflow: expanded ? 'visible' : 'hidden',
          }}>
            {item.efcyQesitm}
          </p>
        )}

        {/* 상세 펼치기 */}
        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '0.7rem' }}>
            {item.useMethodQesitm  && <Detail label="용법·용량" text={item.useMethodQesitm} />}
            {item.atpnWarnQesitm   && <Detail label="⚠ 주의사항 경고" text={item.atpnWarnQesitm} warn />}
            {item.atpnQesitm       && <Detail label="주의사항" text={item.atpnQesitm} />}
            {item.intrcQesitm      && <Detail label="상호작용" text={item.intrcQesitm} />}
            {item.seQesitm         && <Detail label="부작용" text={item.seQesitm} />}
            {item.depositMethodQesitm && <Detail label="보관방법" text={item.depositMethodQesitm} />}
          </div>
        )}

        {/* 버튼 영역 */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {(item.efcyQesitm || item.useMethodQesitm) && (
            <button
              onClick={onToggle}
              style={{
                flex: 1, padding: '0.42rem 0', borderRadius: 8, cursor: 'pointer',
                background: expanded ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${expanded ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: expanded ? '#6ee7b7' : 'var(--text-muted)',
                fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 500,
              }}
            >
              {expanded ? '접기 ▲' : '상세보기 ▼'}
            </button>
          )}
          <a
            href={NEDRUG_DETAIL(item.itemSeq)}
            target="_blank" rel="noopener noreferrer"
            style={{
              flex: 1, padding: '0.42rem 0', borderRadius: 8, textAlign: 'center',
              background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.22)',
              color: '#6ee7b7', fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none',
            }}
          >
            안전나라 ↗
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── 상세 항목 ──────────────────────────────────────────────── */
function Detail({ label, text, warn }: { label: string; text: string; warn?: boolean }) {
  return (
    <div style={{
      padding: '0.5rem 0.7rem', borderRadius: 8,
      background: warn ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${warn ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <p style={{ fontSize: '0.68rem', fontWeight: 600, color: warn ? '#fca5a5' : 'var(--text-muted)', marginBottom: '0.25rem' }}>{label}</p>
      <p style={{ fontSize: '0.74rem', color: 'rgba(240,244,255,0.7)', lineHeight: 1.55, margin: 0 }}>{text}</p>
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
        minWidth: 36, height: 36, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: active ? 700 : 400,
        background: active ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? '#6ee7b7' : disabled ? 'rgba(107,122,153,0.4)' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  );
}
