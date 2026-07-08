export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import CodeDeleteClient from '@/components/CodeDeleteClient';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function CodeDeletePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, roles, status, company_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  const role = normalizeRole(profile.role);
  const isSystemAdmin  = role === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser   = isAllianceEmployee(profileCompanyId, isSystemAdmin);
  const companyId        = await getEffectiveCompanyId(profileCompanyId, isSystemAdmin);

  if (isAllianceUser && !companyId) redirect('/');

  const svc = getSvc();
  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isSystemAdmin) {
    const { data } = await svc
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (data ?? []) as { id: string; name: string }[];
  }

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '960px', padding: '2rem 1rem', minHeight: '100vh' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.3rem, 4vw, 1.9rem)' }}>
          코드삭제대상처
        </p>
        <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.4rem' }}>
          처방처별 3개월 평균 처방액 20만원 미만
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '1.8rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isSystemAdmin) && (
          <AllianceCompanyBar
            companies={allianceCompanies}
            activeCompanyId={companyId}
          />
        )}

        <CodeDeleteClient />
      </div>
    </>
  );
}
