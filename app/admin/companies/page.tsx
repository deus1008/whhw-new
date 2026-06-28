export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import CompaniesClient from '@/components/CompaniesClient';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type Company = {
  id: string;
  name: string;
  code: string;
  full_name: string | null;
  news_url: string | null;
  commission_folder: string | null;
  display_order: number;
  status: 'active' | 'inactive';
};

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('status, role, roles').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved' || !profileIsAdmin(profile)) redirect('/admin');

  const { data: companies } = await svc()
    .from('client_companies')
    .select('id, name, code, full_name, news_url, commission_folder, display_order, status')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.8rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <a href="/admin" style={{
            fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', textDecoration: 'none',
            padding: '0.3rem 0.75rem', borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
          }}>
            ← 관리자
          </a>
          <LogoutButton compact />
        </div>

        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.4rem' }}>
          위탁사 관리
        </h1>
        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '1.75rem' }}>
          판매대행 계약을 맺은 위탁제약사를 등록·관리합니다. 기사검색 URL과 수수료율 폴더를 위탁사별로 설정할 수 있습니다.
        </p>

        <CompaniesClient companies={(companies ?? []) as Company[]} />
      </div>
    </>
  );
}
