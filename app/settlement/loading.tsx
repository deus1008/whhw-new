/* 수수료정산 페이지 로딩 스켈레톤 — Next.js App Router 스트리밍 */
import type { CSSProperties } from 'react';

export default function SettlementLoading() {
  const shimmer: CSSProperties = {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)',
    backgroundSize: '400% 100%',
    animation: 'shimmer 1.4s infinite',
    borderRadius: '8px',
  };

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
      `}</style>

      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '900px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        {/* 페이지 제목 */}
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          수수료정산
        </p>

        {/* 네비게이션 스켈레톤 */}
        <div className="page-nav">
          <div style={{ ...shimmer, width: '52px', height: '30px' }} />
          <div style={{ ...shimmer, width: '64px', height: '30px' }} />
          <div style={{ ...shimmer, width: '64px', height: '30px' }} />
        </div>

        <div style={{ marginTop: '1rem' }}>
          {/* 파일 선택 드롭다운 스켈레톤 */}
          <div style={{
            ...shimmer,
            height: '56px', borderRadius: '10px', marginBottom: '1rem',
            border: '1px solid rgba(99,102,241,0.2)',
          }} />

          {/* 요약 카드 스켈레톤 */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {[140, 130, 120, 110].map((w, i) => (
              <div key={i} style={{
                ...shimmer, flex: 1, minWidth: `${w}px`, height: '72px',
                borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)',
              }} />
            ))}
          </div>

          {/* 아코디언 섹션 스켈레톤 × 3 */}
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px', padding: '1rem', marginBottom: '0.75rem',
            }}>
              <div style={{ ...shimmer, width: '120px', height: '14px', marginBottom: '0.9rem' }} />
              {[1, 2, 3, 4].map(j => (
                <div key={j} style={{
                  ...shimmer,
                  height: '36px', marginBottom: '2px',
                  borderRadius: '4px',
                  opacity: 1 - j * 0.12,
                }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
