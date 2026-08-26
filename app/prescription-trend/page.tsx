export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
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
    <div style={{ minHeight: '100vh', width: '100%', background: '#ffffff', alignSelf: 'stretch' }}>
      <div className="relative z-10 w-full px-4" style={{ maxWidth: '1320px', margin: '0 auto', paddingTop: '1.6rem', paddingBottom: '3rem' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '1.2rem', fontSize: 'clamp(1.35rem, 4vw, 2rem)', fontWeight: 600, color: '#111827', letterSpacing: '-0.02em' }}>
          진료과별 다처방 성분
        </h1>
        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}
        <RxTrendClient />
      </div>
    </div>
  );
}
