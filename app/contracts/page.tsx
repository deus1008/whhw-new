import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import ContractsClient from '@/components/ContractsClient';
import type { ContractRow } from '@/components/ContractsClient';

export default async function ContractsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, full_name, email')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  const normRole = normalizeRole(profile.role as string);
  const isAdmin  = normRole === '관리자';

  const svc = createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: contracts } = await svc
    .from('new_contracts')
    .select('*')
    .order('contract_start', { ascending: false });

  const myName = (profile.full_name || profile.email) as string;

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '720px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          신규거래처계약
        </p>
        <div className="page-nav">
          <HomeButton />
          <LogoutButton compact />
        </div>

        <ContractsClient
          contracts={(contracts ?? []) as ContractRow[]}
          isAdmin={isAdmin}
          myName={myName}
          userId={user.id}
        />
      </div>
    </>
  );
}

