import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildDiseaseStrengths } from '@/lib/disease-learning/build-strengths';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 질환학습 4단계 함량 사전계산 → disease_drug_strengths 갱신 (주간 cron). CRON_SECRET 로 보호.
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const result = await buildDiseaseStrengths(svc);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
