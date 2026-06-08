import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) return NextResponse.json({ error: authError.message, step: 'getUser' });
  if (!user) return NextResponse.json({ error: 'no user', step: 'getUser' });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  const normalized = profile?.role ? normalizeRole(profile.role as string) : null;
  const isAdmin = normalized === '관리자';

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    profile,
    profileError: profileError?.message ?? null,
    normalized,
    isAdmin,
  });
}
