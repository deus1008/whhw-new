import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import VisitsClient from '@/components/VisitsClient';

export type VisitRecord = {
  id:             string;
  user_id:        string;
  visited_at:     string;
  customer_name:  string;
  customer_type:  'CSO법인' | '딜러';
  contact_name:   string | null;
  purpose:        string | null;
  products:       string | null;
  content:        string;
  next_action:    string | null;
  follow_up_date: string | null;
  created_at:     string;
  user_email?:    string;
  user_name?:     string;
};

export default async function VisitsPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[visits:getUser error]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const role = normalizeRole(myProfile.role);
  const isAdmin = role === '관리자' || role === '사업총괄' || role === '영업관리총괄';
  const profileCompanyId = (myProfile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  // 서비스 클라이언트로 RLS 우회 → 모든 사용자가 전체 기록 조회 가능
  const svc = createServiceClient();

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
  let visitsQ: any = svc.from('visit_records').select('*').order('visited_at', { ascending: false });
  if (companyId) visitsQ = visitsQ.eq('company_id', companyId);

  const [{ data: all }, { data: profiles }] = await Promise.all([
    visitsQ,
    svc.from('profiles').select('id, email, full_name'),
  ]);

  const profileMap: Record<string, { email: string; full_name: string | null }> =
    Object.fromEntries(
      (profiles ?? []).map(p => [p.id, { email: p.email as string, full_name: p.full_name as string | null }]),
    );

  const records: VisitRecord[] = (all ?? []).map(r => ({
    ...(r as VisitRecord),
    user_email: profileMap[r.user_id]?.email ?? r.user_id,
    user_name:  profileMap[r.user_id]?.full_name ?? undefined,
  }));

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '900px', padding: '2.5rem 1rem', minHeight: '100vh' }}>
        <p
          className="domain"
          style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}
        >
          영업활동
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <Suspense>
          <VisitsClient
            initialRecords={records}
            userId={user.id}
            isAdmin={isAdmin}
          />
        </Suspense>
      </div>
    </>
  );
}
