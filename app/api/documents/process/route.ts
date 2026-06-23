import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { extractText } from '@/lib/rag/extract';
import { extractProductsFromText } from '@/lib/products/extract';
import { parseDrugPriceBuffer }      from '@/lib/drug-prices/parse';
import { parseCustomerBuffer }       from '@/lib/customers/parse';
import { parseCommissionBuffer }     from '@/lib/commission/parse';
import { parseSettlementBuffer, type SettlementColConfig } from '@/lib/commission-settlement/parse';
import { parseUbistBuffer } from '@/lib/ubist/parse';
import { parseBioequivBuffer } from '@/lib/bioequiv/parse';
import { parseDmfBuffer }      from '@/lib/dmf/parse';

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
    .select('role, roles')
    .eq('id', user.id)
    .single();

  if (!profile || !profileIsAdmin(profile)) {
    return Response.json({ error: '업로드 권한이 없습니다.' }, { status: 403 });
  }
  const isAdmin = true;

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

  if (!isAdmin && doc.uploaded_by !== user.id) {
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


  // ── D. 거래처현황 폴더 → customer_status 파싱 ───────────────────────────
  if (category === '거래처현황') {
    console.log(`[process:${documentId}] 거래처현황 폴더 → 거래처 데이터 파싱`);
    const { rows, total, error: parseError } = parseCustomerBuffer(buffer, doc.filename);

    if (parseError) return fail(`거래처 파싱 실패: ${parseError}`);

    if (rows.length > 0) {
      await supabase.from('customer_status').delete().eq('source_file', doc.filename);
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await supabase.from('customer_status').insert(rows.slice(i, i + CHUNK));
        if (insErr) console.warn(`[process:${documentId}] 거래처 삽입 오류:`, insErr.message);
        else inserted += rows.slice(i, i + CHUNK).length;
      }
      console.log(`[process:${documentId}] 거래처 ${inserted}/${total}건 저장 완료`);
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted: rows.length });
  }

  // ── E. 수수료율 폴더 → commission_rates 파싱 ────────────────────────────
  if (category === '수수료율' || category === '수수료율(딜러)' || category === '수수료율(제약사)') {
    console.log(`[process:${documentId}] 수수료율 폴더 → 수수료 데이터 파싱`);
    const { rows, total, error: parseError } = parseCommissionBuffer(buffer, doc.filename);

    if (parseError) return fail(`수수료율 파싱 실패: ${parseError}`);

    if (rows.length > 0) {
      // 동일 파일명 기준 삭제 → 다른 파일의 이력 보존
      await supabase.from('commission_rates').delete().eq('source_file', doc.filename);
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: insErr } = await supabase
          .from('commission_rates')
          .insert(chunk);
        if (insErr) console.warn(`[process:${documentId}] 수수료율 삽입 오류(chunk ${i}):`, insErr.message);
        else inserted += chunk.length;
      }
      console.log(`[process:${documentId}] 수수료율 ${inserted}/${total}건 저장 완료 (전체 초기화 후 재적재)`);
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted: rows.length });
  }

  // ── F. 수수료정산 폴더 → commission_settlements 파싱 ──────────────────
  if (category === '수수료정산') {
    console.log(`[process:${documentId}] 수수료정산 폴더 → 정산 데이터 파싱`);

    // DB에서 컬럼 설정 로드 (없으면 parse.ts 내 DEFAULT_COL_CONFIG 폴백)
    const { data: settingsRow } = await supabase
      .from('parse_settings')
      .select('value')
      .eq('key', 'settlement_columns')
      .single();
    const colConfig: SettlementColConfig = (settingsRow?.value as SettlementColConfig) ?? {};
    console.log(`[process:${documentId}] 컬럼 설정:`, JSON.stringify(colConfig));

    const { rows, total, error: parseError } = parseSettlementBuffer(buffer, doc.filename, colConfig);

    if (parseError) return fail(`수수료정산 파싱 실패: ${parseError}`);

    if (rows.length > 0) {
      // 동일 파일명 기준 삭제 → 재업로드 시 덮어쓰기
      await supabase.from('commission_settlements').delete().eq('source_file', doc.filename);
      const CHUNK = 500;
      let inserted = 0;
      let firstErr: string | null = null;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: insErr } = await supabase.from('commission_settlements').insert(chunk);
        if (insErr) {
          console.error(`[process:${documentId}] 정산 삽입 오류(chunk ${i}):`, insErr.message);
          if (!firstErr) firstErr = insErr.message;
        } else {
          inserted += chunk.length;
        }
      }
      // 첫 번째 청크부터 실패한 경우(컬럼 누락 등) → 오류 반환
      if (inserted === 0 && firstErr) {
        return fail(`수수료정산 DB 저장 실패: ${firstErr} — Supabase SQL Editor에서 20260606_cs_full_schema.sql 을 실행하세요`);
      }
      console.log(`[process:${documentId}] 수수료정산 ${inserted}/${total}건 저장 완료`);
      if (firstErr) console.warn(`[process:${documentId}] 일부 청크 오류: ${firstErr}`);
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted: rows.length, total });
  }

  // ── H. Ubist 폴더 → ubist_data 파싱 ────────────────────────────────────
  if (category === 'Ubist') {
    console.log(`[process:${documentId}] Ubist 폴더 → 처방 데이터 파싱`);
    const { rows, total, error: parseError } = parseUbistBuffer(buffer, doc.filename, documentId);

    if (parseError) return fail(`Ubist 파싱 실패: ${parseError}`);

    if (rows.length === 0) {
      console.warn(`[process:${documentId}] Ubist: 파싱된 행 없음 (헤더 인식 실패 가능성)`);
      await supabase.from('documents').update({ status: 'ready', error_message: '파싱된 데이터 없음 — 헤더 형식을 확인하세요.' }).eq('id', documentId);
      return Response.json({ ok: true, inserted: 0 });
    }

    // 동일 파일명 기존 데이터 삭제 후 재적재
    await supabase.from('ubist_data').delete().eq('source_file', doc.filename);

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: insErr } = await supabase.from('ubist_data').insert(rows.slice(i, i + CHUNK));
      if (insErr) console.warn(`[process:${documentId}] Ubist 삽입 오류(chunk ${i}):`, insErr.message);
      else inserted += rows.slice(i, i + CHUNK).length;
    }
    console.log(`[process:${documentId}] Ubist ${inserted}/${total}건 저장 완료`);
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted });
  }

  // ── I. 생동품목 폴더 → drug_bioequiv 파싱 ──────────────────────────────
  if (category === '생동품목') {
    console.log(`[process:${documentId}] 생동품목 폴더 → 생동 데이터 파싱`);
    const { rows, total, error: parseError } = parseBioequivBuffer(buffer, doc.filename);

    if (parseError) return fail(`생동품목 파싱 실패: ${parseError}`);

    if (rows.length > 0) {
      await supabase.from('drug_bioequiv').delete().eq('source_file', doc.filename);
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await supabase.from('drug_bioequiv').insert(rows.slice(i, i + CHUNK));
        if (insErr) console.warn(`[process:${documentId}] 생동 삽입 오류(chunk ${i}):`, insErr.message);
        else inserted += rows.slice(i, i + CHUNK).length;
      }
      console.log(`[process:${documentId}] 생동품목 ${inserted}/${total}건 저장 완료`);
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted: rows.length });
  }

  // ── J. 원료DMF 폴더 → drug_dmf 파싱 ───────────────────────────────────
  if (category === '원료DMF') {
    console.log(`[process:${documentId}] 원료DMF 폴더 → DMF 데이터 파싱`);
    const { rows, total, error: parseError, debug } = parseDmfBuffer(buffer, doc.filename);

    if (parseError) return fail(`원료DMF 파싱 실패: ${parseError}`);

    const dmfDebug = parseError ? null : (debug ?? null);
    if (rows.length > 0) {
      await supabase.from('drug_dmf').delete().eq('source_file', doc.filename);
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await supabase.from('drug_dmf').insert(rows.slice(i, i + CHUNK));
        if (insErr) console.warn(`[process:${documentId}] DMF 삽입 오류(chunk ${i}):`, insErr.message);
        else inserted += rows.slice(i, i + CHUNK).length;
      }
      console.log(`[process:${documentId}] 원료DMF ${inserted}/${total}건 저장 완료`);
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted: rows.length, debug: dmfDebug });
  }

  // ── G. 그 외 폴더 — 즉시 완료 ─────────────────────────────────────────
  console.log(`[process:${documentId}] 일반 폴더(${category || '미분류'}) → 즉시 완료`);
  await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
  return Response.json({ ok: true });
}
