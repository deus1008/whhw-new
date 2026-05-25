import Link from 'next/link';

/**
 * 모든 페이지 공통 "홈으로 이동" 버튼
 * compact={true} 이면 텍스트 없이 아이콘만 표시
 */
export default function HomeButton({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      title="홈으로 이동"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        padding: compact ? '0.35rem 0.6rem' : '0.35rem 0.9rem',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.09)',
        color: 'var(--text-muted)',
        fontSize: '0.8rem', fontWeight: 500,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      🏠{!compact && <span>홈으로</span>}
    </Link>
  );
}
