/* 마감분석 로딩 스켈레톤 */
import type { CSSProperties } from 'react';

export default function PerformanceLoading() {
  const shimmer: CSSProperties = {
    background: 'linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)',
    backgroundSize: '400% 100%',
    animation: 'shimmer 1.4s infinite',
    borderRadius: '8px',
  };
  const card: CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px', padding: '1rem', marginBottom: '0.75rem',
  };

  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />

      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1000px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem,4vw,1.8rem)' }}>
          마감분석
        </p>
        <div className="page-nav">
          {[52,64,64,56].map((w,i) => <div key={i} style={{ ...shimmer, width: `${w}px`, height: '30px' }} />)}
        </div>
        <div style={{ marginTop: '1rem' }}>
          {/* 드롭다운 필터 스켈레톤 */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {[160,140,140].map((w,i) => <div key={i} style={{ ...shimmer, width: `${w}px`, height: '36px' }} />)}
          </div>
          {/* 통계 카드 × 3 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
            {[1,2,3].map(i => (
              <div key={i} style={card}>
                <div style={{ ...shimmer, width: '80px', height: '12px', marginBottom: '0.5rem' }} />
                <div style={{ ...shimmer, width: '60%', height: '24px' }} />
              </div>
            ))}
          </div>
          {[1,2].map(i => (
            <div key={i} style={card}>
              <div style={{ ...shimmer, width: '200px', height: '14px', marginBottom: '0.9rem' }} />
              <div style={{ ...shimmer, width: '100%', height: '240px' }} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
