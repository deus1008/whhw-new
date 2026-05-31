'use client';

import { useState, useRef, useTransition } from 'react';
import type { DrugItem } from '@/app/api/drug-search/route';
import type { DrugInfoResponse, PriceItem } from '@/app/api/drug-info/route';

const NEDRUG_DETAIL = (seq: string) =>
  `https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=${seq}`;
const NEDRUG_SEARCH = (q: string) =>
  `https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?searchYearly=&opYes=&division=all&search1=&text1=${encodeURIComponent(q)}&search2=&search3=&page=1`;

type DrugInfoState = { loading: boolean; data?: DrugInfoResponse; error?: string };

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  const c = d.replace(/-/g, '');
  if (c.length < 8) return d;
  return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 8)}`;
}

export default function DrugSearchClient({ apiConfigured }: { apiConfigured: boolean }) {
  const [query, setQuery]             = useState('');
  const [items, setItems]             = useState<DrugItem[]>([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [error, setError]             = useState('');
  const [searched, setSearched]       = useState('');
  const [searchNote, setSearchNote]   = useState('');
  const [notInAnyDb, setNotInAnyDb]   = useState(false);
  const [source, setSource]           = useState<'easyDrug' | 'prmsn' | 'nedrug' | ''>('');
  const [drugInfoMap, setDrugInfoMap] = useState<Record<string, DrugInfoState>>({});
  const [isPending, startTransition]  = useTransition();

  const loadingKeysRef = useRef(new Set<string>());

  /* ── 약가·생동·DMF 로드 ── */
  async function loadDrugInfo(item: DrugItem) {
    const key = item.itemSeq;
    if (loadingKeysRef.current.has(key)) return;
    loadingKeysRef.current.add(key);

    setDrugInfoMap(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const params = new URLSearchParams({ item: item.itemName });
      if (item.ingrName) params.set('ingr', item.ingrName);
      const res  = await fetch(`/api/drug-info?${params}`);
      const data = await res.json() as DrugInfoResponse & { error?: string };
      if (data.error) {
        loadingKeysRef.current.delete(key);
        setDrugInfoMap(prev => ({ ...prev, [key]: { loading: false, error: data.error } }));
      } else {
        setDrugInfoMap(prev => ({ ...prev, [key]: { loading: false, data } }));
      }
    } catch {
      loadingKeysRef.current.delete(key);
      setDrugInfoMap(prev => ({ ...prev, [key]: { loading: false, error: '조회 실패' } }));
    }
  }

  /* ── 검색 ── */
  async function doSearch(q: string, pg = 1) {
    if (!q.trim()) return;
    setError(''); setSearchNote(''); setNotInAnyDb(false); setSource('');
    setDrugInfoMap({});
    loadingKeysRef.current.clear();

    startTransition(async () => {
      try {
        const res  = await fetch(`/api/drug-search?q=${encodeURIComponent(q)}&page=${pg}`);
        const data = await res.json();
        if (data.error) { setError(data.error); setItems([]); setTotal(0); return; }
        const newItems: DrugItem[] = data.items ?? [];
        setItems(newItems);
        setTotal(data.total ?? 0);
        setPage(pg);
        setSearched(q);
        setSearchNote(data.searchNote ?? '');
        setNotInAnyDb(!!data.notInAnyDb);
        setSource(data.source ?? '');
        newItems.forEach(item => loadDrugInfo(item));
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

      {/* ── 검색 헤더 ── */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1.2rem 1.4rem',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem',
        }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              💊 의약품 검색
            </h2>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              제품명 · 성분명 · 약가 · 생동여부 · 원료DMF 통합조회
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.6rem' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="의약품명을 입력하세요 (예: 크레트롤, 아스피린)"
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
              opacity: !query.trim() ? 0.45 : 1,
            }}
          >
            {isPending ? '검색 중…' : '검색'}
          </button>
        </form>

        {!apiConfigured && (
          <div style={{
            marginTop: '0.9rem', padding: '0.7rem 1rem', borderRadius: 10,
            background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)',
            fontSize: '0.78rem', color: '#fde68a', lineHeight: 1.6,
          }}>
            <strong>⚠ API 키 미설정</strong> — 환경변수{' '}
            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: 4 }}>DRUG_API_KEY</code>를 설정해야 검색이 가능합니다.
          </div>
        )}
      </div>

      {/* ── 오류 ── */}
      {error && (
        <div style={{
          padding: '0.8rem 1rem', borderRadius: 10,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#f87171', fontSize: '0.82rem',
        }}>⚠ {error}</div>
      )}

      {/* ── 로딩 스켈레톤 ── */}
      {isPending && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              borderRadius: 12, height: 200, opacity: 0.4,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }} />
          ))}
        </div>
      )}

      {/* ── 검색 결과 ── */}
      {!isPending && items.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {searchNote && <span style={{ color: '#fbbf24' }}>ℹ {searchNote}&nbsp;&nbsp;</span>}
              &ldquo;{searched}&rdquo; 검색 결과 {total.toLocaleString()}건
              {totalPages > 1 && <span> (페이지 {page}/{totalPages})</span>}
              {source === 'prmsn' && (
                <span style={{
                  marginLeft: '0.5rem', padding: '0.15rem 0.5rem', borderRadius: 5,
                  background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                  color: '#a5b4fc', fontSize: '0.7rem',
                }}>허가정보 DB</span>
              )}
            </div>
            <div style={{
              fontSize: '0.73rem', color: 'rgba(253,230,138,0.75)',
              padding: '0.3rem 0.7rem', borderRadius: 7,
              background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)',
              lineHeight: 1.5,
            }}>
              💡 동일제품 복수함량의 경우 1개의 함량을 생동 등재하면, 나머지 함량은 비교용출시험으로 생동한 것으로 간주됩니다.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
            {items.map(item => (
              <DrugCard
                key={item.itemSeq}
                item={item}
                drugInfo={drugInfoMap[item.itemSeq]}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <PageBtn label="◀" disabled={page <= 1} onClick={() => doSearch(searched, page - 1)} />
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(pg => (
                <PageBtn key={pg} label={String(pg)} active={pg === page} onClick={() => doSearch(searched, pg)} />
              ))}
              {totalPages > 10 && (
                <span style={{ color: 'var(--text-muted)', padding: '0 4px', lineHeight: '2rem' }}>…</span>
              )}
              <PageBtn label="▶" disabled={page >= totalPages} onClick={() => doSearch(searched, page + 1)} />
            </div>
          )}
        </>
      )}

      {/* ── 결과 없음 ── */}
      {!isPending && searched && items.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>🔍</div>
          <p style={{ fontSize: '0.88rem', marginBottom: '0.5rem' }}>
            &ldquo;{searched}&rdquo;에 해당하는 의약품이 없습니다.
          </p>
          {notInAnyDb && (
            <div style={{
              margin: '0.8rem auto', maxWidth: 480, padding: '0.75rem 1rem', borderRadius: 10,
              background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)',
              fontSize: '0.78rem', color: '#fde68a', lineHeight: 1.7, textAlign: 'left',
            }}>
              <strong>⚠ 검색 결과가 없습니다.</strong><br />
              약품명 앞뒤 글자 일부만 입력하거나 성분명으로 검색해 보세요.
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

/* ════════════════════════════════════════
   의약품 카드
════════════════════════════════════════ */
function DrugCard({ item, drugInfo }: {
  item:      DrugItem;
  drugInfo?: DrugInfoState;
}) {
  const isPrescription = item.etcOtcCode?.includes('전문');
  const isOtc          = item.etcOtcCode?.includes('일반');

  const displayIngrName =
    item.ingrName ||
    drugInfo?.data?.bioEq?.[0]?.ingrName ||
    null;

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* ── 상단: 기본 정보 ── */}
      <div style={{ padding: '0.9rem 1rem 0.75rem' }}>

        {/* 전문/일반 배지 */}
        {(isPrescription || isOtc) && (
          <span style={{
            display: 'inline-block', marginBottom: '0.4rem',
            padding: '0.12rem 0.5rem', borderRadius: 5, fontSize: '0.67rem', fontWeight: 600,
            background: isPrescription ? 'rgba(239,68,68,0.12)' : 'rgba(52,211,153,0.10)',
            border: `1px solid ${isPrescription ? 'rgba(239,68,68,0.28)' : 'rgba(52,211,153,0.24)'}`,
            color: isPrescription ? '#fca5a5' : '#6ee7b7',
          }}>
            {isPrescription ? '전문의약품' : '일반의약품'}
          </span>
        )}

        {/* 제품명 */}
        <p style={{
          fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
          marginBottom: '0.22rem', lineHeight: 1.35,
        }}>
          {item.itemName}
        </p>

        {/* 성분명 */}
        {displayIngrName ? (
          <p style={{
            fontSize: '0.73rem', color: 'rgba(165,180,252,0.85)',
            marginBottom: '0.22rem', lineHeight: 1.4,
          }}>
            🧪 {displayIngrName}
          </p>
        ) : drugInfo?.loading ? (
          <p style={{
            fontSize: '0.71rem', color: 'var(--text-muted)',
            marginBottom: '0.22rem', opacity: 0.5,
          }}>
            🧪 성분명 조회 중…
          </p>
        ) : null}

        {/* 판매사 + 허가일 */}
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
          {item.entpName}
          {item.updateDe && item.updateDe.length >= 8 && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>
              · {fmtDate(item.updateDe)}
            </span>
          )}
        </p>
      </div>

      {/* ── 상세 정보: 약가·생동·DMF ── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '0.75rem 1rem',
        background: 'rgba(0,0,0,0.12)',
      }}>
        {drugInfo?.loading && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.6, margin: 0 }}>
            ⏳ 약가·생동·DMF 조회 중…
          </p>
        )}
        {drugInfo?.error && (
          <p style={{ color: '#f87171', fontSize: '0.78rem', margin: 0 }}>⚠ {drugInfo.error}</p>
        )}
        {drugInfo?.data && (
          <DrugInfoPanel data={drugInfo.data} ingrName={displayIngrName} bioeqYn={item.bioeqYn} />
        )}
      </div>

      {/* ── 하단: 안전나라 링크 ── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '0.55rem 1rem',
      }}>
        <a
          href={NEDRUG_DETAIL(item.itemSeq)}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.32rem 0.75rem', borderRadius: 7,
            background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.22)',
            color: '#6ee7b7', fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          🌐 의약품안전나라 ↗
        </a>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   약가·생동·DMF 패널
════════════════════════════════════════ */
function DrugInfoPanel({ data, ingrName, bioeqYn }: {
  data:      DrugInfoResponse;
  ingrName?: string | null;
  bioeqYn?:  string | null;
}) {
  const { prices, bioEq, dmf } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

      {/* 약가 */}
      <InfoSection title="💰 약가">
        {prices.length === 0 ? (
          <NoData text="약가 정보가 없습니다." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {prices.slice(0, 5).map((p, i) => (
              <PriceRow key={i} p={p} />
            ))}
            {prices.length > 5 && (
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right', margin: 0 }}>
                외 {prices.length - 5}건 더 있음
              </p>
            )}
          </div>
        )}
      </InfoSection>

      {/* 생동 */}
      <InfoSection title="🔬 자사 생동 여부">
        {/* 허가등록 API BIOEQ_YN 우선 표시 */}
        {bioeqYn && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.7rem', borderRadius: 7, marginBottom: '0.5rem',
            background: bioeqYn === 'Y' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${bioeqYn === 'Y' ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.25)'}`,
          }}>
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>
              {bioeqYn === 'Y' ? '✓' : '✗'}
            </span>
            <span style={{
              fontSize: '0.8rem', fontWeight: 700,
              color: bioeqYn === 'Y' ? '#6ee7b7' : '#fca5a5',
            }}>
              생동성 시험 {bioeqYn === 'Y' ? '완료' : '미실시'}
            </span>
            <span style={{
              fontSize: '0.65rem', fontWeight: 600,
              padding: '0.08rem 0.35rem', borderRadius: 4,
              background: bioeqYn === 'Y' ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.15)',
              color: bioeqYn === 'Y' ? '#6ee7b7' : '#fca5a5',
            }}>
              {bioeqYn}
            </span>
          </div>
        )}

        {/* MdcBioEqInfoService 인정 품목 목록 */}
        {bioEq.length === 0 ? (
          !bioeqYn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ color: '#f87171', fontSize: '1rem' }}>✗</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>생동 등재 이력 없음</span>
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {/* 계열 생동 인정 안내 배너 */}
            {bioEq[0]?.crossRecognized && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.28rem 0.65rem', borderRadius: 7, marginBottom: '0.15rem',
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.25)',
              }}>
                <span style={{ fontSize: '0.9rem' }}>↔</span>
                <span style={{ fontSize: '0.73rem', color: '#fde68a', fontWeight: 600 }}>
                  동일계열 성분 기준 생동 인정
                </span>
                <span style={{ fontSize: '0.68rem', color: 'rgba(253,230,138,0.7)' }}>
                  (동일 제형의 다른 용량 품목에서 생동 확인됨)
                </span>
              </div>
            )}

            {bioEq.slice(0, 3).map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <span style={{
                  fontSize: '1rem', flexShrink: 0,
                  color: b.crossRecognized ? '#fbbf24' : '#6ee7b7',
                }}>
                  {b.crossRecognized ? '↔' : '✓'}
                </span>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {b.itemName || '생동 인정'}
                  </span>
                  {b.noticeDate && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                      ({fmtDate(b.noticeDate)})
                    </span>
                  )}
                  {b.entpName && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                      · {b.entpName}
                    </span>
                  )}
                  {b.ingrName && (
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0.1rem 0 0' }}>
                      {b.ingrName}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {bioEq.length > 3 && (
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', paddingLeft: '1.4rem', margin: 0 }}>
                외 {bioEq.length - 3}건 더 있음
              </p>
            )}
          </div>
        )}
      </InfoSection>

      {/* DMF */}
      <InfoSection title="🏭 원료 DMF 현황">
        {!ingrName ? (
          <NoData text="성분명 정보 없음 — DMF를 조회할 수 없습니다." />
        ) : dmf.length === 0 ? (
          <NoData text="등록된 원료 DMF 이력이 없습니다." />
        ) : (
          <>
            <div style={{ overflowX: 'auto', borderRadius: 7, border: '1px solid rgba(255,255,255,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['성분명', '국내 등록업체', '제조업체', '제조국', '등록일', 'DMF번호'].map(h => (
                      <th key={h} style={{
                        padding: '0.35rem 0.55rem', textAlign: 'left', fontWeight: 600,
                        color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dmf.slice(0, 10).map((d, i) => (
                    <tr key={i} style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <td style={tdStyle}>{d.ingrName}</td>
                      <td style={tdStyle}>{d.entpName ?? '-'}</td>
                      <td style={tdStyle}>
                        <span>{d.mnfctrName ?? '-'}</span>
                        {d.mnfctrPlace && (
                          <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', margin: '0.1rem 0 0', opacity: 0.7 }}>
                            {d.mnfctrPlace}
                          </p>
                        )}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{d.country ?? '-'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(d.permitDate)}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: '0.65rem', opacity: 0.8 }}>
                        {d.dmfNo ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dmf.length > 10 && (
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem', textAlign: 'right' }}>
                외 {dmf.length - 10}건 더 있음
              </p>
            )}
          </>
        )}
      </InfoSection>
    </div>
  );
}

/* ── 약가 행 ── */
function PriceRow({ p }: { p: PriceItem }) {
  return (
    <div style={{
      padding: '0.45rem 0.65rem', borderRadius: 7,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>
        {p.payTpNm && (
          <span style={{
            padding: '0.1rem 0.42rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
            background: p.payTpNm.includes('급여') ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
            border: `1px solid ${p.payTpNm.includes('급여') ? 'rgba(52,211,153,0.3)' : 'rgba(251,191,36,0.3)'}`,
            color: p.payTpNm.includes('급여') ? '#6ee7b7' : '#fde68a',
          }}>
            {p.payTpNm}
          </span>
        )}
        {p.mxCprc != null && (
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {p.mxCprc.toLocaleString()}원
          </span>
        )}
        {(p.unit || p.nomNm) && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            / {p.unit ?? p.nomNm}
          </span>
        )}
        {p.ingrName && (
          <span style={{
            fontSize: '0.68rem', color: 'rgba(196,181,253,0.8)',
            padding: '0.08rem 0.38rem', borderRadius: 4,
            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
          }}>
            {p.ingrName}
          </span>
        )}
        {p.mnfEntpNm && (
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'rgba(165,180,252,0.8)' }}>
            {p.mnfEntpNm}
          </span>
        )}
      </div>
      {p.adtStaDd && (
        <p style={{ fontSize: '0.67rem', color: 'var(--text-muted)', margin: '0.18rem 0 0' }}>
          시행일: {fmtDate(p.adtStaDd)}
          {p.itmNm && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>· {p.itmNm}</span>}
        </p>
      )}
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: '0.35rem 0.55rem',
  color: 'rgba(240,244,255,0.75)',
  verticalAlign: 'top',
};

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{
        fontSize: '0.72rem', fontWeight: 700, color: 'rgba(165,180,252,0.9)',
        marginBottom: '0.4rem', letterSpacing: '0.02em', margin: '0 0 0.4rem',
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function NoData({ text }: { text: string }) {
  return <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{text}</p>;
}

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
        background: active ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? '#6ee7b7' : disabled ? 'rgba(107,122,153,0.4)' : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  );
}
