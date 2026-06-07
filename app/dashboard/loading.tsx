/* 대시보드 로딩 스켈레톤 */
import type { CSSProperties } from 'react';

export default function DashboardLoading() {
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
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem,4vw,1.8rem)' }}>
          판매대행사업
        </p>

        {/* 네비게이션 스켈레톤 */}
        <div className="page-nav" style={{ flexWrap: 'wrap' }}>
          {[52,64,80,80,72,60,72,80,56,52,60,56].map((w, i) => (
            <div key={i} style={{ ...shimmer, width: `${w}px`, height: '30px' }} />
          ))}
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          {/* 섹션 카드 스켈레톤 × 5 */}
          {[180, 200, 160, 180, 160].map((h, i) => (
            <div key={i} style={card}>
              <div style={{ ...shimmer, width: '140px', height: '14px', marginBottom: '1rem' }} />
              <div style={{ ...shimmer, width: '100%', height: `${h}px` }} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
