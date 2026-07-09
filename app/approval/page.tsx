export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';

import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import ApprovalClient from '@/components/ApprovalClient';

export default async function ApprovalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin = profileIsAdmin(profile);
  const profileCompanyId = (profile.company_id as string) ?? null;
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);

  const svc = createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isAdmin) {
    const { data: companiesData } = await svc
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (companiesData ?? []) as { id: string; name: string }[];
  }

  // 허가현황 폴더의 파일 목록 (최신순)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fileQ: any = svc
    .from('documents')
    .select('id, filename, created_at')
    .eq('category', '허가현황')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(50);
  if (companyId) fileQ = fileQ.eq('company_id', companyId);
  const { data: fileDocs } = await fileQ;

  function extractFilenameDate(filename: string): string {
    const base = filename.replace(/\.[^.]+$/, '');
    let m = base.match(/(\d{2})\.(\d{2})정산/);
    if (m) return `20${m[1]}${m[2]}`;
    m = base.match(/(\d{4})년\s*(\d{1,2})월/);
    if (m) return `${m[1]}${m[2].padStart(2, '0')}`;
    m = base.match(/(\d{2})년\s*(\d{1,2})월/);
    if (m) return `20${m[1]}${m[2].padStart(2, '0')}`;
    m = base.match(/[_\-](\d{4})[.\-](\d{2})$/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}${m[2]}`;
    m = base.match(/[_\-](\d{2})[.\-](\d{2})$/);
    if (m && +m[1] >= 24 && +m[1] <= 35 && +m[2] >= 1 && +m[2] <= 12) return `20${m[1]}${m[2]}`;
    return '';
  }

  const allFiles = (fileDocs ?? [])
    .map((d: { id: string; filename: string; created_at: string }) => ({
      id: d.id,
      filename: d.filename,
      createdAt: d.created_at,
    }))
    .sort((a: { id: string; filename: string; createdAt: string }, b: { id: string; filename: string; createdAt: string }) => {
      const da = extractFilenameDate(a.filename);
      const db = extractFilenameDate(b.filename);
      if (da && db) return db.localeCompare(da); // 날짜 desc
      if (da) return -1;
      if (db) return 1;
      return a.filename.localeCompare(b.filename, 'ko');
    });

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '980px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          의약품 허가현황
        </p>
        <div className="page-nav">
          <HomeButton />
          <Link href="/weekly" style={nl('#93c5fd', 'rgba(59,130,246,0.12)', 'rgba(59,130,246,0.28)')}>대시보드</Link>
          {isAdmin && (
            <Link href="/documents" style={nl('#fde68a', 'rgba(251,191,36,0.12)', 'rgba(251,191,36,0.28)')}>문서관리</Link>
          )}
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <ApprovalClient allFiles={allFiles} />
      </div>
    </>
  );
}

function nl(color: string, bg: string, border: string): React.CSSProperties {
  return {
    padding: '0.4rem 0.9rem', borderRadius: '8px', textDecoration: 'none',
    background: bg, border: `1px solid ${border}`,
    color, fontSize: '0.82rem', fontWeight: 600,
  };
}
