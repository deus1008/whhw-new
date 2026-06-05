import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/* ── GET /api/customers ── */
export async function GET(req: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { data: profile } = await authClient
    .from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const q       = (sp.get('q')       ?? '').trim();
  const region  = (sp.get('region')  ?? '').trim();
  const type    = (sp.get('type')    ?? '').trim();
  const manager = (sp.get('manager') ?? '').trim();
  const page    = Math.max(1, parseInt(sp.get('page') ?? '1'));
  const limit   = 50;
  const offset  = (page - 1) * limit;

  const sb = serviceClient();

  // 필터 옵션 + 담당자별 거래처 수 조회
  if (sp.get('meta') === '1') {
    const [regions, types, allManagers] = await Promise.all([
      sb.from('customer_status').select('region').not('region','is',null).limit(1000),
      sb.from('customer_status').select('customer_type').not('customer_type','is',null).limit(100),
      sb.from('customer_status').select('manager').limit(10000),
    ]);
    const uniq = <T>(arr: T[] | null, k: keyof T) =>
      Array.from(new Set((arr ?? []).map(r => String(r[k] ?? '')).filter(Boolean))).sort();

    // 담당자별 거래처 수 집계
    const managerCountMap = new Map<string, number>();
    for (const row of (allManagers.data ?? [])) {
      const m = String((row as Record<string,string>).manager ?? '').trim();
      if (m) managerCountMap.set(m, (managerCountMap.get(m) ?? 0) + 1);
    }
    const managerCounts = Array.from(managerCountMap.entries())
      .map(([manager, count]) => ({ manager, count }))
      .sort((a, b) => b.count - a.count);
    const totalCount = (allManagers.data ?? []).length;

    return NextResponse.json({
      regions:       uniq(regions.data as Record<string,string>[], 'region'),
      types:         uniq(types.data   as Record<string,string>[], 'customer_type'),
      managers:      managerCounts.map(m => m.manager),
      managerCounts,
      totalCount,
    });
  }

  // 데이터 조회
  let q_ = sb
    .from('customer_status')
    .select('*', { count: 'exact' });

  if (q) {
    q_ = q_.or(
      `customer_name.ilike.%${q}%,` +
      `customer_code.ilike.%${q}%,` +
      `address.ilike.%${q}%`
    );
  }
  if (region)  q_ = q_.eq('region', region);
  if (type)    q_ = q_.eq('customer_type', type);
  if (manager) q_ = q_.eq('manager', manager);

  const { data, error, count } = await q_
    .order('customer_name')
    .range(offset, offset + limit - 1);

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ items: [], total: 0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], total: count ?? 0, page, limit });
}
