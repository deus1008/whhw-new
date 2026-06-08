'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { normalizeRole } from '@/lib/roles';
import ErrorReportModal from '@/components/ErrorReportModal';

type NavItem = {
  href: string;
  icon: string;
  label: string;
  color: string;
  bg: string;
  bd: string;
  external?: boolean;
  action?: 'error-modal';
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  // ① 대시보드
  {
    href: '/dashboard',
    icon: '🏠',
    label: '대시보드',
    color: '#93c5fd',
    bg:   'rgba(59,130,246,0.10)',
    bd:   'rgba(59,130,246,0.22)',
  },
  // ② 기사검색 (구: 뉴스기사)
  {
    href: 'https://ajupharm-news.web.app/',
    icon: '📰',
    label: '기사검색',
    color: '#fda4af',
    bg:   'rgba(244,63,94,0.10)',
    bd:   'rgba(244,63,94,0.22)',
    external: true,
  },
  // ③ 약품검색 (구: 의약품검색)
  {
    href: '/drug-search',
    icon: '💊',
    label: '약품검색',
    color: '#6ee7b7',
    bg:   'rgba(52,211,153,0.10)',
    bd:   'rgba(52,211,153,0.22)',
  },
  // ④ 병원검색
  {
    href: '/medical-search',
    icon: '🏥',
    label: '병원검색',
    color: '#67e8f9',
    bg:   'rgba(34,211,238,0.10)',
    bd:   'rgba(34,211,238,0.22)',
  },
  // ⑤ 신규계약
  {
    href: '/contracts',
    icon: '🤝',
    label: '신규계약',
    color: '#67e8f9',
    bg:   'rgba(34,211,238,0.10)',
    bd:   'rgba(34,211,238,0.22)',
  },
  // ⑥ 거래처현황
  {
    href: '/customers',
    icon: '🏢',
    label: '거래처현황',
    color: '#fbbf24',
    bg:   'rgba(251,191,36,0.10)',
    bd:   'rgba(251,191,36,0.22)',
  },
  // ⑦ 발매예정
  {
    href: '/products',
    icon: '🚀',
    label: '발매예정',
    color: '#a5b4fc',
    bg:   'rgba(99,102,241,0.10)',
    bd:   'rgba(99,102,241,0.22)',
  },
  // ⑧ DC현황
  {
    href: '/dc',
    icon: '🏥',
    label: 'DC현황',
    color: '#c4b5fd',
    bg:   'rgba(139,92,246,0.10)',
    bd:   'rgba(139,92,246,0.22)',
  },
  // ⑧-1 재고현황
  {
    href: '/inventory',
    icon: '📦',
    label: '재고현황',
    color: '#6ee7b7',
    bg:   'rgba(52,211,153,0.10)',
    bd:   'rgba(52,211,153,0.22)',
  },
  // ⑨ 주요일정
  {
    href: '/calendar',
    icon: '📅',
    label: '주요일정',
    color: '#fdba74',
    bg:   'rgba(251,146,60,0.10)',
    bd:   'rgba(251,146,60,0.22)',
  },
  // ⑩ 영업활동
  {
    href: '/visits',
    icon: '📋',
    label: '영업활동',
    color: '#6ee7b7',
    bg:   'rgba(16,185,129,0.10)',
    bd:   'rgba(16,185,129,0.22)',
  },
  // ⑪ 수수료시뮬
  {
    href: '/commission',
    icon: '💰',
    label: '수수료시뮬',
    color: '#6ee7b7',
    bg:   'rgba(16,185,129,0.10)',
    bd:   'rgba(16,185,129,0.22)',
  },
  // ⑫ 목표관리 (구: MBO)
  {
    href: '/mbo',
    icon: '🎯',
    label: '목표관리',
    color: '#fcd34d',
    bg:   'rgba(245,158,11,0.10)',
    bd:   'rgba(245,158,11,0.22)',
  },
  // ⑬ 처방실적 (구: EDI)
  {
    href: '/edi',
    icon: '🗂',
    label: '처방실적',
    color: '#d8b4fe',
    bg:   'rgba(168,85,247,0.10)',
    bd:   'rgba(168,85,247,0.22)',
  },
  // ⑭ 마감분석
  {
    href: '/performance',
    icon: '📊',
    label: '마감분석',
    color: '#86efac',
    bg:   'rgba(16,185,129,0.10)',
    bd:   'rgba(16,185,129,0.22)',
  },
  // ⑮ 수수료정산
  {
    href: '/settlement',
    icon: '💵',
    label: '수수료정산',
    color: '#4ade80',
    bg:   'rgba(74,222,128,0.10)',
    bd:   'rgba(74,222,128,0.22)',
  },
  // ⑯ 문서관리
  {
    href: '/documents',
    icon: '📁',
    label: '문서관리',
    color: '#fde68a',
    bg:   'rgba(251,191,36,0.10)',
    bd:   'rgba(251,191,36,0.22)',
  },
  // ⑰ 오류신고 (전체 사용자)
  {
    href: '#',
    icon: '🐛',
    label: '오류신고',
    color: '#fca5a5',
    bg:   'rgba(239,68,68,0.10)',
    bd:   'rgba(239,68,68,0.22)',
    action: 'error-modal',
  },
  // ⑱ 오류신고함 (관리자 전용)
  {
    href: '/errors',
    icon: '📬',
    label: '오류신고함',
    color: '#f87171',
    bg:   'rgba(239,68,68,0.08)',
    bd:   'rgba(239,68,68,0.20)',
    adminOnly: true,
  },
  // ⑲ 관리자 (관리자 전용)
  {
    href: '/admin',
    icon: '⚙️',
    label: '관리자',
    color: '#c084fc',
    bg:   'rgba(162,89,255,0.10)',
    bd:   'rgba(162,89,255,0.22)',
    adminOnly: true,
  },
];

