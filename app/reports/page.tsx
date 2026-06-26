import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import ReportsClient from '@/components/ReportsClient';

export const revalidate = 0;

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, roles, status')
    .eq('id', user.id)
    .single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const rawRoles: string[] = profile.roles?.length ? profile.roles : (profile.role ? [profile.role] : []);
  const isAdmin = rawRoles.map(r => normalizeRole(r)).includes('관리자');

  const svc = getSvc();

  const [{ data: rows }, { data: docRows }] = await Promise.all([
    svc.from('reports')
      .select('id, title, content, created_at, updated_at')
      .order('created_at', { ascending: false }),
    svc.from('documents')
      .select('id, filename, file_type, storage_path, summary, created_at')
      .eq('category', '분석리포트')
      .order('created_at', { ascending: false }),
  ]);

  const reports = (rows ?? []).map((r: Record<string, unknown>) => ({
    id:         r.id         as string,
    title:      r.title      as string,
    content:    r.content    as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));

  const docFiles = (docRows ?? []).map((r: Record<string, unknown>) => ({
    id:           r.id           as string,
    filename:     r.filename     as string,
    file_type:    r.file_type    as string,
    created_at:   r.created_at   as string,
    prompt_topic: r.summary      as string | undefined,
  }));

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          분석 리포트
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        <ReportsClient reports={reports} docFiles={docFiles} isAdmin={isAdmin} />
      </div>
    </>
  );
}
