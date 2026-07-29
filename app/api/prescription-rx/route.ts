import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

export const dynamic = 'force-dynamic';

/**
 * POST /api/prescription-rx  { names: string[] }
 * 병원명 목록에 대해 최신월 EDI 처방(trend_prescriptions)을 품목별로 집계.
 * 반환: { month, byHospital: { [병원명]: { total, products:[{name, amount}] } } }
 * 병원명은 처방처현황 엑셀의 처방처명과 EDI hospital_name 이 95% 정확일치 → .in() 매칭.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const isAdmin   = profileIsAdmin(profile);
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);

  let names: string[] = [];
  try {
    const body = await req.json();
    names = Array.isArray(body?.names) ? body.names.map((s: unknown) => String(s ?? '').trim()).filter(Boolean) : [];
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!names.length) return NextResponse.json({ month: null, byHospital: {} });

  const db = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 최신월 (회사 스코프)
  let mq = db.from('trend_prescriptions')
    .select('prescription_month')
    .not('prescription_month', 'is', null)
    .order('prescription_month', { ascending: false })
    .limit(1);
  if (companyId) mq = mq.eq('company_id', companyId);
  const { data: mrow } = await mq.maybeSingle();
  const month = (mrow?.prescription_month as string | undefined) ?? null;
  if (!month) return NextResponse.json({ month: null, byHospital: {} });

  // 병원명 청크 조회 → 병원×품목 합산
  const acc: Record<string, Record<string, number>> = {};
  for (let i = 0; i < names.length; i += 200) {
    let q = db.from('trend_prescriptions')
      .select('hospital_name, product_name, prescription_amount')
      .eq('prescription_month', month)
      .in('hospital_name', names.slice(i, i + 200));
    if (companyId) q = q.eq('company_id', companyId);
    const { data } = await q;
    for (const r of data ?? []) {
      const h = String(r.hospital_name ?? '').trim();
      const p = String(r.product_name ?? '').trim() || '(품목미상)';
      if (!h) continue;
      (acc[h] ??= {})[p] = (acc[h][p] ?? 0) + Number(r.prescription_amount ?? 0);
    }
  }

  const byHospital: Record<string, { total: number; products: { name: string; amount: number }[] }> = {};
  for (const [h, prods] of Object.entries(acc)) {
    const products = Object.entries(prods)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    byHospital[h] = { total: products.reduce((s, x) => s + x.amount, 0), products };
  }

  return NextResponse.json({ month, byHospital });
}
