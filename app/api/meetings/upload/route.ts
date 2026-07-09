import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BUCKET = 'meeting-attachments';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: '요청 파싱 실패' }, { status: 400 }); }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

  const MAX = 20 * 1024 * 1024;
  if (file.size > MAX) return NextResponse.json({ error: '20MB 이하 파일만 업로드할 수 있습니다.' }, { status: 413 });

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const rand = Math.random().toString(36).slice(2, 9);
  const path = `${user.id}/${Date.now()}-${rand}.${ext}`;

  const db = svc();

  // 버킷이 없으면 생성 (이미 존재하면 무시)
  const { error: bucketErr } = await db.storage.createBucket(BUCKET, { public: true });
  if (bucketErr && !bucketErr.message?.toLowerCase().includes('already exist')) {
    return NextResponse.json({ error: bucketErr.message }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url:  publicUrl,
    name: file.name,
    size: file.size,
    mime: file.type,
    type: file.type.startsWith('image/') ? 'image' : 'file',
  });
}
