import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import FilteringClient from '@/components/FilteringClient';
import type { FilteringRow } from '@/components/FilteringClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;  // 실적 자동확인(일괄) 여유 시간

export default async function FilteringPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name, email, company_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  const normRole = normalizeRole(profile.role as string);
  const isAdmin  = normRole === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  const svc = createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

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
  let q: any = svc.from('hospital_filtering').select('*')
    .order('received_date', { ascending: false, nullsFirst: false })
    .order('seq', { ascending: false });
  if (companyId) q = q.eq('company_id', companyId);
  const { data: rows } = await q;

  const myName = (profile.full_name || profile.email) as string;

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '1180px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          종합병원 필터링 관리장
        </p>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <FilteringClient
          rows={(rows ?? []) as FilteringRow[]}
          isAdmin={isAdmin}
          isConsignor={!!profileCompanyId}
          myName={myName}
          userId={user.id}
        />
      </div>
    </>
  );
}
