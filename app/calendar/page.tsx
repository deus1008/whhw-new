export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import MarketingClient from '@/components/MarketingClient';
import type { ScheduleCategory } from '@/app/calendar/actions';

export type MarketingSchedule = {
  id:         string;
  user_id:    string;
  title:      string;
  start_date: string;
  end_date:   string | null;
  category:   string | null;
  location:   string | null;
  assignee:   string | null;
  memo:       string | null;
  created_at: string;
  updated_at: string;
  author_name?: string;
};

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function MarketingPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[marketing:getUser error]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const role = normalizeRole(myProfile.role);
  const isAdmin = role === '관리자' || role === '마케팅총괄';
  const profileCompanyId = (myProfile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isAdmin) {
    const { data: companiesData } = await getSvc()
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (companiesData ?? []) as { id: string; name: string }[];
  }

  // 전체 일정 조회 (최근 3개월 ~ 향후 12개월)
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  const to = new Date();
  to.setMonth(to.getMonth() + 12);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let schedulesQ: any = getSvc()
    .from('marketing_schedules')
    .select('*')
    .gte('start_date', from.toISOString().slice(0, 10))
    .lte('start_date', to.toISOString().slice(0, 10))
    .order('start_date', { ascending: true });
  if (companyId) schedulesQ = schedulesQ.eq('company_id', companyId);

  const [{ data: schedules }, { data: categoryRows }] = await Promise.all([
    schedulesQ,
    supabase
      .from('schedule_categories')
      .select('id, name, color, sort_order')
      .order('sort_order', { ascending: true }),
  ]);

  // 작성자 이름 매핑 (관리자)
  let nameMap: Record<string, string> = {};
  if (isAdmin) {
    const { data: profiles } = await supabase
      .from('profiles').select('id, full_name, email');
    nameMap = Object.fromEntries(
      (profiles ?? []).map(p => [p.id, (p.full_name || p.email) as string]),
    );
  }

  const records: MarketingSchedule[] = ((schedules ?? []) as MarketingSchedule[]).map(s => ({
    ...s,
    author_name: isAdmin ? (nameMap[s.user_id] ?? undefined) : undefined,
  }));

  const DEFAULT_CATEGORIES: ScheduleCategory[] = [
    { id: 'default-0', name: '학술대회',   color: '#a78bfa', sort_order: 0 },
    { id: 'default-1', name: '심포지엄',   color: '#22d3ee', sort_order: 1 },
    { id: 'default-2', name: '제품설명회', color: '#34d399', sort_order: 2 },
    { id: 'default-3', name: '영업관리',   color: '#fb923c', sort_order: 3 },
    { id: 'default-4', name: '영업미팅',   color: '#60a5fa', sort_order: 4 },
    { id: 'default-5', name: '기타',       color: '#94a3b8', sort_order: 5 },
  ];
  const categories: ScheduleCategory[] = (categoryRows && categoryRows.length > 0)
    ? (categoryRows as ScheduleCategory[])
    : DEFAULT_CATEGORIES;

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '960px', padding: '2.5rem 1rem', minHeight: '100vh' }}>
        <p
          className="domain"
          style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}
        >
          판매대행사업
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <Link href="/dashboard" style={navLink}>← 대시보드</Link>
          {isAdmin && <Link href="/admin" style={navLink}>관리자 →</Link>}
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <MarketingClient
          key={companyId ?? 'default'}
          initialSchedules={records}
          initialCategories={categories}
          userId={user.id}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}

const navLink: React.CSSProperties = {
  padding: '0.35rem 0.9rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none',
};
