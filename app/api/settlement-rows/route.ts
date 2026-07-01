import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

export const dynamic = 'force-dynamic';

const COLS = 'id,source_file,settlement_month,prescription_month,manager,cso_name,hospital_name,product_name,approved_qty,unit_price,prescription_amount,hospital_category,hospital_type,commission_rate,settlement_amount';
const PAGE  = 1000;
const BATCH = 10;

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

  // 파일 총 건수 확인
  let cntQ = db
    .from('commission_settlements')
    .select('id', { count: 'exact', head: true })
    .eq('source_file', sourceFile);
  if (companyId) cntQ = cntQ.eq('company_id', companyId);
  const { count: fileCount, error: cntErr } = await cntQ;
  if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 });

  // 병렬 페이지네이션으로 전체 행 수집
  const totalPages = Math.ceil((fileCount ?? 0) / PAGE);
  let allRows: unknown[] = [];

  for (let bs = 0; bs < totalPages; bs += BATCH) {
    const be = Math.min(bs + BATCH, totalPages);
    const batch = await Promise.all(
      Array.from({ length: be - bs }, (_, i) => {
        const pg = bs + i;
        let q = db
          .from('commission_settlements')
          .select(COLS)
          .eq('source_file', sourceFile)
          .order('id', { ascending: true })
          .range(pg * PAGE, pg * PAGE + PAGE - 1);
        if (companyId) q = q.eq('company_id', companyId);
        return q;
      }),
    );
    for (const r of batch) {
      if (r.data) allRows = allRows.concat(r.data);
    }
  }

  return NextResponse.json({ rows: allRows });
}
