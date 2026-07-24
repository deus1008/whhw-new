export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { profileIsAdmin } from '@/lib/roles';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import SalesReportClient from '@/components/SalesReportClient';
import type { SalesReportData } from '@/components/SalesReportClient';

export default async function SalesReportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');
  if (!profileIsAdmin(profile)) redirect('/'); // 관리자 전용

  const svc = createServiceClient();

  // ── 방문 기록 (전량 — 872행) ───────────────────────────────
  const { data: vrRows } = await svc
    .from('visit_records')
    .select('id, user_id, visited_at, customer_name, customer_type')
    .order('visited_at', { ascending: true });

  // ── 방문 소개 품목 (1620행) ────────────────────────────────
  const { data: vpRows } = await svc
    .from('visit_products')
    .select('visit_id, product_name');

  // ── 지역장 프로필 ─────────────────────────────────────────
  const uids = [...new Set((vrRows ?? []).map(r => r.user_id).filter(Boolean))];
  const { data: profRows } = uids.length
    ? await svc.from('profiles').select('id, full_name, email, role').in('id', uids)
    : { data: [] as { id: string; full_name: string | null; email: string | null; role: string | null }[] };
  const managers: Record<string, string> = {};
  for (const p of profRows ?? []) {
    managers[p.id] = (p.full_name as string) || (p.email as string) || '(이름없음)';
  }

  // ── 처방 매트릭스 (RPC — DB에서 GROUP BY) ──────────────────
  const { data: rx } = await svc.rpc('get_sales_report_rx');

  const data: SalesReportData = {
    visits: (vrRows ?? []).map(r => ({
      id: String(r.id),
      uid: String(r.user_id ?? ''),
      date: String(r.visited_at ?? ''),
      customer: String(r.customer_name ?? ''),
      type: String(r.customer_type ?? ''),
    })),
    products: (vpRows ?? []).map(r => ({
      visitId: String(r.visit_id),
      name: String(r.product_name ?? ''),
    })),
    managers,
    byCso: (rx?.by_cso ?? []).map((r: { cso_name: string; month: string; amount: number }) => ({
      cso: String(r.cso_name), month: String(r.month), amount: Number(r.amount ?? 0),
    })),
    byProduct: (rx?.by_product ?? []).map((r: { product_name: string; month: string; amount: number }) => ({
      product: String(r.product_name), month: String(r.month), amount: Number(r.amount ?? 0),
    })),
  };

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1200px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          Sales Report
        </p>
        <div className="page-nav">
          <HomeButton />
          <Link href="/visits" style={nl('#6ee7b7', 'rgba(52,211,153,0.12)', 'rgba(52,211,153,0.28)')}>영업활동</Link>
          <Link href="/edi" style={nl('#d8b4fe', 'rgba(168,85,247,0.12)', 'rgba(168,85,247,0.28)')}>처방실적</Link>
          <LogoutButton compact />
        </div>

        <SalesReportClient data={data} />
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
