import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { extractText } from '@/lib/rag/extract';
import { extractProductsFromText } from '@/lib/products/extract';
import { parseDrugPriceBuffer } from '@/lib/drug-prices/parse';
import { parseTrendBuffer }    from '@/lib/trend/parse';

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
  const category = (doc.category ?? '') as string;
  const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(1);
  console.log(`[process:${documentId}] 폴더: "${category}", 파일: ${doc.filename}, 크기: ${fileSizeMB}MB`);

  // ══════════════════════════════════════════════════════════════════════
  // 폴더별 처리 분기
  // ══════════════════════════════════════════════════════════════════════

  // ── A. 약가 폴더 ────────────────────────────────────────────────────────
  if (category === '약가') {
    const { rows, total, error: parseError } = parseDrugPriceBuffer(buffer, doc.filename);
    if (parseError) return fail(`약가 파싱 실패: ${parseError}`);

    if (rows.length > 0) {
      await supabase.from('drug_prices').delete().eq('source_file', doc.filename);
      const CHUNK = 1000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await supabase.from('drug_prices').insert(rows.slice(i, i + CHUNK));
        if (insErr) console.warn(`[process:${documentId}] 약가 삽입 오류 (batch ${i}):`, insErr.message);
      }
      console.log(`[process:${documentId}] 약가 ${rows.length}/${total}건 저장 완료`);
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted: rows.length });
  }

  // ── B. 허가현황 폴더 ────────────────────────────────────────────────────
  if (category === '허가현황') {
    let rawText: string;
    try {
      rawText = await extractText(buffer, doc.file_type);
    } catch (err) {
      return fail(`텍스트 추출 실패 [${doc.file_type.toUpperCase()}]: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!rawText.trim()) return fail('추출된 텍스트가 없습니다.');

    let extractedCount = 0;
    try {
      const products = await extractProductsFromText(rawText);
      if (products.length > 0) {
        await supabase.from('upcoming_products').delete().eq('source_document_id', documentId);
        const now = new Date().toISOString();
        const makeRow = (p: typeof products[0], withSrcId: boolean) => {
          let launch = p.launch_date?.trim() || null;
          if (launch && /^\d{4}-\d{2}$/.test(launch)) launch = `${launch}-01`;
          const row: Record<string, unknown> = {
            title: p.title.trim(), memo: p.ingredient?.trim() || null,
            manufacturer: p.manufacturer?.trim() || null, launch_date: launch,
            indication: p.indication?.trim() || null, status: p.status || '발매예정',
            insurance_code: p.insurance_code?.trim() || null, insurance_price: p.insurance_price?.trim() || null,
            created_at: now, updated_at: now,
          };
          if (withSrcId) row.source_document_id = documentId;
          return row;
        };
        const { error: prodErr } = await supabase.from('upcoming_products').insert(products.map(p => makeRow(p, true)));
        if (prodErr && (prodErr.message.includes('source_document_id') || prodErr.code === '42703')) {
          const { error: e2 } = await supabase.from('upcoming_products').insert(products.map(p => makeRow(p, false)));
          if (!e2) extractedCount = products.length;
        } else if (!prodErr) {
          extractedCount = products.length;
        }
        console.log(`[process:${documentId}] 제품 ${extractedCount}건 자동 등록`);
      }
    } catch (e) {
      console.warn(`[process:${documentId}] 제품 추출 오류 (무시):`, e);
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, extracted: extractedCount });
  }

  // ── C. 트랜드분析 폴더 → trend_prescriptions 파싱 ──────────────────────
  if (category === '트랜드분析') {
    // 파일 크기 제한: 50MB 초과 시 오류 (Vercel 메모리 한계)
    const sizeMB = buffer.length / 1024 / 1024;
    if (sizeMB > 50) {
      return fail(
        `파일 크기(${sizeMB.toFixed(0)}MB)가 너무 큽니다. ` +
        `처방실적 파일은 월별로 분리하여 업로드해 주세요 (권장: 50MB 이하).`
      );
    }

    const { rows, total, error: parseError } = parseTrendBuffer(buffer, doc.filename);
    if (parseError) return fail(`처방실적 파싱 실패: ${parseError}`);

    if (rows.length > 0) {
      await supabase.from('trend_prescriptions').delete().eq('source_file', doc.filename);
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await supabase.from('trend_prescriptions').insert(rows.slice(i, i + CHUNK));
        if (insErr) console.warn(`[process:${documentId}] 트랜드 삽입 오류 (batch ${i}):`, insErr.message);
        else inserted += rows.slice(i, i + CHUNK).length;
      }
      console.log(`[process:${documentId}] 트랜드 ${inserted}/${total}건 저장 완료`);
    } else {
      console.log(`[process:${documentId}] 트랜드 유효 행 없음 (전체 ${total}행)`);
    }

    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted: rows.length });
  }

  // ── D. 그 외 폴더 — 즉시 완료 ─────────────────────────────────────────
  console.log(`[process:${documentId}] 일반 폴더(${category || '미분류'}) → 즉시 완료`);
  await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
  return Response.json({ ok: true });
}
