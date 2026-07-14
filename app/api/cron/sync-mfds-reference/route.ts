import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncDataset } from '@/lib/mfds/sync-reference';
import { syncHiraPrices } from '@/lib/mfds/sync-hira-price';
import { matchProductsReference } from '@/lib/products/match-reference';
import type { RefDataset } from '@/lib/mfds/reference-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 식약처/HIRA 공식 API → DB 적재(주기적 cron). CRON_SECRET 로 보호.
// ?dataset=bioeq|dmf|reference|permit|match|all  (기본 all)
//   개별 dataset 을 각각 호출하면 서버리스 300s 타임아웃 위험을 분산할 수 있음.
//   Vercel cron 은 dataset 별로 분리 스케줄(vercel.json) 하여 안전하게 순차 적재.

const DATASETS: RefDataset[] = ['bioeq', 'dmf', 'reference', 'permit'];

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const which = (new URL(request.url).searchParams.get('dataset') ?? 'all').toLowerCase();

  const result: Record<string, unknown> = {};
  try {
    // 약가(HIRA) — 별도 소스
    if (which === 'price' || which === 'all') {
      result.price = await syncHiraPrices(svc);
    }
    const toSync = which === 'all' ? DATASETS : (DATASETS.includes(which as RefDataset) ? [which as RefDataset] : []);
    for (const d of toSync) {
      const r = await syncDataset(svc, d);
      result[d] = r.count;
    }
    // 매칭(제품 마스터 보강) — dataset=match 또는 all
    if (which === 'match' || which === 'all') {
      const { data: companies } = await svc.from('client_companies').select('id');
      let agg = { bio: 0, dmf: 0, ref: 0, permit: 0, detail: 0 };
      for (const c of (companies ?? [])) {
        const m = await matchProductsReference(svc, (c as { id: string }).id);
        agg = { bio: agg.bio + m.bio, dmf: agg.dmf + m.dmf, ref: agg.ref + m.ref, permit: agg.permit + m.permit, detail: agg.detail + m.detail };
      }
      result.match = agg;
    }
    return NextResponse.json({ ok: true, dataset: which, result, at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, dataset: which, result, error: (e as Error).message }, { status: 500 });
  }
}
