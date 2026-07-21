/**
 * GET /api/sales-forecast
 *   mode=ingredients&q=  → 성분키(ubist ingredient_name) 검색
 *   mode=market&key=     → 시장 landscape
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { listIngredients, buildMarket } from '@/lib/sales-forecast/market';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function svc() {
  return createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('status').eq('id', user.id).single();
  if (!profile || (profile.status as string) !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const mode = sp.get('mode') ?? 'ingredients';

  try {
    if (mode === 'ingredients') {
      const ingredients = await listIngredients(svc(), sp.get('q') ?? '');
      return NextResponse.json({ ingredients });
    }
    if (mode === 'market') {
      const key = sp.get('key');
      if (!key) return NextResponse.json({ error: 'key 필요' }, { status: 400 });
      const market = await buildMarket(svc(), key);
      return NextResponse.json({ market });
    }
    return NextResponse.json({ error: 'unknown mode' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
