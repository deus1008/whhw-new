import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { extractText } from '@/lib/rag/extract';
import { extractProductsFromText } from '@/lib/products/extract';
import { parseDrugPriceBuffer } from '@/lib/drug-prices/parse';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 누락되었습니다.');
  return createSupabaseClient(url, key);
}

export async function POST(request: Request) {
  // ── 1. 인증 ────────────────────────────────────────────────────────────
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

  // ── 2. 요청 파싱 ────────────────────────────────────────────────────────
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

  // ── 3. 문서 조회 ────────────────────────────────────────────────────────
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, filename, file_type, storage_path, uploaded_by, category')
    .eq('id', documentId)
    .single();

  if (docErr || !doc) {
    return Response.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 });
  }

  if (profile.role === 'uploader' && doc.uploaded_by !== user.id) {
    return Response.json({ error: '처리 권한이 없습니다.' }, { status: 403 });
  }

  async function fail(message: string) {
    console.error(`[process:${documentId}] ${message}`);
    await supabase
      .from('documents')
      .update({ status: 'error', error_message: message })
      .eq('id', documentId);
    return Response.json({ error: message }, { status: 500 });
  }

  // ── 4. running 상태 설정 ────────────────────────────────────────────────
  await supabase
    .from('documents')
    .update({ status: 'running', error_message: null })
    .eq('id', documentId);

  // ── 5. 파일 다운로드 ────────────────────────────────────────────────────
  const { data: blob, error: downloadErr } = await supabase.storage
    .from('documents')
    .download(doc.storage_path);

  if (downloadErr || !blob) {
    return fail(`파일 다운로드 실패: ${downloadErr?.message ?? '알 수 없는 오류'}`);
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  // ── 6. 텍스트 추출 ─────────────────────────────────────────────────────
  let rawText: string;
  try {
    rawText = await extractText(buffer, doc.file_type);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return fail(`텍스트 추출 실패 [${doc.file_type.toUpperCase()}]: ${detail}`);
  }

  if (!rawText.trim()) {
    return fail('추출된 텍스트가 없습니다. 스캔 이미지 PDF이거나 빈 파일일 수 있습니다.');
  }

  // ── 7. 약가 폴더 → drug_prices 자동 파싱 ─────────────────────────────
  if (doc.category === '약가') {
    try {
      console.log(`[process:${documentId}] 약가 폴더 감지 → drug_prices 파싱 시작`);
      const { rows, total, error: parseError } = parseDrugPriceBuffer(buffer, doc.filename);

      if (parseError) {
        console.warn(`[process:${documentId}] 약가 파싱 오류:`, parseError);
        // 파싱 실패 시 문서는 error 상태로 설정
        return fail(`약가 파싱 실패: ${parseError}`);
      }

      if (rows.length > 0) {
        // 같은 파일명 기존 데이터 삭제 후 재삽입
        await supabase.from('drug_prices').delete().eq('source_file', doc.filename);

        const CHUNK = 1000;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error: insErr } = await supabase
            .from('drug_prices')
            .insert(rows.slice(i, i + CHUNK));
          if (insErr) {
            console.warn(`[process:${documentId}] 약가 삽입 오류 (batch ${i}):`, insErr.message);
          }
        }
        console.log(`[process:${documentId}] 약가 ${rows.length}/${total}건 drug_prices 저장 완료`);
      } else {
        console.log(`[process:${documentId}] 약가 데이터 없음`);
      }
    } catch (e) {
      console.warn(`[process:${documentId}] 약가 처리 오류 (무시):`, e);
    }
  }

  // ── 7b. 허가현황 폴더 → 발매예정품목 자동 추출 ────────────────────────
  let extractedCount = 0;
  if (doc.category === '허가현황') {
    try {
      console.log(`[process:${documentId}] 허가현황 감지 → 제품 자동 추출 시작`);
      const products = await extractProductsFromText(rawText);

      if (products.length > 0) {
        await supabase
          .from('upcoming_products')
          .delete()
          .eq('source_document_id', documentId);

        const now = new Date().toISOString();
        const makeRow = (p: typeof products[0], includeSourceId: boolean) => {
          let launch = p.launch_date?.trim() || null;
          if (launch && /^\d{4}-\d{2}$/.test(launch)) launch = `${launch}-01`;
          const row: Record<string, unknown> = {
            title:           p.title.trim(),
            memo:            p.ingredient?.trim() || null,
            manufacturer:    p.manufacturer?.trim() || null,
            launch_date:     launch,
            indication:      p.indication?.trim() || null,
            status:          p.status || '발매예정',
            insurance_code:  p.insurance_code?.trim() || null,
            insurance_price: p.insurance_price?.trim() || null,
            created_at:      now,
            updated_at:      now,
          };
          if (includeSourceId) row.source_document_id = documentId;
          return row;
        };

        // source_document_id 컬럼이 있으면 기존 데이터 삭제 후 재삽입
        let includeSourceId = true;
        const rows = products.map(p => makeRow(p, true));

        const { error: prodErr } = await supabase
          .from('upcoming_products')
          .insert(rows);

        if (prodErr) {
          // source_document_id 컬럼 미생성 시 해당 컬럼 없이 재시도
          if (prodErr.message.includes('source_document_id') || prodErr.code === '42703') {
            console.warn(`[process:${documentId}] source_document_id 컬럼 없음, 컬럼 제외 재시도`);
            includeSourceId = false;
            const rowsWithout = products.map(p => makeRow(p, false));
            const { error: prodErr2 } = await supabase
              .from('upcoming_products')
              .insert(rowsWithout);
            if (prodErr2) {
              console.warn(`[process:${documentId}] 제품 삽입 실패 (재시도):`, prodErr2.message);
            } else {
              extractedCount = rowsWithout.length;
              console.log(`[process:${documentId}] 제품 ${extractedCount}건 자동 등록 (source_id 제외)`);
            }
          } else {
            console.warn(`[process:${documentId}] 제품 삽입 실패:`, prodErr.message);
          }
        } else {
          extractedCount = rows.length;
          console.log(`[process:${documentId}] 제품 ${extractedCount}건 자동 등록`);
        }
        void includeSourceId; // suppress unused warning
      }
    } catch (e) {
      console.warn(`[process:${documentId}] 제품 추출 오류 (무시):`, e);
    }
  }

  // ── 8. 완료 ────────────────────────────────────────────────────────────
  await supabase
    .from('documents')
    .update({ status: 'ready', error_message: null })
    .eq('id', documentId);

  return Response.json({ ok: true, extracted: extractedCount });
}
