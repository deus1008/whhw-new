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

type TrendRow = {
  prescription_month:  string | null;
  sales_rep:           string | null;
  cso_name:            string | null;
  hospital_name:       string | null;
  product_name:        string | null;
  hospital_type:       string | null;
  commission_tier:     string | null;
  prescription_amount: number | null;
};

/* ── 집계 헬퍼 ── */
function aggregate(
  rows: TrendRow[],
  key: keyof TrendRow,
): { label: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const label = (r[key] as string | null) ?? '(미입력)';
    map.set(label, (map.get(label) ?? 0) + (r.prescription_amount ?? 0));
  }
  return Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/* ── YYYYMM 범위 내 모든 월 생성 ── */
function generateMonthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let y = parseInt(from.slice(0, 4));
  let m = parseInt(from.slice(4, 6));
  const endY = parseInt(to.slice(0, 4));
  const endM = parseInt(to.slice(4, 6));

  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}${String(m).padStart(2, '0')}`);
    if (m === 12) { y++; m = 1; } else { m++; }
  }
  return months;
}

function aggregateMonthly(
  rows: TrendRow[],
  fromMonth?: string,
  toMonth?: string,
): { label: string; amount: number }[] {
  // 데이터 집계
  const map = new Map<string, number>();
  for (const r of rows) {
    const label = r.prescription_month ?? null;
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + (r.prescription_amount ?? 0));
  }

  // 범위 결정
  const dataMonths = Array.from(map.keys()).filter(Boolean).sort();
  if (dataMonths.length === 0) return [];

  const maxMonth = dataMonths[dataMonths.length - 1];
  const rangeTo   = toMonth   && /^\d{6}$/.test(toMonth)   ? toMonth   : maxMonth;

  // 기간 미설정 시 최신 월 기준 직전 12개월이 기본 범위
  let defaultFrom = dataMonths[0];
  if (!fromMonth) {
    const y = parseInt(maxMonth.slice(0, 4));
    const m = parseInt(maxMonth.slice(4, 6));
    const nm = m - 11;
    defaultFrom = nm <= 0
      ? `${y - 1}${String(12 + nm).padStart(2, '0')}`
      : `${y}${String(nm).padStart(2, '0')}`;
  }
  const rangeFrom = fromMonth && /^\d{6}$/.test(fromMonth) ? fromMonth : defaultFrom;

  // 범위 내 모든 월을 0으로 채우고 데이터로 덮어쓰기
  return generateMonthRange(rangeFrom, rangeTo).map(month => ({
    label:  month,
    amount: map.get(month) ?? 0,
  }));
}

/* ── GET /api/trend ── */
export async function GET(req: NextRequest) {
  // 인증
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { data: profile } = await authClient
    .from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const groupBy      = sp.get('groupBy') ?? 'month';   // month | rep | cso | hospital | product | type | tier
  const monthFrom    = sp.get('from')    ?? '';
  const monthTo      = sp.get('to')      ?? '';
  const filterRep    = sp.get('rep')     ?? '';
  const filterCso    = sp.get('cso')     ?? '';
  const filterProd   = sp.get('product') ?? '';
  const filterType   = sp.get('type')    ?? '';
  const filterTier   = sp.get('tier')    ?? '';

  const sb = serviceClient();

  // 데이터 조회 (필터 적용)
  let q = sb
    .from('trend_prescriptions')
    .select('prescription_month,sales_rep,cso_name,hospital_name,product_name,hospital_type,commission_tier,prescription_amount');

  // 필터 미설정 시 최신 12개월 범위를 DB에서 먼저 제한 (성능)
  // 정확한 기본 범위는 데이터 로드 후 aggregateMonthly에서 결정
  if (monthFrom) q = q.gte('prescription_month', monthFrom);
  if (monthTo)   q = q.lte('prescription_month', monthTo);
  if (filterRep)  q = q.eq('sales_rep',        filterRep);
  if (filterCso)  q = q.eq('cso_name',         filterCso);
  if (filterProd) q = q.eq('product_name',     filterProd);
  if (filterType) q = q.eq('hospital_type',    filterType);
  if (filterTier) q = q.eq('commission_tier',  filterTier);

  const { data, error } = await q.limit(500000);
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ items: [], total: 0 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as TrendRow[];
  const totalAmount = rows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0);

  let items: { label: string; amount: number }[];
  switch (groupBy) {
    case 'month':    items = aggregateMonthly(rows, monthFrom, monthTo); break;
    case 'rep':      items = aggregate(rows, 'sales_rep'); break;
    case 'cso':      items = aggregate(rows, 'cso_name'); break;
    case 'hospital': items = aggregate(rows, 'hospital_name'); break;
    case 'product':  items = aggregate(rows, 'product_name'); break;
    case 'type':     items = aggregate(rows, 'hospital_type'); break;
    case 'tier':
      items = aggregate(rows, 'commission_tier').sort((a, b) => {
        const order = ['10% 미만','10%~20%','20%~30%','30%~40%','40%~50%','50% 이상'];
        return (order.indexOf(a.label) ?? 99) - (order.indexOf(b.label) ?? 99);
      });
      break;
    default: items = aggregateMonthly(rows, monthFrom, monthTo);
  }

  // 담당자별 피벗: 담당자(행) × 월(열)
  let pivot: { months: string[]; rows: { label: string; monthly: Record<string, number>; total: number }[] } | undefined;
  if (groupBy === 'rep') {
    const monthItems = aggregateMonthly(rows, monthFrom, monthTo);
    const months = monthItems.map(m => m.label);

    const repMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!r.sales_rep || !r.prescription_month) continue;
      if (!repMap.has(r.sales_rep)) repMap.set(r.sales_rep, {});
      const m = repMap.get(r.sales_rep)!;
      m[r.prescription_month] = (m[r.prescription_month] ?? 0) + (r.prescription_amount ?? 0);
    }

    const pivotRows = Array.from(repMap.entries())
      .map(([label, monthly]) => ({
        label,
        monthly,
        total: Object.values(monthly).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total);

    pivot = { months, rows: pivotRows };
  }

  // 월별 추이는 탭에 관계없이 항상 포함
  const monthlyItems = groupBy === 'month'
    ? items
    : aggregateMonthly(rows, monthFrom, monthTo);

  return NextResponse.json({ items, monthlyItems, pivot, total: totalAmount, rowCount: rows.length });
}

/* ── GET /api/trend?meta=1 — 필터 옵션 목록 ── */
export async function POST(req: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const sb = serviceClient();
  const [reps, csos, products, types, tiers, months] = await Promise.all([
    sb.from('trend_prescriptions').select('sales_rep').not('sales_rep','is',null).limit(1000),
    sb.from('trend_prescriptions').select('cso_name').not('cso_name','is',null).limit(1000),
    sb.from('trend_prescriptions').select('product_name').not('product_name','is',null).limit(1000),
    sb.from('trend_prescriptions').select('hospital_type').not('hospital_type','is',null).limit(1000),
    sb.from('trend_prescriptions').select('commission_tier').not('commission_tier','is',null).limit(100),
    sb.from('trend_prescriptions').select('prescription_month').not('prescription_month','is',null).limit(1000),
  ]);

  const uniq = <T>(arr: T[] | null, key: keyof T) =>
    Array.from(new Set((arr ?? []).map(r => String(r[key] ?? '')).filter(Boolean))).sort();

  return NextResponse.json({
    reps:     uniq(reps.data   as Record<string,string>[], 'sales_rep'),
    csos:     uniq(csos.data   as Record<string,string>[], 'cso_name'),
    products: uniq(products.data as Record<string,string>[], 'product_name'),
    types:    uniq(types.data  as Record<string,string>[], 'hospital_type'),
    tiers:    uniq(tiers.data  as Record<string,string>[], 'commission_tier'),
    months:   uniq(months.data as Record<string,string>[], 'prescription_month'),
  });
}
