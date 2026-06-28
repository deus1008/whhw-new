import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import SettlementClient from '@/components/SettlementClient';
import type { SettlementRowClient } from '@/components/SettlementClient';

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

  const svc = createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── 전체 행 병렬 페이지네이션 ──────────────────────────────────────────
  const PAGE           = 1000;
  const PARALLEL_BATCH = 10;

  function buildQ(rangeStart: number, rangeEnd: number) {
    let q = svc
      .from('commission_settlements')
      .select('*', rangeStart === 0 ? { count: 'exact' } : {})
      .order('settlement_month', { ascending: false })
      .order('cso_name')
      .range(rangeStart, rangeEnd);
    if (companyId) q = q.eq('company_id', companyId);
    return q;
  }

  // 1단계: 총 건수 + 첫 페이지를 한 번에
  const { data: firstPage, count: totalCount, error: firstErr } = await buildQ(0, PAGE - 1) as Awaited<ReturnType<typeof buildQ>> & { count: number | null };

  let allRows: SettlementRowClient[] = [];
  if (!firstErr && firstPage) {
    allRows = firstPage as SettlementRowClient[];
    const totalPages = Math.ceil((totalCount ?? firstPage.length) / PAGE);

    // 2단계: 나머지 페이지를 PARALLEL_BATCH 단위로 병렬 요청
    for (let bs = 1; bs < totalPages; bs += PARALLEL_BATCH) {
      const be = Math.min(bs + PARALLEL_BATCH, totalPages);
      const batch = await Promise.all(
        Array.from({ length: be - bs }, (_, i) => {
          const pg = bs + i;
          return buildQ(pg * PAGE, pg * PAGE + PAGE - 1);
        }),
      );
      for (const r of batch) {
        if (r.data) allRows = allRows.concat(r.data as SettlementRowClient[]);
      }
    }
  }
  const rows = allRows;

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

        <SettlementClient rows={(rows ?? []) as SettlementRowClient[]} />
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
