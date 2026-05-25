/**
 * 로컬 폴더 경로로 인덱싱된 문서 전체 삭제
 * 사용법: npm run remove:local-docs
 */
import { createClient } from '@supabase/supabase-js';

// storage_path에 포함된 고유 키워드로 필터 (백슬래시 LIKE 문제 우회)
const PATH_KEYWORD = '아주헬스케어그룹';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('환경 변수가 없습니다.');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(url, key) as any;

  // 로컬 경로 키워드가 포함된 문서 전체 조회
  const { data: docs, error: fetchErr } = await supabase
    .from('documents')
    .select('id, filename, status')
    .ilike('storage_path', `%${PATH_KEYWORD}%`);

  if (fetchErr) throw new Error(`문서 조회 실패: ${fetchErr.message}`);

  if (!docs || docs.length === 0) {
    console.log('삭제할 문서가 없습니다.');
    return;
  }

  console.log(`삭제 대상: ${docs.length}개 문서`);

  const ids: string[] = docs.map((d: { id: string }) => d.id);

  // 청크 삭제 (배치)
  const BATCH = 200;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const { error } = await supabase
      .from('document_chunks')
      .delete()
      .in('document_id', batch);
    if (error) throw new Error(`청크 삭제 실패: ${error.message}`);
    process.stdout.write(`  청크 삭제 중… ${Math.min(i + BATCH, ids.length)}/${ids.length}\r`);
  }
  console.log('\n  청크 삭제 완료');

  // 문서 레코드 삭제 (배치)
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const { error } = await supabase
      .from('documents')
      .delete()
      .in('id', batch);
    if (error) throw new Error(`문서 삭제 실패: ${error.message}`);
  }
  console.log(`  문서 레코드 ${ids.length}개 삭제 완료`);
  console.log(`\n✅ 완료 — 로컬 폴더 문서 ${docs.length}개가 RAG에서 제거되었습니다.`);
}

main().catch(err => {
  console.error('❌ 오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
