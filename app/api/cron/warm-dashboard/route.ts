import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// /weekly 대시보드 집계 캐시를 주기적으로 미리 채워(pre-warm) DB 버퍼와
// dashboard_rpc_cache 를 항상 웜 상태로 유지 → 콜드 재계산(수 초) 스파이크 제거.
//
// ⚠ 캐시 키/파라미터 규칙은 app/weekly/page.tsx 와 반드시 동일해야 함:
//   - settKey: `sett:${companyId}:${sinceMonth}`  (sinceMonth = 6개월 전 YYYY-MM)
//   - ediKey:  `edi:${companyId}:${months.join(',')}` (months = [전년동월, 직전월, 최신월] YYYYMM)

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // sinceMonth = 6개월 전 (page.tsx since4mStr 과 동일)
  const now = new Date();
  const s = new Date(now);
  s.setMonth(s.getMonth() - 6);
  const sinceMonth = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}`;

  // RPC null(타임아웃) 방어 재시도
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function rpc(fn: string, args: Record<string, unknown>): Promise<any> {
    for (let i = 0; i < 3; i++) {
      const { data, error } = await svc.rpc(fn, args);
      if (!error && data != null) return data;
    }
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function store(cacheKey: string, companyId: string, payload: any) {
    await svc.from('dashboard_rpc_cache').upsert({
      cache_key: cacheKey, company_id: companyId, payload, computed_at: new Date().toISOString(),
    });
  }

  const { data: companies } = await svc
    .from('client_companies').select('id').eq('status', 'active');

  const warmed: Record<string, string> = {};

  for (const c of (companies ?? [])) {
    const companyId = (c as { id: string }).id;

    // 정산 캐시
    const sett = await rpc('get_dashboard_settlements', { p_company_id: companyId, p_since_month: sinceMonth });
    if (sett != null) {
      await store(`sett:${companyId}:${sinceMonth}`, companyId, sett);
      warmed[`sett:${companyId.slice(0, 8)}`] = 'ok';
    }

    // 최신 EDI 처방월 → 타깃 3개월 (전년동월, 직전월, 최신월)
    const { data: latestRows } = await svc.from('trend_prescriptions')
      .select('prescription_month').eq('company_id', companyId)
      .not('prescription_month', 'is', null)
      .order('prescription_month', { ascending: false }).limit(1);
    const latestRaw = (latestRows as { prescription_month: string }[] | null)?.[0]?.prescription_month;
    if (latestRaw) {
      const latest = /^\d{6}$/.test(latestRaw) ? latestRaw : latestRaw.replace(/[-.]/g, '');
      const yr = Number(latest.slice(0, 4)), mo = Number(latest.slice(4));
      const prev = mo === 1 ? `${yr - 1}12` : `${yr}${String(mo - 1).padStart(2, '0')}`;
      const sly  = `${yr - 1}${String(mo).padStart(2, '0')}`;
      const months = [sly, prev, latest];
      const edi = await rpc('get_edi_summary', { p_company_id: companyId, p_months: months });
      if (edi != null) {
        await store(`edi:${companyId}:${months.join(',')}`, companyId, edi);
        warmed[`edi:${companyId.slice(0, 8)}`] = 'ok';
      }
    }
  }

  console.log('[warm-dashboard]', new Date().toISOString(), JSON.stringify(warmed));
  return NextResponse.json({ ok: true, warmed, at: new Date().toISOString() });
}
