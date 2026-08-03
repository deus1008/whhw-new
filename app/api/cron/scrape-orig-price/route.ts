import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scrapeOrigPrices } from '@/lib/disease-learning/scrape-orig-price';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 대조약 최초 등재가(급여이력) 수집 → disease_orig_price. CRON_SECRET 보호.
// 최초등재가는 불변이라 자주 돌 필요 없음. ?limit=N 으로 실행당 브랜드 수 제한(300s 분산).
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? '400');
  try {
    const result = await scrapeOrigPrices(svc, { limitBrands: limit, onlyMissing: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
