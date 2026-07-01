export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { isAllianceEmployee } from '@/lib/active-company';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import CompaniesViewClient from '@/components/CompaniesViewClient';

export type Company = {
  id: string;
  name: string;
  code: string;
  full_name: string | null;
  representative: string | null;
  business_no: string | null;
  contract_start: string | null;
  contract_end: string | null;
  auto_renewal: string | null;
  product_list_url: string | null;
  display_order: number;
  status: 'active' | 'inactive';
};

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function CompaniesViewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('status, role, roles, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin          = profileIsAdmin(profile);
  const profileCompanyId = (profile.company_id as string | null) ?? null;
  const isAlliance       = isAllianceEmployee(profileCompanyId, isAdmin);
  const showAll          = isAdmin || isAlliance;

  const svc = getSvc();
  let query = svc
    .from('client_companies')
    .select('id, name, code, full_name, representative, business_no, contract_start, contract_end, auto_renewal, product_list_url, display_order, status')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (!showAll && profileCompanyId) {
    query = (query as typeof query).eq('id', profileCompanyId);
  }

  const { data: companies } = await query;

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          위탁사현황
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        <CompaniesViewClient
          companies={(companies ?? []) as Company[]}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}
