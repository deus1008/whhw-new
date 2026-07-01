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
import type { SettlementRowClient } from '@/components/SettlementClient';

/* Supabase PostgREST 기본 1000행 제한을 우회하는 병렬 페이지네이션 헬퍼 */
async function fetchFileRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  sourceFile: string,
  companyId: string | null,
  cols: string,
): Promise<SettlementRowClient[]> {
  const PAGE  = 1000;
  const BATCH = 10;

  let cntQ = svc
    .from('commission_settlements')
    .select('id', { count: 'exact', head: true })
    .eq('source_file', sourceFile);
  if (companyId) cntQ = cntQ.eq('company_id', companyId);
  const { count: fileCount } = await cntQ;

  const totalPages = Math.ceil((fileCount ?? 0) / PAGE);
  let result: SettlementRowClient[] = [];

  for (let bs = 0; bs < totalPages; bs += BATCH) {
    const be = Math.min(bs + BATCH, totalPages);
    const batch = await Promise.all(
      Array.from({ length: be - bs }, (_, i) => {
        const pg = bs + i;
        let q = svc
          .from('commission_settlements')
          .select(cols)
          .eq('source_file', sourceFile)
          .order('id', { ascending: true })
          .range(pg * PAGE, pg * PAGE + PAGE - 1);
        if (companyId) q = q.eq('company_id', companyId);
        return q;
      }),
    );
    for (const r of batch) {
      if (r.data) result = result.concat(r.data as SettlementRowClient[]);
    }
  }

  return result;
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

  // ── 파일 목록 경량 조회 (메타데이터만) ────────────────────────────────
  // 전체 행을 모두 로드하면 메모리 초과가 발생하므로, 파일명+월 메타만 수집 후
  // 최신 파일 1개의 행만 서버에서 로드한다. 다른 파일은 클라이언트가 API로 fetch.
  let metaQ = svc
    .from('commission_settlements')
    .select('source_file,settlement_month,prescription_month')
    .not('source_file', 'is', null)
    .order('settlement_month', { ascending: false })
    .order('id', { ascending: false })
    .limit(5000);
  if (companyId) metaQ = metaQ.eq('company_id', companyId);
  const { data: metaRows } = await metaQ;

  // 중복 제거 → 파일 목록 (최신순)
  const seenFiles = new Set<string>();
  const allFiles: { file: string; settMonth: string | null; prescMonth: string | null }[] = [];
  for (const r of metaRows ?? []) {
    if (!r.source_file || seenFiles.has(r.source_file)) continue;
    seenFiles.add(r.source_file);
    allFiles.push({ file: r.source_file, settMonth: r.settlement_month ?? null, prescMonth: r.prescription_month ?? null });
  }

  // 최신 파일의 전체 행 — 병렬 페이지네이션으로 1000행 제한 우회
  const SETT_COLS = 'id,source_file,settlement_month,prescription_month,manager,cso_name,hospital_name,product_name,approved_qty,unit_price,prescription_amount,hospital_category,hospital_type,commission_rate,settlement_amount';
  let rows: SettlementRowClient[] = [];
  const latestFile = allFiles[0]?.file;
  if (latestFile) {
    rows = await fetchFileRows(svc, latestFile, companyId, SETT_COLS);
  }

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
          <Link href="/dashboard" style={nl('#93c5fd', 'rgba(59,130,246,0.12)', 'rgba(59,130,246,0.28)')}>대시보드</Link>
          {isAdmin && (
            <Link href="/documents" style={nl('#fde68a', 'rgba(251,191,36,0.12)', 'rgba(251,191,36,0.28)')}>문서관리</Link>
          )}
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <SettlementClient rows={(rows ?? []) as SettlementRowClient[]} allFiles={allFiles} />
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
