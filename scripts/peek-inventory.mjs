import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

// .env.local에서 읽은 값으로 교체
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('환경변수 누락:', { URL: !!URL, KEY: !!KEY });
  process.exit(1);
}

const svc = createClient(URL, KEY);

// 재고관리 카테고리 문서 조회
const { data: docs, error: docsErr } = await svc
  .from('documents')
  .select('id, filename, storage_path, category')
  .ilike('category', '%재고%')
  .order('created_at', { ascending: false })
  .limit(5);

if (docsErr) {
  console.error('문서 조회 오류:', docsErr);
}

console.log('재고 관련 문서:', JSON.stringify(docs, null, 2));

// 재고 문서가 없으면 전체 카테고리 목록 조회
if (!docs || docs.length === 0) {
  console.log('\n재고 문서 없음. 전체 카테고리 목록 조회...');
  const { data: cats } = await svc
    .from('documents')
    .select('category')
    .order('created_at', { ascending: false })
    .limit(50);
  const uniqueCats = [...new Set((cats || []).map(r => r.category))];
  console.log('전체 카테고리:', uniqueCats);

  // 최근 문서 5개도 조회
  const { data: recent } = await svc
    .from('documents')
    .select('id, filename, storage_path, category, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('\n최근 문서 10개:', JSON.stringify(recent, null, 2));
}

if (docs && docs.length > 0) {
  const doc = docs[0];
  console.log('\n파일:', doc.filename);
  const { data: blob, error: blobErr } = await svc.storage.from('documents').download(doc.storage_path);
  if (blobErr) {
    console.error('파일 다운로드 오류:', blobErr);
  } else if (blob) {
    const buf = Buffer.from(await blob.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    console.log('\n시트 목록:', wb.SheetNames);
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      console.log(`\n=== 시트: ${name} (전체 ${rows.length}행) ===`);
      // 처음 5행 출력
      rows.slice(0, 5).forEach((row, i) => console.log(`  행${i}:`, JSON.stringify(row)));
    }
  }
}
