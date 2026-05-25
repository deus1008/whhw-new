'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const TARGET = new Date('2026-08-01T00:00:00+09:00').getTime();

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function getTimeLeft() {
  const diff = Math.max(0, TARGET - Date.now());
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000)  / 60000),
    seconds: Math.floor((diff % 60000)    / 1000),
  };
}

export default function Home() {
  const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setTime(getTimeLeft());
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

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
        x:  Math.random() * W,
        y:  Math.random() * H,
        r:  Math.random() * 1.4 + 0.3,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        a:  Math.random() * 0.5 + 0.1,
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

  const units = [
    { value: time.days,    label: 'Days' },
    { value: time.hours,   label: 'Hours' },
    { value: time.minutes, label: 'Min' },
    { value: time.seconds, label: 'Sec' },
  ];

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[1]" />

      <div className="relative z-10 text-center px-6 py-8 w-full max-w-[700px]">
        <div className="badge">
          <span className="badge-dot" />
          준비 중 &nbsp;·&nbsp; Under Construction
        </div>

        <h1 className="domain">판매대행사업</h1>

        <p className="tagline">
          <span style={{ color: '#f0f4ff', fontWeight: 500 }}>Coming Soon</span>
          {' '}&mdash; 곧 새로운 모습으로 찾아옵니다
        </p>

        <div className="countdown-wrap">
          {units.map(({ value, label }) => (
            <div key={label} className="countdown-item">
              <span className="countdown-number">{pad(value)}</span>
              <span className="countdown-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="divider" />

        <p className="open-date">
          오픈 예정일 &nbsp;·&nbsp; Launch Date &nbsp;
          <strong style={{ color: '#4f8ef7', fontWeight: 600 }}>2026 . 08 . 01</strong>
        </p>
      </div>

      <div className="fixed top-5 right-6 z-20 flex gap-3">
        <Link
          href="/login"
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-muted)',
            fontSize: '0.78rem',
            fontWeight: 500,
            textDecoration: 'none',
            letterSpacing: '0.02em',
            transition: 'border-color 0.2s, color 0.2s',
          }}
        >
          로그인
        </Link>
        <Link
          href="/signup"
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '8px',
            background: 'rgba(79,142,247,0.12)',
            border: '1px solid rgba(79,142,247,0.3)',
            color: '#93b8ff',
            fontSize: '0.78rem',
            fontWeight: 600,
            textDecoration: 'none',
            letterSpacing: '0.02em',
            transition: 'opacity 0.2s',
          }}
        >
          회원가입
        </Link>
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
