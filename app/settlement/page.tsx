import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';

import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import SettlementClient from '@/components/SettlementClient';

/* 파일명에서 정산월·처방월 파싱 (예: 판매대행수수료정산_26.07정산_26.05처방.xlsx) */
function parseMonthsFromFilename(filename: string): { settMonth: string | null; prescMonth: string | null } {
  const m = filename.match(/_(\d{2})\.(\d{2})정산[_\s](\d{2})\.(\d{2})처방/);
  if (m) return { settMonth: `20${m[1]}-${m[2]}`, prescMonth: `20${m[3]}-${m[4]}` };
  return { settMonth: null, prescMonth: null };
}

export default async function SettlementPage() {
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

  // ── 파일 목록: documents 테이블에서 조회 (row 로딩 없이 즉시 응답) ──────
  // commission_settlements 전체를 서버에서 로드하면 메모리·속도 문제 발생.
  // 파일 목록만 documents 테이블로 가져오고, 실제 행은 클라이언트가 API로 fetch.
  let fileListQ = svc
    .from('documents')
    .select('filename, created_at')
    .eq('category', '수수료정산')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(100);
  if (companyId) fileListQ = fileListQ.eq('company_id', companyId);
  const { data: docFileList } = await fileListQ;

  const allFiles = (docFileList ?? []).map((d: { filename: string; created_at: string }) => ({
    file: d.filename,
    ...parseMonthsFromFilename(d.filename),
  })).sort((a, b) => {
    const sa = a.settMonth ?? '', sb = b.settMonth ?? '';
    if (sb !== sa) return sb.localeCompare(sa); // 정산월 desc
    const pa = a.prescMonth ?? '', pb = b.prescMonth ?? '';
    return pb.localeCompare(pa); // 처방월 desc
  });

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '900px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          수수료정산
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

        <SettlementClient allFiles={allFiles} />
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
