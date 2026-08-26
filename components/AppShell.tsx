'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { normalizeRole } from '@/lib/roles';
import { NAV_ITEMS, type NavItem } from '@/lib/nav';
import ErrorReportModal from '@/components/ErrorReportModal';
import { getPendingCount, getMyUnseenCount } from '@/app/errors/actions';
import { getPendingUsersCount } from '@/app/admin/actions';

// 사이드바를 숨길 경로(인증 화면 등). 홈('/')은 자체 아이콘 화면이 있어 제외.
const HIDE_PREFIXES = ['/login', '/signup', '/pending', '/reset', '/auth', '/forgot'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const [errBadge, setErrBadge] = useState(0);
  const [userErrBadge, setUserErrBadge] = useState(0);
  const [adminBadge, setAdminBadge] = useState(0);

  useEffect(() => {
    const sb = createClient();
    async function load(uid?: string) {
      if (!uid) { setIsAdmin(false); return; }
      const { data } = await sb.from('profiles').select('role, roles').eq('id', uid).single();
      const rawRoles: string[] = data?.roles?.length ? data.roles : (data?.role ? [data.role] : []);
      const admin = rawRoles.map(r => normalizeRole(r)).includes('관리자');
      setIsAdmin(admin);
      if (admin) { getPendingCount().then(setErrBadge); getPendingUsersCount().then(setAdminBadge); }
      getMyUnseenCount().then(setUserErrBadge);
    }
    sb.auth.getSession().then(({ data }) => { setAuthed(!!data.session); load(data.session?.user?.id); });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, s) => { setAuthed(!!s); load(s?.user?.id); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  const hidden =
    pathname === '/' ||
    HIDE_PREFIXES.some(p => pathname.startsWith(p)) ||
    authed !== true;

  if (hidden) return <>{children}</>;

  const items = NAV_ITEMS.filter(i => !i.adminOnly || isAdmin);

  function go(item: NavItem) {
    setOpen(false);
    if (item.action === 'error-modal') { setShowErr(true); return; }
    if (item.external) { window.open(item.href, '_blank', 'noopener,noreferrer'); return; }
    window.location.href = item.href;
  }
  async function logout() {
    const sb = createClient();
    await sb.auth.signOut();
    window.location.href = '/';
  }
  const badgeFor = (label: string) =>
    label === '오류신고' ? userErrBadge : label === '오류신고함' ? errBadge : label === '관리자' ? adminBadge : 0;

  return (
    <>
      <button className="app-hamburger" aria-label="메뉴 열기" onClick={() => setOpen(o => !o)}>☰</button>
      <div className={`app-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`app-sidebar ${open ? 'open' : ''}`}>
        <div className="app-sidebar-head">
          <a href="/" className="app-brand">CSO Biz.</a>
          <div className="app-brand-sub">판매대행사업</div>
        </div>
        <nav className="app-nav">
          {items.map(item => {
            const active = item.href !== '#' && !item.external &&
              (pathname === item.href || pathname.startsWith(item.href + '/'));
            const b = badgeFor(item.label);
            return (
              <button key={item.label} className={`app-nav-item ${active ? 'active' : ''}`} onClick={() => go(item)}>
                <span className="app-nav-ico">{item.icon}</span>
                <span>{item.label}</span>
                {b > 0 && <span className="app-nav-badge">{b > 99 ? '99+' : b}</span>}
              </button>
            );
          })}
        </nav>
        <div className="app-sidebar-foot">
          <button className="app-foot-btn" onClick={logout}>로그아웃</button>
        </div>
      </aside>
      <div className="app-content">{children}</div>
      {showErr && <ErrorReportModal onClose={() => setShowErr(false)} onSeen={() => setUserErrBadge(0)} />}
    </>
  );
}
