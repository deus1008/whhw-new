import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import ReportViewer from '@/components/ReportViewer';

export const revalidate = 0;

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const svc = getSvc();
  const { data: row } = await svc
    .from('reports')
    .select('id, title, content, created_at, updated_at')
    .eq('id', id)
    .single();

  if (!row) notFound();

  const report = {
    id:         row.id         as string,
    title:      row.title      as string,
    content:    row.content    as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        <ReportViewer report={report} />
      </div>
    </>
  );
}
