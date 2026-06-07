import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { parseDrugPriceBuffer } from '@/lib/drug-prices/parse';

export const maxDuration = 300; // 대용량 파일 업로드 시 타임아웃 방지

/**
 * 약가 파일 업로드·조회 API
 *
 * GET  (no params)            — 업로드된 파일 목록 반환
 * GET  ?q={품목명}            — DB에서 약가 검색
 * POST multipart(file=...)   — Excel/CSV 파일 업로드 → drug_prices 테이블에 저장
 * DELETE ?file={파일명}       — 해당 파일의 데이터 전체 삭제
 */

/* ── 서비스 롤 클라이언트 (RLS 우회) ── */
function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/* ── 관리자 인증 ── */
async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (normalizeRole(profile?.role) !== '관리자') {
    return NextResponse.json({ error: '관리자만 접근할 수 있습니다.' }, { status: 403 });
  }
  return { userId: user.id };
}


/* ── GET: 파일 목록 또는 약가 검색 ── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  const sb = serviceClient();

  /* q 없음 → 업로드된 파일 목록 */
  if (!q) {
    const { data, error } = await sb
      .from('drug_prices')
      .select('source_file, created_at')
      .not('source_file', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200000);

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ files: [] });
      console.error('[drug-prices] list error:', error.message);
      return NextResponse.json({ files: [] });
    }

    // source_file별 집계
    const map = new Map<string, { source_file: string; row_count: number; uploaded_at: string }>();
    for (const row of (data ?? [])) {
      const name = String(row.source_file);
      if (!map.has(name)) {
        map.set(name, { source_file: name, row_count: 0, uploaded_at: String(row.created_at) });
      }
      map.get(name)!.row_count++;
    }
    return NextResponse.json({ files: Array.from(map.values()) });
  }

  /* q 있음 → 약가 검색 */
  const m   = q.match(/^([가-힣A-Za-z]+)/);
  const key = m ? m[1].slice(0, 6) : q.slice(0, 6);

  const { data, error } = await sb
    .from('drug_prices')
    .select('*')
    .ilike('item_name', `%${key}%`)
    .order('effective_date', { ascending: false })
    .limit(20);

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ prices: [] });
    console.error('[drug-prices] GET error:', error.message);
    return NextResponse.json({ prices: [] });
  }

  return NextResponse.json({ prices: data ?? [] });
}

/* ── DELETE: 파일 데이터 삭제 ── */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const fileName = (new URL(req.url).searchParams.get('file') ?? '').trim();
  if (!fileName) return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });

  const sb = serviceClient();
  const { error } = await sb
    .from('drug_prices')
    .delete()
    .eq('source_file', fileName);

  if (error && error.code !== '42P01') {
    console.error('[drug-prices] DELETE error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/* ── POST: Excel/CSV 업로드 ── */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  /* 파일 수신 */
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['xlsx', 'xls', 'xlsb', 'csv'].includes(ext)) {
    return NextResponse.json({ error: 'xlsx / xls / xlsb / csv 파일만 지원합니다.' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, total: rawTotal, error: parseError } = parseDrugPriceBuffer(buffer, file.name);

  if (parseError) {
    return NextResponse.json({ error: parseError }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: '유효한 품목명 데이터가 없습니다.' }, { status: 400 });
  }

  /* DB 저장: 같은 파일명 데이터 교체 */
  const sb = serviceClient();
  const { error: delErr } = await sb
    .from('drug_prices')
    .delete()
    .eq('source_file', file.name);

  if (delErr && delErr.code !== '42P01') {
    console.error('[drug-prices] delete error:', delErr);
  }

  /* 1000건씩 배치 삽입 */
  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: insErr } = await sb
      .from('drug_prices')
      .insert(rows.slice(i, i + CHUNK));

    if (insErr) {
      if (insErr.code === '42P01') {
        return NextResponse.json({
          error: 'drug_prices 테이블이 없습니다. Supabase SQL Editor에서 마이그레이션을 실행해 주세요.',
        }, { status: 500 });
      }
      console.error('[drug-prices] insert error:', insErr);
      return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });
    }
    inserted += rows.slice(i, i + CHUNK).length;
  }

  return NextResponse.json({
    success: true,
    inserted,
    total: rawTotal,
    fileName: file.name,
  });
}
