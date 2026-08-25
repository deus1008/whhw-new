export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import RxTrendClient from '@/components/RxTrendClient';

export default async function PrescriptionTrendPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin = normalizeRole(profile.role as string) === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isAdmin) {
    const svc = createSvcClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await svc.from('client_companies').select('id, name').eq('status', 'active').order('display_order', { ascending: true });
    allianceCompanies = (data ?? []) as { id: string; name: string }[];
  }

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="relative z-10 w-full px-4" style={{ maxWidth: '1180px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.3rem, 4vw, 1.9rem)' }}>
          진료과별 다처방 성분
        </p>
        <div className="page-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>
        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}
        <RxTrendClient />
      </div>
    </>
  );
}
