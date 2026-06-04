/**
 * 트렌드분析 파일 진단 엔드포인트
 * GET /api/trend/debug → 최신 xlsb 파일의 컬럼명 + 첫 3행 샘플 반환
 */
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const sb = serviceClient();

  // 모든 xlsb/xlsx 문서 카테고리 확인
  const { data: allDocs } = await sb
    .from('documents')
    .select('id, filename, storage_path, category, status')
    .or('filename.ilike.%.xlsb,filename.ilike.%.xlsx,filename.ilike.%.xls')
    .order('created_at', { ascending: false })
    .limit(20);

  // 카테고리가 트렌드 관련인 문서 탐색 (느슨한 매칭)
  const trendDoc = (allDocs ?? []).find(d => {
    const cat = String(d.category ?? '');
    return cat.includes('트렌드') || cat.includes('trend') || cat.includes('Trend');
  });

  if (!trendDoc) {
    return NextResponse.json({
      error: '트렌드 관련 폴더의 Excel/XLSB 문서를 찾을 수 없습니다.',
      allCategories: (allDocs ?? []).map(d => ({
        filename: d.filename,
        category: d.category,
        categoryHex: Buffer.from(String(d.category ?? ''), 'utf8').toString('hex'),
        status: d.status,
      })),
    });
  }

  const doc = trendDoc as { id: string; filename: string; storage_path: string; category: string; status: string };

  // 파일 다운로드
  const { data: blob, error: dlErr } = await sb.storage
    .from('documents')
    .download(doc.storage_path);

  if (dlErr || !blob) {
    return NextResponse.json({ error: `다운로드 실패: ${dlErr?.message}` });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  // 파싱
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    return NextResponse.json({ error: `XLSX 파싱 실패: ${e instanceof Error ? e.message : String(e)}` });
  }

  const sheetNames = wb.SheetNames;
  const results: Record<string, unknown>[] = [];

  for (const sheetName of sheetNames.slice(0, 3)) {
    const ws = wb.Sheets[sheetName];

    // 방법 1: 기본 sheet_to_json (첫 행 = 헤더)
    const rows1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
    const cols1 = rows1.length > 0 ? Object.keys(rows1[0]) : [];

    // 방법 2: 원시 배열 (첫 5행)
    const rawArr = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    const first5 = rawArr.slice(0, 5);

    results.push({
      sheetName,
      totalRows: rows1.length,
      columns: cols1,
      columnCount: cols1.length,
      // 처방금액 후보 컬럼
      amountCandidates: cols1.filter(c => c.includes('금액') || c.includes('amount') || c.includes('Amount')),
      // 첫 5행 원시 데이터
      first5Rows: first5,
      // 첫 3행 오브젝트
      sample3: rows1.slice(0, 3),
    });
  }

  return NextResponse.json({
    filename: doc.filename,
    category: doc.category,
    sheetNames,
    sheets: results,
  }, { status: 200 });
}
