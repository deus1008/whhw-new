'use client';

import { useState, useRef, useTransition } from 'react';
import type { MedicalItem } from '@/app/api/medical-search/route';

/* ── 종별코드 배지 색 ────────────────────────────────────────── */
function clBadgeStyle(clCdNm: string): React.CSSProperties {
  if (clCdNm.includes('상급종합') || clCdNm.includes('종합병원'))
    return { background: 'rgba(239,68,68,0.12)',  border: '1px solid rgba(239,68,68,0.28)',  color: '#fca5a5' };
  if (clCdNm.includes('병원'))
    return { background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.28)', color: '#fdba74' };
  if (clCdNm.includes('의원'))
    return { background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.24)', color: '#6ee7b7' };
  if (clCdNm.includes('한방') || clCdNm.includes('한의원'))
    return { background: 'rgba(167,139,250,0.12)',border: '1px solid rgba(167,139,250,0.28)',color: '#c4b5fd' };
  if (clCdNm.includes('치과'))
    return { background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.24)', color: '#67e8f9' };
  if (clCdNm.includes('약국'))
    return { background: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.28)', color: '#fde047' };
  return { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' };
}

export default function MedicalSearchClient({ apiConfigured }: { apiConfigured: boolean }) {
  const [query, setQuery]         = useState('');
  const [items, setItems]         = useState<MedicalItem[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [error, setError]         = useState('');
  const [searched, setSearched]   = useState('');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  /* 선택된 병원 + 주변 약국 */
  const [selectedHosp, setSelectedHosp] = useState<MedicalItem | null>(null);
  const [nearbyPharms, setNearbyPharms] = useState<MedicalItem[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError]   = useState('');
  const nearbyRef = useRef<HTMLDivElement>(null);

  /* ── 병원 검색 ──────────────────────────────────────────── */
  async function doSearch(q: string, pg = 1) {
    if (!q.trim()) return;
    setError('');
    setSelectedHosp(null);
    setNearbyPharms([]);
    startTransition(async () => {
      try {
        const res  = await fetch(`/api/medical-search?q=${encodeURIComponent(q)}&type=hospital&page=${pg}`);
        const data = await res.json();
        if (data.error) { setError(data.error); setItems([]); setTotal(0); return; }
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(pg);
        setSearched(q);
      } catch {
        setError('검색 중 오류가 발생했습니다.');
      }
    });
  }

  /* ── 병원 카드 클릭 → 주변 약국 조회 ───────────────────── */
  async function handleHospSelect(hosp: MedicalItem) {
    if (selectedHosp?.ykiho === hosp.ykiho) {
      // 같은 병원 다시 클릭 → 접기
      setSelectedHosp(null);
      setNearbyPharms([]);
      return;
    }
    setSelectedHosp(hosp);
    setNearbyPharms([]);
    setNearbyError('');

    if (!hosp.xPos || !hosp.yPos) {
      setNearbyError('이 기관의 좌표 정보가 없습니다.');
      return;
    }

    setNearbyLoading(true);
    try {
      const res  = await fetch(`/api/medical-search?type=nearby&lat=${hosp.yPos}&lon=${hosp.xPos}`);
      const data = await res.json();
      if (data.error) { setNearbyError(data.error); return; }
      setNearbyPharms(data.items ?? []);
    } catch {
      setNearbyError('주변 약국 조회 중 오류가 발생했습니다.');
    } finally {
      setNearbyLoading(false);
      // 약국 섹션으로 스크롤
      setTimeout(() => nearbyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }

  const totalPages = Math.ceil(total / 12);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

      {/* ── 검색 헤더 ─────────────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: '1rem 1.2rem 1.2rem',
      }}>
        <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
          병원명·의원명으로 검색 — 종합병원, 병원, 의원, 한의원, 치과 포함
        </p>
        <form onSubmit={e => { e.preventDefault(); doSearch(query); }}
              style={{ display: 'flex', gap: '0.6rem' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="기관명을 입력하세요 (예: 서울아산병원, 강남의원)"
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
              padding: '0.65rem 1.4rem', borderRadius: 10, fontFamily: 'inherit',
              cursor: (isPending || !query.trim()) ? 'not-allowed' : 'pointer',
              background: isPending ? 'rgba(34,211,238,0.06)' : 'rgba(34,211,238,0.14)',
              border: '1px solid rgba(34,211,238,0.35)', color: '#67e8f9',
              fontSize: '0.88rem', fontWeight: 600, whiteSpace: 'nowrap',
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
            <strong>⚠ API 키 미설정</strong> —{' '}
            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0 4px', borderRadius: 4 }}>
              MEDICAL_API_KEY
            </code>{' '}
            환경변수를 설정해야 합니다.
          </div>
        )}
      </div>

      {/* ── 오류 ─────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '0.8rem 1rem', borderRadius: 10,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#f87171', fontSize: '0.82rem',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── 스켈레톤 ─────────────────────────────────────── */}
      {isPending && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              borderRadius: 12, height: 120,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', opacity: 0.5,
            }} />
          ))}
        </div>
      )}

      {/* ── 병원 결과 ────────────────────────────────────── */}
      {!isPending && items.length > 0 && (
        <>
          {/* 병원 미선택: 전체 그리드 */}
          {!selectedHosp && (
            <>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                &ldquo;{searched}&rdquo; 검색 결과 {total.toLocaleString()}건 (페이지 {page}/{totalPages})
                <span style={{ marginLeft: '0.6rem', fontSize: '0.72rem', opacity: 0.55 }}>
                  · 병원 카드를 클릭하면 주변 약국을 볼 수 있습니다
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
                {items.map((item, idx) => (
                  <HospitalCard
                    key={item.ykiho || idx}
                    item={item}
                    selected={false}
                    onClick={() => handleHospSelect(item)}
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

          {/* 병원 선택됨: 선택된 카드 하나만 표시 + 목록 복귀 버튼 */}
          {selectedHosp && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button
                  onClick={() => { setSelectedHosp(null); setNearbyPharms([]); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.3rem 0.75rem', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ← 목록으로
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.55 }}>
                  다른 병원을 선택하려면 목록으로 돌아가세요
                </span>
              </div>
              <HospitalCard
                item={selectedHosp}
                selected={true}
                onClick={() => { setSelectedHosp(null); setNearbyPharms([]); }}
              />
            </>
          )}
        </>
      )}

      {/* ── 결과 없음 ────────────────────────────────────── */}
      {!isPending && searched && items.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>🔍</div>
          <p style={{ fontSize: '0.88rem' }}>&ldquo;{searched}&rdquo;에 해당하는 병원·의원이 없습니다.</p>
          <p style={{ fontSize: '0.78rem', marginTop: '0.4rem', opacity: 0.6 }}>
            기관명 일부만 입력하거나 다른 검색어를 시도해 보세요.
          </p>
        </div>
      )}

      {/* ── 주변 약국 섹션 ──────────────────────────────── */}
      {selectedHosp && (
        <div ref={nearbyRef} style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          paddingTop: '1.2rem',
          display: 'flex', flexDirection: 'column', gap: '0.9rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1rem' }}>💊</span>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#67e8f9', margin: 0 }}>
              {selectedHosp.yadmNm} 주변 약국 (1km 이내)
            </p>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', opacity: 0.65 }}>
              전국 약국 샘플 기반 조회
            </span>
          </div>

          {nearbyLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.6rem' }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{
                  borderRadius: 10, height: 90,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
          )}

          {nearbyError && (
            <div style={{
              padding: '0.7rem 1rem', borderRadius: 10,
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171', fontSize: '0.82rem',
            }}>
              ⚠ {nearbyError}
            </div>
          )}

          {!nearbyLoading && !nearbyError && nearbyPharms.length === 0 && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.83rem' }}>
              반경 내 약국을 찾지 못했습니다. 샘플 기반 조회로 일부 약국이 누락될 수 있습니다.
            </div>
          )}

          {!nearbyLoading && nearbyPharms.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.6rem' }}>
              {nearbyPharms.map((p, idx) => (
                <PharmacyCard key={p.ykiho || idx} item={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 병원 카드 ─────────────────────────────────────────────── */
function HospitalCard({ item, selected, onClick }: {
  item: MedicalItem; selected: boolean; onClick: () => void;
}) {
  const badge  = clBadgeStyle(item.clCdNm);
  const region = [item.sidoCdNm, item.sgguCdNm].filter(Boolean).join(' ');

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 12, padding: '1rem', cursor: 'pointer',
        background: selected ? 'rgba(34,211,238,0.07)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: selected ? '0 0 0 1px rgba(34,211,238,0.2)' : 'none',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
      }}
      onMouseEnter={e => {
        if (!selected) e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)';
      }}
      onMouseLeave={e => {
        if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
      }}
    >
      {/* 종별 배지 + 기관명 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
        {item.clCdNm && (
          <span style={{ ...badge, flexShrink: 0, padding: '0.12rem 0.5rem', borderRadius: 5, fontSize: '0.67rem', fontWeight: 600 }}>
            {item.clCdNm}
          </span>
        )}
        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, margin: 0 }}>
          {item.yadmNm}
        </p>
        {selected && (
          <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: '#67e8f9', fontWeight: 600, flexShrink: 0 }}>
            ✓ 선택됨
          </span>
        )}
      </div>

      {item.addr && (
        <p style={{ fontSize: '0.76rem', color: 'rgba(240,244,255,0.65)', margin: 0, lineHeight: 1.4 }}>
          📍 {item.addr}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        {item.telno ? (
          <a href={`tel:${item.telno}`} onClick={e => e.stopPropagation()}
             style={{ fontSize: '0.78rem', color: '#6ee7b7', textDecoration: 'none', fontWeight: 500 }}>
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

/* ── 약국 카드 ─────────────────────────────────────────────── */
function PharmacyCard({ item }: { item: MedicalItem }) {
  const dist = item.distanceM;
  const distLabel = dist != null
    ? dist < 1000 ? `${dist}m` : `${(dist / 1000).toFixed(1)}km`
    : null;

  return (
    <div style={{
      borderRadius: 10, padding: '0.85rem',
      background: 'rgba(250,204,21,0.04)', border: '1px solid rgba(250,204,21,0.18)',
      display: 'flex', flexDirection: 'column', gap: '0.4rem',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(250,204,21,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(250,204,21,0.18)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: '#fde047', fontWeight: 700 }}>💊</span>
        <p style={{ fontSize: '0.87rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
          {item.yadmNm}
        </p>
        {distLabel && (
          <span style={{
            padding: '0.1rem 0.45rem', borderRadius: 5, flexShrink: 0,
            background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)',
            fontSize: '0.68rem', fontWeight: 700, color: '#fde047',
          }}>
            {distLabel}
          </span>
        )}
      </div>

      {item.addr && (
        <p style={{ fontSize: '0.73rem', color: 'rgba(240,244,255,0.6)', margin: 0, lineHeight: 1.4 }}>
          📍 {item.addr}
        </p>
      )}

      {item.telno ? (
        <a href={`tel:${item.telno}`}
           style={{ fontSize: '0.75rem', color: '#6ee7b7', textDecoration: 'none', fontWeight: 500 }}>
          📞 {item.telno}
        </a>
      ) : (
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)' }}>전화번호 없음</span>
      )}
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
