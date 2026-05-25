/**
 * 로컬 폴더 → Supabase RAG 인덱싱 스크립트
 *
 * 사용법:
 *   npm run sync:docs           # 신규/변경 파일만 인덱싱
 *   npm run sync:docs -- --force  # 전체 재인덱싱
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { extractText } from '../lib/rag/extract';
import { chunkText } from '../lib/rag/chunk';
import { embedTexts } from '../lib/rag/embed';

// ── 설정 ─────────────────────────────────────────────────────────────────────

const LOCAL_DOCS_PATH =
  'C:\\Users\\user\\OneDrive - 아주헬스케어그룹\\아주약품';

const SUPPORTED_EXT = new Set(['.pdf', '.docx', '.xlsx', '.xls']);
const FORCE         = process.argv.includes('--force');
const CHUNK_BATCH   = 50;

// ── Supabase 클라이언트 ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

function createServiceClient(): DB {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.\n' +
      '  → npm run sync:docs 명령을 사용하면 .env.local이 자동으로 로드됩니다.'
    );
  }
  return createClient(url, key) as DB;
}

// ── 파일 스캔 ─────────────────────────────────────────────────────────────────

function scanFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`폴더를 찾을 수 없습니다: ${dir}`);
  }
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...scanFiles(fullPath));
    } else if (SUPPORTED_EXT.has(path.extname(entry.name).toLowerCase())) {
      result.push(fullPath);
    }
  }
  return result;
}

// ── 파일 1개 처리 ─────────────────────────────────────────────────────────────

async function processFile(
  supabase: DB,
  filePath: string,
  adminId: string,
): Promise<'skipped' | 'ok' | 'error'> {
  const filename = path.basename(filePath);
  const rawExt   = path.extname(filename).slice(1).toLowerCase();
  const fileType = rawExt === 'xls' ? 'xlsx' : rawExt;

  // 파일 수정 시각 (변경 감지용)
  const mtime = fs.statSync(filePath).mtime.toISOString();

  // 기존 레코드 확인
  const { data: existing } = await supabase
    .from('documents')
    .select('id, status, category')
    .eq('storage_path', filePath)
    .maybeSingle();

  if (existing?.status === 'ready' && existing?.category === mtime && !FORCE) {
    process.stdout.write(`  ⏭  스킵 (변경 없음)\n`);
    return 'skipped';
  }

  // documents 레코드 생성 또는 업데이트
  let documentId: string;
  if (existing) {
    await supabase
      .from('documents')
      .update({ status: 'processing', error_message: null, category: mtime })
      .eq('id', existing.id);
    documentId = existing.id;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('documents')
      .insert({
        filename,
        file_type:    fileType,
        storage_path: filePath,
        category:     mtime,
        uploaded_by:  adminId,
        status:       'processing',
        error_message: null,
      })
      .select('id')
      .single();
    if (insertErr || !inserted) {
      process.stdout.write(`  ❌ 레코드 생성 실패: ${insertErr?.message}\n`);
      return 'error';
    }
    documentId = inserted.id;
  }

  async function fail(msg: string): Promise<'error'> {
    process.stdout.write(`  ❌ ${msg}\n`);
    await supabase
      .from('documents')
      .update({ status: 'error', error_message: msg })
      .eq('id', documentId);
    return 'error';
  }

  // 텍스트 추출
  let rawText: string;
  try {
    const buffer = fs.readFileSync(filePath);
    rawText = await extractText(buffer, fileType);
  } catch (err) {
    return fail(`텍스트 추출 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!rawText.trim()) {
    return fail('추출된 텍스트가 없습니다. 스캔 이미지 PDF이거나 빈 파일일 수 있습니다.');
  }

  // 청킹
  const chunks = chunkText(rawText);
  if (chunks.length === 0) return fail('청크 생성 실패');
  process.stdout.write(`  ✂  ${chunks.length}개 청크`);

  // 임베딩
  let embeddings: number[][];
  try {
    embeddings = await embedTexts(chunks);
  } catch (err) {
    return fail(`임베딩 실패: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 기존 청크 삭제 후 새 청크 저장
  await supabase.from('document_chunks').delete().eq('document_id', documentId);

  for (let i = 0; i < chunks.length; i += CHUNK_BATCH) {
    const rows = chunks.slice(i, i + CHUNK_BATCH).map((content, j) => ({
      document_id: documentId,
      chunk_index: i + j,
      content,
      embedding:   embeddings[i + j],
    }));
    const { error: batchErr } = await supabase.from('document_chunks').insert(rows);
    if (batchErr) return fail(`청크 저장 실패: ${batchErr.message}`);
  }

  // 상태 완료
  await supabase
    .from('documents')
    .update({ status: 'ready', error_message: null })
    .eq('id', documentId);

  process.stdout.write(` → ✅ 완료\n`);
  return 'ok';
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createServiceClient();

  // 관리자 ID 조회
  const { data: adminProfile, error: adminErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

  if (adminErr || !adminProfile) {
    throw new Error(`관리자 계정을 찾을 수 없습니다: ${adminErr?.message}`);
  }
  const adminId = adminProfile.id;

  // 파일 스캔
  const files = scanFiles(LOCAL_DOCS_PATH);
  console.log(`\n📁 ${LOCAL_DOCS_PATH}`);
  console.log(`   ${files.length}개 파일 발견${FORCE ? ' (--force: 전체 재인덱싱)' : ''}\n`);

  let okCount      = 0;
  let skipCount    = 0;
  let errorCount   = 0;

  for (const filePath of files) {
    const relPath = path.relative(LOCAL_DOCS_PATH, filePath);
    process.stdout.write(`📄 ${relPath}\n`);
    const result = await processFile(supabase, filePath, adminId);
    if (result === 'ok')      okCount++;
    else if (result === 'skipped') skipCount++;
    else                      errorCount++;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ 완료: ${okCount}개  ⏭ 스킵: ${skipCount}개  ❌ 오류: ${errorCount}개`);
}

main().catch(err => {
  console.error('\n❌ 스크립트 오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
