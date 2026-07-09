import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { stripCompanyAffix } from '@/lib/format';

export const revalidate = 300;

function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증' }, { status: 401 });

  const { data: profile } = await authClient
    .from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved')
    return NextResponse.json({ error: '권한' }, { status: 403 });

  const { data } = await serviceClient()
    .from('customer_status')
    .select('manager, region, customer_name, address')
    .not('manager', 'is', null);

  const cleaned = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    customer_name: stripCompanyAffix(String(r.customer_name ?? '')),
  }));
  return NextResponse.json(cleaned);
}
