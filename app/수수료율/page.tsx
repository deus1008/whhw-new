import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import CommissionRateClient from '@/components/CommissionRateClient';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';

export const revalidate = 0;

export type CommissionDoc = {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
};

export type CommissionFolderGroup = {
  key: 'dealer' | 'ajou';
  folderName: string;
  label: string;
  description: string;
  docs: CommissionDoc[];
};

const FOLDERS: { key: CommissionFolderGroup['key']; folderName: string; label: string; description: string }[] = [
  {
    key: 'dealer',
    folderName: '수수료율',
    label: '전체 수수료율',
    description: 'CSO 딜러 수수료 (법인수수료 제외) — 전체 제약사 비교용',
  },
  {
    key: 'ajou',
    folderName: '수수료율(아주약품)',
    label: '아주약품 수수료율',
    description: '아주약품이 CSO 법인에 제공하는 수수료 — 정산 기준 참조용',
  },
];

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function mapDocs(rows: Record<string, unknown>[] | null): CommissionDoc[] {
  return (rows ?? []).map(r => ({
    id:         r.id         as string,
    filename:   r.filename   as string,
    file_type:  r.file_type  as string,
    created_at: r.created_at as string,
  }));
}

export default async function CommissionRatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const svc = getSvc();

  // 두 폴더 병렬 조회
  const [{ data: dealerRows }, { data: ajouRows }] = await Promise.all([
    svc.from('documents')
      .select('id, filename, file_type, created_at')
      .eq('category', '수수료율')
      .in('file_type', ['xlsx', 'xls', 'xlsb'])
      .order('created_at', { ascending: false }),
    svc.from('documents')
      .select('id, filename, file_type, created_at')
      .eq('category', '수수료율(아주약품)')
      .in('file_type', ['xlsx', 'xls', 'xlsb'])
      .order('created_at', { ascending: false }),
  ]);

  const folderGroups: CommissionFolderGroup[] = [
    { ...FOLDERS[0], docs: mapDocs(dealerRows as Record<string, unknown>[] | null) },
    { ...FOLDERS[1], docs: mapDocs(ajouRows  as Record<string, unknown>[] | null) },
  ];

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

        <CommissionRateClient folderGroups={folderGroups} />
      </div>
    </>
  );
}
