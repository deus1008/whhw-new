import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

export const dynamic = 'force-dynamic';

// OFFSET 기반 페이지네이션은 offset이 커질수록 Supabase statement timeout 발생.
// 커서 기반(id > lastId)으로 교체하면 offset 없이 항상 빠른 쿼리 가능.
const COLS = 'id,source_file,settlement_month,prescription_month,manager,cso_name,hospital_name,product_name,approved_qty,unit_price,prescription_amount,hospital_category,hospital_type,commission_rate,settlement_amount';
const PAGE  = 1000;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sourceFile = request.nextUrl.searchParams.get('file');
  if (!sourceFile) return NextResponse.json({ error: 'Missing file param' }, { status: 400 });

  const isAdmin = profileIsAdmin(profile);
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 커서 기반 페이지네이션: id > lastId LIMIT 1000
  // OFFSET 방식 대비 어느 위치에서도 동일하게 빠른 쿼리 (offset 스캔 없음)
  const allRows: unknown[] = [];
  let lastId: string | null = null;

  while (true) {
    let q = db
      .from('commission_settlements')
      .select(COLS)
      .eq('source_file', sourceFile)
      .order('id', { ascending: true })
      .limit(PAGE);
    if (companyId) q = q.eq('company_id', companyId);
    if (lastId !== null) q = q.gt('id', lastId);

    const { data, error } = await q;
    if (error) {
      console.error('[settlement-rows] fetch error:', error.message, 'after id:', lastId);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    lastId = (data[data.length - 1] as { id: string }).id;
  }

  return NextResponse.json({ rows: allRows });
}
