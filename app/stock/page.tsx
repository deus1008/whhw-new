import { redirect }      from 'next/navigation';
import { createClient }  from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton      from '@/components/LogoutButton';
import HomeButton        from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import StockClient, { type StockPeriod } from '@/components/StockClient';
import { isExcludedStock } from '@/lib/stock/excluded';

export const dynamic = 'force-dynamic';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function StockPage() {
  // ── 인증 ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const isAdmin = normalizeRole(myProfile.role as string) === '관리자';
  const profileCompanyId = (myProfile.company_id as string) ?? null;
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

  // ── monthly_stock 테이블에서 기간별 데이터 조회 ──────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockQ: any = svc
    .from('monthly_stock')
    .select('year, period, source_file, material_code, material_name, unit, available_qty, transit_qty, total_qty')
    .order('year',   { ascending: false })
    .order('period', { ascending: false })
    .order('material_name', { ascending: true });
  if (companyId) stockQ = stockQ.eq('company_id', companyId);
  const { data: raw } = await stockQ;

  // 기간별로 그루핑 (파일명이 달라도 같은 연도+기간이면 하나로).
  // 수탁품목은 항상 제외(신규 업로드에도 자동 적용).
  const periodMap = new Map<string, StockPeriod>();
  for (const r of raw ?? []) {
    if (isExcludedStock(r.material_name)) continue;
    const key = `${r.year}|${r.period}`;
    if (!periodMap.has(key)) {
      periodMap.set(key, { year: r.year, period: r.period, source_file: r.source_file, rows: [] });
    }
    periodMap.get(key)!.rows.push({
      material_code: r.material_code,
      material_name: r.material_name,
      unit:          r.unit,
      available_qty: Number(r.available_qty),
      transit_qty:   Number(r.transit_qty),
      total_qty:     Number(r.total_qty),
    });
  }

  // 최신 기간이 앞에 오도록 숫자 정렬 (TEXT 컬럼이라 "9" > "10" 방지)
  const periods: StockPeriod[] = [...periodMap.values()].sort((a, b) => {
    const ya = Number(a.year) * 100 + Number(a.period);
    const yb = Number(b.year) * 100 + Number(b.period);
    return yb - ya;
  });

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1100px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>

        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          재고현황
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <StockClient periods={periods} />
      </div>
    </>
  );
}
