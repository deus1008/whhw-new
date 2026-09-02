'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { normalizeRole } from '@/lib/roles';
import { NAV_ITEMS, type NavItem } from '@/lib/nav';
import ErrorReportModal from '@/components/ErrorReportModal';
import { getPendingCount, getMyUnseenCount } from '@/app/errors/actions';
import { getPendingUsersCount } from '@/app/admin/actions';
import { getFilteringBadge } from '@/app/filtering/actions';

// 사이드바를 숨길 경로(인증 화면 등). 홈('/')은 자체 아이콘 화면이 있어 제외.
const HIDE_PREFIXES = ['/login', '/signup', '/pending', '/reset', '/auth', '/forgot'];

const ORDER_KEY = 'csobiz.navOrder.v1';

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}
function saveOrder(labels: string[]) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(labels)); } catch { /* ignore */ }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const [errBadge, setErrBadge] = useState(0);
  const [userErrBadge, setUserErrBadge] = useState(0);
  const [adminBadge, setAdminBadge] = useState(0);
  const [filterBadge, setFilterBadge] = useState(0);

  const [order, setOrder] = useState<string[]>([]);   // 라벨 순서(사용자 지정)
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);

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
      getFilteringBadge().then(setFilterBadge).catch(() => {});
    }
    sb.auth.getSession().then(({ data }) => { setAuthed(!!data.session); load(data.session?.user?.id); });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, s) => { setAuthed(!!s); load(s?.user?.id); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { setOpen(false); setEditing(false); }, [pathname]);

  // 접근 가능한 메뉴(관리자 전용 필터)
  const baseItems = useMemo(() => NAV_ITEMS.filter(i => !i.adminOnly || isAdmin), [isAdmin]);

  // 저장된 순서를 현재 메뉴 목록과 병합(사라진 항목 제거·새 항목은 뒤에 추가)
  useEffect(() => {
    const baseLabels = baseItems.map(i => i.label);
    setOrder(prev => {
      const saved = prev.length ? prev : loadOrder();
      const kept = saved.filter(l => baseLabels.includes(l));
      const added = baseLabels.filter(l => !kept.includes(l));
      const merged = [...kept, ...added];
      return merged.length === prev.length && merged.every((l, i) => l === prev[i]) ? prev : merged;
    });
  }, [baseItems]);

  // 표시 순서대로 정렬된 아이템
  const orderedItems = useMemo(() => {
    const byLabel = new Map(baseItems.map(i => [i.label, i]));
    const seq = order.length ? order : baseItems.map(i => i.label);
    return seq.map(l => byLabel.get(l)).filter((x): x is NavItem => !!x);
  }, [baseItems, order]);

  const hidden =
    pathname === '/' ||
    HIDE_PREFIXES.some(p => pathname.startsWith(p)) ||
    authed !== true;

  if (hidden) return <>{children}</>;

  function commit(labels: string[]) { setOrder(labels); saveOrder(labels); }

  function move(from: number, to: number) {
    if (to < 0 || to >= orderedItems.length || from === to) return;
    const labels = orderedItems.map(i => i.label);
    const [m] = labels.splice(from, 1);
    labels.splice(to, 0, m);
    commit(labels);
  }
  function resetOrder() {
    const labels = baseItems.map(i => i.label);
    commit(labels);
  }

  function go(item: NavItem) {
    if (editing) return;              // 편집 중에는 이동하지 않음
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
    label === '오류신고' ? userErrBadge : label === '오류신고함' ? errBadge : label === '관리자' ? adminBadge
    : label === '종병필터링' ? filterBadge : 0;

  return (
    <>
      <button className="app-hamburger" aria-label="메뉴 열기" onClick={() => setOpen(o => !o)}>☰</button>
      <div className={`app-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`app-sidebar ${open ? 'open' : ''}`}>
        <div className="app-sidebar-head">
          <a href="/" className="app-brand">CSO Biz.</a>
          <div className="app-brand-sub">판매대행사업</div>
        </div>

        <div className="app-nav-tools">
          <button
            className={`app-nav-editbtn ${editing ? 'on' : ''}`}
            onClick={() => setEditing(e => !e)}
            title="메뉴 순서를 바꿉니다"
          >
            {editing ? '✓ 완료' : '↕ 순서편집'}
          </button>
          {editing && (
            <button className="app-nav-resetbtn" onClick={resetOrder} title="기본 순서로 되돌리기">기본순서</button>
          )}
        </div>

        <nav className="app-nav">
          {orderedItems.map((item, idx) => {
            const active = !editing && item.href !== '#' && !item.external &&
              (pathname === item.href || pathname.startsWith(item.href + '/'));
            const b = badgeFor(item.label);
            return (
              <div
                key={item.label}
                className={`app-nav-row ${editing ? 'editing' : ''} ${drag === idx ? 'dragging' : ''}`}
                draggable={editing}
                onDragStart={() => setDrag(idx)}
                onDragOver={e => {
                  if (!editing || drag === null) return;
                  e.preventDefault();
                  if (drag !== idx) { move(drag, idx); setDrag(idx); }
                }}
                onDragEnd={() => setDrag(null)}
                onDrop={e => e.preventDefault()}
              >
                {editing && <span className="app-nav-handle" aria-hidden>⠿</span>}
                <button
                  className={`app-nav-item ${active ? 'active' : ''}`}
                  onClick={() => go(item)}
                  tabIndex={editing ? -1 : 0}
                >
                  <span className="app-nav-ico">{item.icon}</span>
                  <span>{item.label}</span>
                  {!editing && b > 0 && <span className="app-nav-badge">{b > 99 ? '99+' : b}</span>}
                </button>
                {editing && (
                  <span className="app-nav-move">
                    <button aria-label="위로" onClick={() => move(idx, idx - 1)} disabled={idx === 0}>▲</button>
                    <button aria-label="아래로" onClick={() => move(idx, idx + 1)} disabled={idx === orderedItems.length - 1}>▼</button>
                  </span>
                )}
              </div>
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
