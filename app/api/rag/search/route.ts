import { createClient } from '@/lib/supabase/server';
import { searchDocuments } from '@/lib/rag/search';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authClient = await createClient();
  const { data: { user }, error: authErr } = await authClient.auth.getUser();

  if (authErr || !user) {
    return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { data: profile } = await authClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'uploader')) {
    return Response.json({ error: '검색 권한이 없습니다.' }, { status: 403 });
  }

  let query: string;
  try {
    const body = await request.json();
    query = body.query?.trim();
    if (!query) throw new Error('query가 필요합니다.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : '잘못된 요청 형식';
    return Response.json({ error: msg }, { status: 400 });
  }

  try {
    const results = await searchDocuments(query);
    console.log('[rag/search] 결과 수:', results.length);
    return Response.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '검색 중 오류 발생';
    console.error('[rag/search] 오류:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
