export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { getUnmappedNames, getAliases, getCustomerOptions } from './actions';
import CustomerAliasesClient from '@/components/CustomerAliasesClient';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';

export default async function CustomerAliasesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: p } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single();
  if (!p || p.status !== 'approved') redirect('/pending');
  if (normalizeRole(p.role) !== '관리자') redirect('/dashboard');

  const [unmapped, aliases, customers] = await Promise.all([
    getUnmappedNames(),
    getAliases(),
    getCustomerOptions(),
  ]);

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '860px', padding: '2rem 1rem', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <Link href="/admin" style={{
            padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
          }}>← 관리자</Link>
          <LogoutButton compact />
        </div>

        <CustomerAliasesClient
          initialUnmapped={unmapped}
          initialAliases={aliases}
          customers={customers}
        />
      </div>
    </>
  );
}
