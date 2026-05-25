import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import DashboardClient, {
  type MyStats, type RecentVisit, type FollowUp, type MemberStat,
} from '@/components/DashboardClient';

/* ── 날짜 유틸 ────────────────────────────────────────────── */
function todayStr() { return new Date().toISOString().slice(0, 10); }

function weekStartStr() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function twoWeeksLaterStr() {
  const d = new Date(Date.now() + 14 * 86400000);
  return d.toISOString().slice(0, 10);
}

/* ── 페이지 ──────────────────────────────────────────────── */
export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[dashboard:getUser error]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const role      = myProfile.role as string;
  const isAdmin   = role === 'admin';
  const canUpload = role === 'admin' || role === 'uploader';

  /* ── 방문 기록 조회 ─────────────────────────────────────── */
  const today     = todayStr();
  const weekStart = weekStartStr();
  const monthStart = monthStartStr();
  const twoWeeksLater = twoWeeksLaterStr();

  // 관리자: 전체 / 멤버: 본인만
  const recordsQuery = isAdmin
    ? supabase.from('visit_records').select('*').order('visited_at', { ascending: false })
    : supabase.from('visit_records').select('*').eq('user_id', user.id).order('visited_at', { ascending: false });

  const [{ data: allRecords }, { data: profiles }] = await Promise.all([
    recordsQuery,
    isAdmin
      ? supabase.from('profiles').select('id, email').eq('status', 'approved')
      : Promise.resolve({ data: [] }),
  ]);

  const records = allRecords ?? [];

  // 이메일 맵 (admin용)
  const emailMap: Record<string, string> = Object.fromEntries(
    (profiles ?? []).map(p => [p.id, p.email as string])
  );

  /* ── 내 통계 계산 ──────────────────────────────────────── */
  const myRecords = isAdmin ? records : records.filter(r => r.user_id === user.id);

  const myStats: MyStats = {
    today:     myRecords.filter(r => r.visited_at === today).length,
    thisWeek:  myRecords.filter(r => r.visited_at >= weekStart).length,
    thisMonth: myRecords.filter(r => r.visited_at >= monthStart).length,
    total:     myRecords.length,
    cso:       myRecords.filter(r => r.customer_type === 'CSO법인').length,
    dealer:    myRecords.filter(r => r.customer_type === '딜러').length,
  };

  /* ── 최근 방문 기록 (최대 8개) ─────────────────────────── */
  const recentVisits: RecentVisit[] = records.slice(0, 8).map(r => ({
    id:            r.id as string,
    visited_at:    r.visited_at as string,
    customer_name: r.customer_name as string,
    customer_type: r.customer_type as string,
    contact_name:  r.contact_name as string | null,
    products:      r.products as string | null,
    content:       r.content as string,
    user_email:    isAdmin ? (emailMap[r.user_id as string] ?? '') : undefined,
  }));

  /* ── 다가오는 후속 방문 (14일 이내) ────────────────────── */
  const followUps: FollowUp[] = myRecords
    .filter(r => r.follow_up_date && r.follow_up_date >= today && r.follow_up_date <= twoWeeksLater)
    .sort((a, b) => (a.follow_up_date as string).localeCompare(b.follow_up_date as string))
    .slice(0, 6)
    .map(r => ({
      id:             r.id as string,
      follow_up_date: r.follow_up_date as string,
      customer_name:  r.customer_name as string,
      customer_type:  r.customer_type as string,
      next_action:    r.next_action as string | null,
    }));

  /* ── 관리자: 지역장별 통계 ─────────────────────────────── */
  let memberStats: MemberStat[] = [];
  if (isAdmin) {
    const userMap: Record<string, { thisMonth: number; thisWeek: number; total: number; cso: number; dealer: number; lastVisit: string | null }> = {};
    for (const r of records) {
      const uid = r.user_id as string;
      if (!userMap[uid]) userMap[uid] = { thisMonth: 0, thisWeek: 0, total: 0, cso: 0, dealer: 0, lastVisit: null };
      const stat = userMap[uid];
      stat.total++;
      if ((r.visited_at as string) >= monthStart) stat.thisMonth++;
      if ((r.visited_at as string) >= weekStart)  stat.thisWeek++;
      if (r.customer_type === 'CSO법인') stat.cso++;
      else if (r.customer_type === '딜러') stat.dealer++;
      if (!stat.lastVisit || (r.visited_at as string) > stat.lastVisit) stat.lastVisit = r.visited_at as string;
    }
    memberStats = Object.entries(userMap).map(([uid, stat]) => ({
      userId: uid,
      email:  emailMap[uid] ?? uid,
      ...stat,
    }));
  }

  /* ── 렌더 ──────────────────────────────────────────────── */
  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full px-4" style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '2rem' }}>

        {/* 상단 타이틀 + 내비 */}
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          판매대행사업
        </p>
        <div className="page-nav">
          <HomeButton />
          <Link href="/visits"  style={navLink('#10b981', 'rgba(16,185,129,0.12)', 'rgba(16,185,129,0.28)')}>방문기록</Link>
          <Link href="/chat"    style={navLink('#06b6d4', 'rgba(6,182,212,0.12)',  'rgba(6,182,212,0.28)')}>챗봇</Link>
          {canUpload && <Link href="/documents" style={navLink('#3b82f6', 'rgba(59,130,246,0.12)', 'rgba(59,130,246,0.28)')}>문서</Link>}
          {isAdmin   && <Link href="/admin"     style={navLink('#a259ff', 'rgba(162,89,255,0.12)', 'rgba(162,89,255,0.28)')}>관리자</Link>}
          <LogoutButton compact />
        </div>

        <DashboardClient
          userEmail={user.email ?? ''}
          isAdmin={isAdmin}
          canUpload={canUpload}
          myStats={myStats}
          recentVisits={recentVisits}
          followUps={followUps}
          memberStats={memberStats}
        />
      </div>
    </>
  );
}

function navLink(color: string, bg: string, border: string): React.CSSProperties {
  return {
    padding: '0.4rem 0.9rem', borderRadius: '8px', textDecoration: 'none',
    background: bg, border: `1px solid ${border}`,
    color, fontSize: '0.82rem', fontWeight: 600,
  };
}
