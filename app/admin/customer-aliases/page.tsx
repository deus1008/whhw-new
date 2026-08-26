export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { getUnmappedNames, getAliases, getCustomerOptions } from './actions';
import CustomerAliasesClient from '@/components/CustomerAliasesClient';

export default async function CustomerAliasesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: p } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single();
  if (!p || p.status !== 'approved') redirect('/pending');
  if (normalizeRole(p.role) !== '관리자') redirect('/weekly');

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
          
          <Link href="/admin" style={{
            padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
            background: '#f1f5f9', border: '1px solid #e5e9f0',
            color: '#475569', textDecoration: 'none',
          }}>← 관리자</Link>
          
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
