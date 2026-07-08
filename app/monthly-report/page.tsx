import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import MonthlyReportClient from '@/components/MonthlyReportClient';
import { getMonthData, getUbistData, getMboTargetsForReport } from './actions';
import { BRAND_GROUPS, NEW_PRODUCTS } from './constants';

export const dynamic = 'force-dynamic';

function getSvc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; months?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin = normalizeRole(profile.role as string) === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
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

  const params = await searchParams;
  // ?months=2026-05,2026-04 or legacy ?month=2026-05
  const rawMonths = params.months ?? params.month ?? '';
  let selectedMonths: string[] = rawMonths ? rawMonths.split(',').filter(Boolean) : [];

  // 월이 지정되지 않은 경우 최신 월로 리디렉션
  if (selectedMonths.length === 0) {
    const { getAvailableMonths } = await import('./actions');
    const avail = await getAvailableMonths(companyId);
    if (avail.length > 0) redirect(`/monthly-report?months=${avail[0]}`);
  }

  const effectiveMonths = selectedMonths.length > 0 ? selectedMonths : ['2026-01'];
  const latestMonth = [...effectiveMonths].sort().reverse()[0];

  const [monthData, ubistData, mboTargets] = await Promise.all([
    getMonthData(effectiveMonths, companyId),
    getUbistData(latestMonth),
    getMboTargetsForReport(latestMonth),
  ]);

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '1100px', paddingTop: '2.5rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          월간 회의자료
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <MonthlyReportClient
          initialMonths={effectiveMonths}
          monthData={monthData}
          ubistData={ubistData}
          brandGroups={BRAND_GROUPS}
          newProducts={NEW_PRODUCTS}
          mboTargets={mboTargets}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}
