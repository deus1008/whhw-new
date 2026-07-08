import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

export const dynamic = 'force-dynamic';

export type PrescriptionMemo = {
  id: string;
  sourceName: string;
  memo: string;
  authorName: string;
  createdAt: string;
  createdBy: string;
};

/* ── GET: 회사 전체 메모 조회 ── */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const isAdmin   = profileIsAdmin(profile);
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let q = db.from('prescription_memos')
    .select('id, source_name, memo, author_name, created_at, created_by')
    .order('created_at', { ascending: false });

  if (companyId) q = q.eq('company_id', companyId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memos: PrescriptionMemo[] = (data ?? []).map(r => ({
    id:         r.id,
    sourceName: r.source_name,
    memo:       r.memo,
    authorName: r.author_name,
    createdAt:  r.created_at,
    createdBy:  r.created_by ?? '',
  }));

  return NextResponse.json({ memos });
}

/* ── POST: 메모 추가 ── */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const isAdmin   = profileIsAdmin(profile);
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);

  const body = await request.json() as { sourceName?: string; memo?: string };
  const { sourceName, memo } = body;
  if (!sourceName || !memo?.trim())
    return NextResponse.json({ error: 'sourceName and memo required' }, { status: 400 });

  const authorName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name    as string | undefined) ||
    user.email?.split('@')[0] ||
    '익명';

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await db
    .from('prescription_memos')
    .insert({
      company_id:  companyId ?? null,
      source_name: sourceName,
      memo:        memo.trim(),
      created_by:  user.id,
      author_name: authorName,
    })
    .select('id, source_name, memo, author_name, created_at, created_by')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    memo: {
      id:         data.id,
      sourceName: data.source_name,
      memo:       data.memo,
      authorName: data.author_name,
      createdAt:  data.created_at,
      createdBy:  data.created_by,
    } as PrescriptionMemo,
  });
}

/* ── DELETE: 메모 삭제 ── */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const isAdmin = profileIsAdmin(profile);
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 작성자 또는 관리자만 삭제 가능
  let q = db.from('prescription_memos').delete().eq('id', id);
  if (!isAdmin) q = q.eq('created_by', user.id);

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
