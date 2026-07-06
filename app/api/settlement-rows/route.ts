import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

export const dynamic = 'force-dynamic';

// 집계에 필요한 9개 컬럼만 조회 (15→9, 약 40% 페이로드 절감)
const COLS = 'id,hospital_category,hospital_type,hospital_name,product_name,manager,cso_name,prescription_amount,settlement_amount';
const PAGE = 5000; // 페이지당 5000행 (3 round-trip → 1-2로 감소)

type RawRow = {
  id: string;
  hospital_category: string | null;
  hospital_type:     string | null;
  hospital_name:     string | null;
  product_name:      string | null;
  manager:           string | null;
  cso_name:          string | null;
  prescription_amount: number | null;
  settlement_amount:   number | null;
};

type AggNode = { name: string; presc: number; sett: number; cnt: number; sub?: AggNode[] };

function aggTree(rows: RawRow[], keyFns: ((r: RawRow) => string)[]): AggNode[] {
  const [getKey, ...rest] = keyFns;
  const map = new Map<string, { p: number; s: number; c: number; ch: RawRow[] }>();
  for (const r of rows) {
    const k = getKey(r);
    let e = map.get(k);
    if (!e) { e = { p: 0, s: 0, c: 0, ch: [] }; map.set(k, e); }
    e.p += r.prescription_amount ?? 0;
    e.s += r.settlement_amount   ?? 0;
    e.c++;
    e.ch.push(r);
  }
  return Array.from(map.entries())
    .map(([name, { p, s, c, ch }]) => {
      const node: AggNode = { name, presc: p, sett: s, cnt: c };
      if (rest.length > 0) node.sub = aggTree(ch, rest);
      return node;
    })
    .sort((a, b) => b.sett - a.sett);
}

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

  // 커서 기반 페이지네이션: id > lastId LIMIT 5000
  const allRows: RawRow[] = [];
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
      console.error('[settlement-rows] fetch error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as RawRow[]));
    if (data.length < PAGE) break;
    lastId = (data[data.length - 1] as RawRow).id;
  }

  const str = (v: string | null) => v ?? '미상';
  const cat = (v: string | null) => v ?? '미분류';

  return NextResponse.json({
    summary: {
      totalPresc: allRows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0),
      totalSett:  allRows.reduce((s, r) => s + (r.settlement_amount   ?? 0), 0),
      totalCnt:   allRows.length,
    },
    csoTree:     aggTree(allRows, [r => str(r.cso_name), r => str(r.hospital_name), r => str(r.product_name)]),
    mgrTree:     aggTree(allRows, [r => str(r.manager), r => str(r.cso_name), r => str(r.hospital_name), r => str(r.product_name)]),
    productTree: aggTree(allRows, [r => str(r.product_name), r => cat(r.hospital_category), r => str(r.hospital_name), r => str(r.manager), r => str(r.cso_name)]),
    typeTree:    aggTree(allRows, [r => cat(r.hospital_category), r => cat(r.hospital_type), r => str(r.hospital_name), r => str(r.product_name)]),
  });
}
