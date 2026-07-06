import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await supabase.rpc('revoke_all_sessions');
  if (error) {
    console.error('[daily-logout] rpc error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[daily-logout] all sessions revoked at', new Date().toISOString());
  return NextResponse.json({ ok: true });
}
