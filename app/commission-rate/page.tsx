import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import CommissionRateWrapper from '@/components/CommissionRateWrapper';
import type { CommissionDoc, CommissionFolderGroup } from './types';

export const revalidate = 0;

const FOLDERS: { key: CommissionFolderGroup['key']; folderName: string; label: string; description: string }[] = [
  {
    key: 'pharma',
    folderName: '수수료율(제약사)',
    label: '수수료율(제약사)',
    description: '위탁제약사가 CSO 법인에 제공하는 수수료 — 정산 기준 참조용',
  },
  {
    key: 'dealer',
    folderName: '수수료율(딜러)',
    label: '수수료율(딜러)',
    description: 'CSO 딜러 수수료 (법인수수료 제외) — 전체 제약사 비교용',
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
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin = normalizeRole(profile.role as string) === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  const svc = getSvc();

  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isAdmin) {
    const { data: companiesData } = await svc
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (companiesData ?? []) as { id: string; name: string }[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dealerQ: any = svc.from('documents')
    .select('id, filename, file_type, created_at')
    .eq('category', '수수료율(딜러)')
    .in('file_type', ['xlsx', 'xls', 'xlsb'])
    .order('created_at', { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pharmaQ: any = svc.from('documents')
    .select('id, filename, file_type, created_at')
    .eq('category', '수수료율(제약사)')
    .in('file_type', ['xlsx', 'xls', 'xlsb'])
    .order('created_at', { ascending: false });
  if (companyId) {
    dealerQ = dealerQ.eq('company_id', companyId);
    pharmaQ = pharmaQ.eq('company_id', companyId);
  }
  const [{ data: dealerRows }, { data: pharmaRows }] = await Promise.all([dealerQ, pharmaQ]);

  const folderGroups: CommissionFolderGroup[] = [
    { ...FOLDERS[0], docs: mapDocs(pharmaRows as Record<string, unknown>[] | null) },
    { ...FOLDERS[1], docs: mapDocs(dealerRows as Record<string, unknown>[] | null) },
  ];

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1100px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        <p className="domain no-print" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          수수료율
        </p>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <CommissionRateWrapper folderGroups={folderGroups} />
      </div>
    </>
  );
}
