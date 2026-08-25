import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export type RxTrendRow = {
  ingredient: string;
  cur: number; prev: number;
  aju: number; aju_product: string | null;
  ref: number; ref_product: string | null;
};

function prevYearMonth(period: string): string {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  return `${Number(m[1]) - 1}-${m[2]}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const sp = req.nextUrl.searchParams;

  if (sp.get('meta') === '1') {
    const { data, error } = await svc.rpc('get_rx_trend_meta');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? { periods: [], specialties: [] });
  }

  const period    = (sp.get('period') ?? '').trim();
  const specialty = (sp.get('specialty') ?? '').trim() || null;
  const limit     = Math.min(Number(sp.get('limit') ?? 50) || 50, 200);
  if (!period) return NextResponse.json({ error: 'period 필요' }, { status: 400 });
  const prev = prevYearMonth(period);

  const { data, error } = await svc.rpc('get_rx_trend', {
    p_period: period, p_prev: prev, p_specialty: specialty, p_limit: limit,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: (data ?? []) as RxTrendRow[], period, prev });
}
