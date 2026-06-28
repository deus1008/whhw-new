import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import DcClient from '@/components/DcClient';
import { getDcItems } from './actions';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function DcPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  const role = normalizeRole(profile.role);
  const editorRoles = ['관리자', '마케팅총괄', 'PM'];
  const canEdit = editorRoles.includes(role);
  const isSystemAdmin = role === '관리자';

  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isSystemAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isSystemAdmin);

  if (isAllianceUser && !companyId) redirect('/');

  const svc = getSvc();

  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser) {
    const { data: companiesData } = await svc
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (companiesData ?? []) as { id: string; name: string }[];
  }

  const items = await getDcItems(companyId);

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '700px', padding: '2rem 1rem', minHeight: '100vh' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          DC현황
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {isAllianceUser && (
          <AllianceCompanyBar
            companies={allianceCompanies}
            activeCompanyId={companyId}
          />
        )}

        <DcClient initialItems={items} canEdit={canEdit} />
      </div>
    </>
  );
}
