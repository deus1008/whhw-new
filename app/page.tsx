'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    icon: '🏠',
    label: '대시보드',
    color: '#93c5fd',
    bg:   'rgba(59,130,246,0.10)',
    bd:   'rgba(59,130,246,0.22)',
    external: false,
  },
  {
    href: 'https://ajupharm-news.web.app/',
    icon: '📰',
    label: '뉴스기사',
    color: '#fda4af',
    bg:   'rgba(244,63,94,0.10)',
    bd:   'rgba(244,63,94,0.22)',
    external: true,
  },
  {
    href: '/drug-search',
    icon: '💊',
    label: '의약품검색',
    color: '#6ee7b7',
    bg:   'rgba(52,211,153,0.10)',
    bd:   'rgba(52,211,153,0.22)',
    external: false,
  },
  {
    href: '/edi',
    icon: '🗂',
    label: 'EDI',
    color: '#d8b4fe',
    bg:   'rgba(168,85,247,0.10)',
    bd:   'rgba(168,85,247,0.22)',
    external: false,
  },
  {
    href: '/performance',
    icon: '📊',
    label: '마감분석',
    color: '#86efac',
    bg:   'rgba(16,185,129,0.10)',
    bd:   'rgba(16,185,129,0.22)',
    external: false,
  },
  {
    href: '/visits',
    icon: '📋',
    label: '영업활동',
    color: '#6ee7b7',
    bg:   'rgba(16,185,129,0.10)',
    bd:   'rgba(16,185,129,0.22)',
    external: false,
  },
  {
    href: '/marketing',
    icon: '📅',
    label: '주요일정',
    color: '#fdba74',
    bg:   'rgba(251,146,60,0.10)',
    bd:   'rgba(251,146,60,0.22)',
    external: false,
  },
  {
    href: '/chat',
    icon: '💬',
    label: '챗봇',
    color: '#67e8f9',
    bg:   'rgba(6,182,212,0.10)',
    bd:   'rgba(6,182,212,0.22)',
    external: false,
  },
  {
    href: '/documents',
    icon: '📁',
    label: '문서관리',
    color: '#fde68a',
    bg:   'rgba(251,191,36,0.10)',
    bd:   'rgba(251,191,36,0.22)',
    external: false,
  },
  {
    href: '/admin',
    icon: '⚙️',
    label: '관리자',
    color: '#c084fc',
    bg:   'rgba(162,89,255,0.10)',
    bd:   'rgba(162,89,255,0.22)',
    external: false,
  },
];

export default function Home() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const router     = useRouter();
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 인증 상태: null=확인 중, false=비로그인, true=로그인됨
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [toast, setToast]           = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  /* ── 인증 상태 감지 ─────────────────────────────────────── */
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
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
    router.push(href);
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
        {/* 로고 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.2rem' }}>
          <Image
            src="/aju-alliance-logo.png"
            alt="아주얼라이언스(주)"
            width={320}
            height={96}
            style={{ objectFit: 'contain', width: 'min(320px, 80vw)', height: 'auto' }}
            priority
          />
        </div>

        <h1 className="domain">판매대행사업</h1>

        {/* 페이지 바로가기 아이콘 */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '0.75rem',
          flexWrap: 'wrap', margin: '1.4rem 0 0.4rem',
        }}>
          {NAV_ITEMS.map(({ href, icon, label, color, bg, bd, external }) => (
            <button
              key={href}
              onClick={() => handleNav(href, external)}
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
