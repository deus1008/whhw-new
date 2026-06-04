/**
 * POST /api/trend/upload
 * 브라우저에서 파싱한 처방실적 행을 배치로 받아 DB에 저장
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  // 인증
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { data: profile } = await authClient
    .from('profiles').select('role, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved' || !['admin', 'uploader'].includes(profile.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const body = await req.json() as {
    sourceFile: string;
    rows: unknown[];
    isFirst?: boolean;   // 첫 배치: 기존 데이터 삭제
  };

  if (!body.sourceFile || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const sb = serviceClient();

  // 첫 배치에서 기존 데이터 삭제
  if (body.isFirst) {
    await sb.from('trend_prescriptions').delete().eq('source_file', body.sourceFile);
  }

  if (body.rows.length === 0) {
    return NextResponse.json({ inserted: 0 });
  }

  const { error: insErr } = await sb
    .from('trend_prescriptions')
    .insert(body.rows);

  if (insErr) {
    console.error('[trend/upload] insert error:', insErr.message);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: body.rows.length });
}

/* ── DELETE /api/trend/upload?file=xxx ── 파일 데이터 삭제 */
export async function DELETE(req: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { data: profile } = await authClient
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 삭제할 수 있습니다.' }, { status: 403 });
  }

  const file = req.nextUrl.searchParams.get('file') ?? '';
  if (!file) return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });

  const sb = serviceClient();
  await sb.from('trend_prescriptions').delete().eq('source_file', file);
  return NextResponse.json({ ok: true });
}
