import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import NoticesClient from '@/components/NoticesClient';

export const revalidate = 0;

export type Notice = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function NoticesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const rawRoles: string[] = profile.roles?.length ? profile.roles : (profile.role ? [profile.role] : []);
  const isAdmin = rawRoles.map(r => normalizeRole(r)).includes('관리자');
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  const svc = getSvc();

  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isAdmin) {
    const { data: companiesData } = await svc
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (companiesData ?? []) as { id: string; name: string }[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let noticesQ: any = svc
    .from('notices')
    .select('id, title, content, is_pinned, created_at, updated_at')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (companyId) noticesQ = noticesQ.eq('company_id', companyId);
  const { data: rows } = await noticesQ;

  const notices: Notice[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    id:         r.id         as string,
    title:      r.title      as string,
    content:    r.content    as string,
    is_pinned:  r.is_pinned  as boolean,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          공지사항
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <NoticesClient notices={notices} isAdmin={isAdmin} />
      </div>
    </>
  );
}
