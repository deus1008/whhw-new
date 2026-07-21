export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileCanUpload } from '@/lib/roles';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import SalesForecastClient from '@/components/SalesForecastClient';
import type { SavedForecast } from '@/components/SalesForecastClient';

export default async function SalesForecastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const canEdit = profileCanUpload(profile);

  const svc = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: rows } = await svc
    .from('sales_forecasts')
    .select('*')
    .order('updated_at', { ascending: false });

  const saved: SavedForecast[] = (rows ?? []).map(r => ({
    id: String(r.id),
    ingredient_key: String(r.ingredient_key),
    product_name: String(r.product_name),
    insurance_code: (r.insurance_code as string | null) ?? null,
    launch_price: (r.launch_price as number | null) ?? null,
    insurance_price: (r.insurance_price as number | null) ?? null,
    price_factor: Number(r.price_factor ?? 0.93),
    cost_ratio: (r.cost_ratio as number | null) ?? null,
    commission_rate: (r.commission_rate as number | null) ?? null,
    pack_units: (r.pack_units as { label: string; tabsPerBox: number }[]) ?? [],
    manufacturing_lot: (r.manufacturing_lot as number | null) ?? null,
    dev_cost: (r.dev_cost as number | null) ?? null,
    years: (r.years as { y: number; amount: number; growth: number | null }[]) ?? [],
    ai_rationale: (r.ai_rationale as string | null) ?? null,
    status: (r.status as 'draft' | 'confirmed') ?? 'draft',
    updated_at: String(r.updated_at),
  }));

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1200px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          매출예측 (SF)
        </p>
        <div className="page-nav">
          <HomeButton />
          <Link href="/disease-learning" style={nl('#93c5fd', 'rgba(147,197,253,0.12)', 'rgba(147,197,253,0.28)')}>질환학습</Link>
          <Link href="/market-analysis" style={nl('#f9a8d4', 'rgba(236,72,153,0.12)', 'rgba(236,72,153,0.28)')}>시장분석</Link>
          <LogoutButton compact />
        </div>

        <SalesForecastClient saved={saved} canEdit={canEdit} />
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