export default function Home() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const router     = useRouter();
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 인증 상태: null=확인 중, false=비로그인, true=로그인됨
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [toast, setToast]           = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  /* ── 인증 상태 감지 ─────────────────────────────────────── */
  useEffect(() => {
    const supabase = createClient();

    async function checkSession(userId: string | undefined) {
      if (!userId) { setIsAdmin(false); return; }
      const { data } = await supabase.from('profiles').select('role, roles').eq('id', userId).single();
      if (!data) { setIsAdmin(false); return; }
      const rawRoles: string[] = data.roles?.length ? data.roles : (data.role ? [data.role] : []);
      const roles = rawRoles.map(r => normalizeRole(r));
      setIsAdmin(roles.includes('관리자'));
    }

    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
      checkSession(data.session?.user?.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
      checkSession(session?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  /* ── 아이콘 클릭 핸들러 ─────────────────────────────────── */
  function handleNav(href: string, external?: boolean) {
    if (external) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!isLoggedIn) {
      showToast('로그인이 필요한 페이지입니다.\n우측 상단의 로그인 버튼을 눌러주세요.');
      return;
    }
    // router.push는 Next.js 클라이언트 캐시를 통해 이동하므로
    // 이전 redirect 결과가 캐싱될 수 있음 → window.location으로 완전 새 요청
    window.location.href = href;
  }

  function showToast(msg: string) {
    setToast(msg);
    setToastVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastVisible(false), 3000);
  }

  /* ── 파티클 배경 ─────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    type Particle = { x: number; y: number; r: number; vx: number; vy: number; a: number };
    let W = 0, H = 0, particles: Particle[] = [], animId: number;

    function resize() {
      W = canvas!.width  = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }
    function init() {
      const count = Math.min(Math.floor((W * H) / 18000), 80);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.4 + 0.3,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        a: Math.random() * 0.5 + 0.1,
      }));
    }
    function draw() {
      ctx!.clearRect(0, 0, W, H);
      for (const p of particles) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(120, 170, 255, ${p.a})`;
        ctx!.fill();
        p.x += p.vx; if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        p.y += p.vy; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      }
      animId = requestAnimationFrame(draw);
    }
    const onResize = () => { resize(); init(); };
    window.addEventListener('resize', onResize);
    resize(); init(); draw();
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[1]" />

      <div className="relative z-10 text-center px-6 py-8 w-full max-w-[700px]">
        <h1 className="domain">CSO Biz.</h1>

        {/* 페이지 바로가기 아이콘 */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '0.75rem',
          flexWrap: 'wrap', margin: '1.4rem 0 0.4rem',
        }}>
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(({ href, icon, label, color, bg, bd, external, action }) => (
            <button
              key={label}
              onClick={() => {
                if (action === 'error-modal') {
                  if (!isLoggedIn) { showToast('로그인이 필요한 페이지입니다.\n우측 상단의 로그인 버튼을 눌러주세요.'); return; }
                  setShowErrorModal(true);
                  return;
                }
                handleNav(href, external);
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem',
                padding: '1rem 1.1rem',
                borderRadius: '16px',
                background: bg,
                border: `1px solid ${bd}`,
                minWidth: '68px',
                minHeight: '80px',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = `0 8px 24px ${bd}`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* 비로그인 토스트 메시지 */}
        <div style={{
          minHeight: '2.4rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <p style={{
            fontSize: '0.82rem',
            color: '#fca5a5',
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '10px',
            padding: '0.5rem 1rem',
            whiteSpace: 'pre-line',
            lineHeight: 1.6,
            transition: 'opacity 0.4s, transform 0.4s',
            opacity: toastVisible ? 1 : 0,
            transform: toastVisible ? 'translateY(0)' : 'translateY(6px)',
            pointerEvents: 'none',
          }}>
            {toast}
          </p>
        </div>
      </div>

      {/* 오류신고 모달 */}
      {showErrorModal && <ErrorReportModal onClose={() => setShowErrorModal(false)} />}

      {/* 우측 상단: 로그인 상태에 따라 다르게 표시 */}
      <div className="fixed top-5 right-6 z-20 flex gap-3">
        {isLoggedIn ? (
          <LogoutButton />
        ) : (
          <>
            <Link
              href="/login"
              style={{
                padding: '0.4rem 1rem', borderRadius: '8px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 500,
                textDecoration: 'none', letterSpacing: '0.02em',
              }}
            >
              로그인
            </Link>
            <Link
              href="/signup"
              style={{
                padding: '0.4rem 1rem', borderRadius: '8px',
                background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.3)',
                color: '#93b8ff', fontSize: '0.78rem', fontWeight: 600,
                textDecoration: 'none', letterSpacing: '0.02em',
              }}
            >
              회원가입
            </Link>
          </>
        )}
      </div>

      <footer
        className="fixed bottom-6 left-1/2 -translate-x-1/2 text-[0.72rem] tracking-[0.05em] z-10 whitespace-nowrap"
        style={{ color: '#6b7a99' }}
      >
        &copy; 2026 판매대행사업
      </footer>
    </>
  );
}

/* ── 로그아웃 버튼 (로그인 상태일 때 우측 상단) ─────────── */
function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: '0.4rem 1rem', borderRadius: '8px',
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)',
        color: '#fca5a5', fontSize: '0.78rem', fontWeight: 500,
        cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em',
      }}
    >
      로그아웃
    </button>
  );
}
