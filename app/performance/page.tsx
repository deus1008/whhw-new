import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import PerformanceClient from '@/components/PerformanceClient';
import { getPerformanceData } from './actions';
import type { StoredReport } from './actions';

export type { StoredReport };

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function PerformancePage() {
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
  const isAdmin = role === '관리자';
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

  // 실적마감 폴더 파일 → 분석 결과 (캐시 활용)
  const { reports, errors } = await getPerformanceData(companyId);

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '1160px', paddingTop: '2.5rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          마감분석
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <PerformanceClient
          reports={reports}
          errors={errors}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}

