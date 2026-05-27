import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { extractText } from '@/lib/rag/extract';
import { chunkText } from '@/lib/rag/chunk';
import { embedTexts } from '@/lib/rag/embed';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300; // Vercel: 최대 5분

/** RLS를 우회하는 서비스 롤 클라이언트 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 누락되었습니다.');
  return createSupabaseClient(url, key);
}

export async function POST(request: Request) {
  // ── 1. 호출자 인증 (일반 서버 클라이언트로 세션 확인) ──────────────────
  const authClient = await createServerClient();
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
    return Response.json({ error: '업로드 권한이 없습니다.' }, { status: 403 });
  }

  // ── 2. 요청 파싱 ──────────────────────────────────────────────────────
  let documentId: string;
  try {
    const body = await request.json();
    documentId = body.documentId;
    if (!documentId) throw new Error('documentId가 필요합니다.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : '잘못된 요청 형식';
    return Response.json({ error: msg }, { status: 400 });
  }

  const supabase = createServiceClient();

  // ── 3. 문서 레코드 조회 ───────────────────────────────────────────────
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, filename, file_type, storage_path, uploaded_by')
    .eq('id', documentId)
    .single();

  if (docErr || !doc) {
    console.error('[process] 문서 조회 실패', docErr);
    return Response.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 업로더는 본인 문서만 처리 가능
  if (profile.role === 'uploader' && doc.uploaded_by !== user.id) {
    return Response.json({ error: '처리 권한이 없습니다.' }, { status: 403 });
  }

  /** 처리 실패 시 status와 error_message를 기록하고 에러 응답 반환 */
  async function fail(message: string) {
    console.error(`[process:${documentId}] ${message}`);
    await supabase
      .from('documents')
      .update({ status: 'error', error_message: message })
      .eq('id', documentId);
    return Response.json({ error: message }, { status: 500 });
  }

  // ── 3.5 처리 시작 – running 상태 설정 ────────────────────────────────
  // 클라이언트가 연결을 끊어도 DB에 running 상태가 남아 UI에서 감지 가능
  const { error: runningErr } = await supabase
    .from('documents')
    .update({ status: 'running', error_message: null })
    .eq('id', documentId);
  if (runningErr) {
    console.warn(`[process:${documentId}] running 상태 업데이트 실패 (계속 진행)`, runningErr);
  }

  // ── 4. Storage에서 원본 파일 다운로드 ────────────────────────────────
  const { data: blob, error: downloadErr } = await supabase.storage
    .from('documents')
    .download(doc.storage_path);

  if (downloadErr || !blob) {
    return fail(`파일 다운로드 실패: ${downloadErr?.message ?? '알 수 없는 오류'}`);
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  // ── 5. 텍스트 추출 ────────────────────────────────────────────────────
  let rawText: string;
  try {
    rawText = await extractText(buffer, doc.file_type);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '텍스트 추출 실패';
    return fail(msg);
  }

  if (!rawText.trim()) {
    return fail('추출된 텍스트가 없습니다. 스캔 이미지 PDF이거나 빈 파일일 수 있습니다.');
  }

  // ── 6. 청킹 ──────────────────────────────────────────────────────────
  const chunks = chunkText(rawText);
  if (chunks.length === 0) {
    return fail('텍스트를 청크로 분할할 수 없습니다.');
  }

  // ── 7. 임베딩 (배치) ─────────────────────────────────────────────────
  let embeddings: number[][];
  try {
    embeddings = await embedTexts(chunks);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '임베딩 생성 실패';
    return fail(`OpenAI 임베딩 오류: ${msg}`);
  }

  if (embeddings.length !== chunks.length) {
    return fail('임베딩 결과 수가 청크 수와 일치하지 않습니다.');
  }

  // ── 8. 기존 청크 삭제 후 새 청크 저장 ────────────────────────────────
  const { error: deleteErr } = await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId);

  if (deleteErr) {
    console.error('[process] 기존 청크 삭제 실패 (계속 진행)', deleteErr);
  }

  const CHUNK_INSERT_BATCH = 50;
  for (let i = 0; i < chunks.length; i += CHUNK_INSERT_BATCH) {
    const batch = chunks.slice(i, i + CHUNK_INSERT_BATCH);
    const rows  = batch.map((content, j) => ({
      document_id: documentId,
      chunk_index: i + j,
      content,
      embedding: embeddings[i + j],
    }));

    const { error: insertErr } = await supabase
      .from('document_chunks')
      .insert(rows);

    if (insertErr) {
      return fail(`청크 저장 실패 (batch ${i}): ${insertErr.message}`);
    }
  }

  // ── 9. 상태 업데이트 ─────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('documents')
    .update({ status: 'ready', error_message: null })
    .eq('id', documentId);

  if (updateErr) {
    console.error('[process] status 업데이트 실패', updateErr);
  }

  return Response.json({
    ok:     true,
    chunks: chunks.length,
  });
}
