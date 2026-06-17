import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import CommissionRateClient from '@/components/CommissionRateClient';

export const revalidate = 0;

export type CommissionDoc = {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
};

const FOLDER_NAME = '수수료율(아주약품)';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function CommissionRatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const { data: rows } = await getSvc()
    .from('documents')
    .select('id, filename, file_type, created_at')
    .eq('category', FOLDER_NAME)
    .in('file_type', ['xlsx', 'xls', 'xlsb'])
    .order('created_at', { ascending: false });

  const docs: CommissionDoc[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    id:         r.id         as string,
    filename:   r.filename   as string,
    file_type:  r.file_type  as string,
    created_at: r.created_at as string,
  }));

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1100px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          수수료율
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        <CommissionRateClient docs={docs} folderName={FOLDER_NAME} />
      </div>
    </>
  );
}
