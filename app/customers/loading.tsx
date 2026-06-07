/* 거래처현황 로딩 스켈레톤 */
import type { CSSProperties } from 'react';

export default function CustomersLoading() {
  const shimmer: CSSProperties = {
    background: 'linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%)',
    backgroundSize: '400% 100%',
    animation: 'shimmer 1.4s infinite',
    borderRadius: '8px',
  };

  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />

      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1000px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem,4vw,1.8rem)' }}>
          거래처현황
        </p>
        <div className="page-nav">
          {[52,64,64,56].map((w,i) => <div key={i} style={{ ...shimmer, width: `${w}px`, height: '30px' }} />)}
        </div>

        <div style={{ marginTop: '1rem' }}>
          {/* 필터 바 */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {[200,120,120,120].map((w,i) => (
              <div key={i} style={{ ...shimmer, width: `${w}px`, height: '36px', borderRadius: '8px' }} />
            ))}
          </div>
          {/* 테이블 헤더 */}
          <div style={{ ...shimmer, width: '100%', height: '40px', marginBottom: '2px', borderRadius: '8px 8px 0 0' }} />
          {/* 테이블 행 × 10 */}
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} style={{ ...shimmer, width: '100%', height: '44px', marginBottom: '2px', opacity: 1 - i * 0.06 }} />
          ))}
        </div>
      </div>
    </>
  );
}
