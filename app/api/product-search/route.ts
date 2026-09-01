import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export type ProductHit = {
  product_name: string;
  insurance_code: string | null;
  representative_code: string | null;
  manufacturer: string | null;
  ingredient_name: string | null;
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 1) return NextResponse.json({ items: [] });

  const svc = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const cols = 'product_name, insurance_code, representative_code, manufacturer, ingredient_name';

  const isCode = /^\d+$/.test(q);
  const { data, error } = isCode
    ? await svc.from('products').select(cols).or(`insurance_code.ilike.${q}%,representative_code.ilike.${q}%`).limit(30)
    : await svc.from('products').select(cols).ilike('product_name', `%${q}%`).limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as ProductHit[];
  if (!isCode) {
    const ql = q.toLowerCase();
    rows.sort((a, b) => {
      const as = a.product_name.toLowerCase().startsWith(ql) ? 0 : 1;
      const bs = b.product_name.toLowerCase().startsWith(ql) ? 0 : 1;
      return as - bs || a.product_name.length - b.product_name.length;
    });
  }
  return NextResponse.json({ items: rows.slice(0, 25) });
}
