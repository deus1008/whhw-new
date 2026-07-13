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
import { parseDmfBuffer }             from '@/lib/dmf/parse';
import { parseMonthlyStockBuffer }    from '@/lib/monthly-stock/parse';
import { parseEdiBuffer, syncEdiToDb } from '@/lib/edi/parse-and-sync';
import { parseProductListBuffer } from '@/lib/products/parse-list';
import { enrichProductsFromMfds } from '@/lib/products/enrich-mfds';
import { invalidateDashboardCache } from '@/lib/dashboard-cache';
import { revalidatePath } from 'next/cache';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 누락되었습니다.');
  return createSupabaseClient(url, key);
}

// insurance_code 컬럼 미존재(Phase 2 마이그레이션 전) 판별/제외 — 무중단용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMissingInsCode(err: any): boolean {
  return !!err && (err.code === '42703' || String(err?.message ?? '').includes('insurance_code'));
}
function stripInsCode(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(r => { const c = { ...r }; delete c.insurance_code; return c; });
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
    .select('id, filename, file_type, storage_path, uploaded_by, category, company_id')
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
  const docCompanyId = (doc as Record<string, unknown>).company_id as string | null ?? null;
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
            company_id: docCompanyId,
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
      // 최신 파일로 전체 교체 — 같은 위탁사의 기존 데이터만 삭제
      if (docCompanyId) {
        await supabase.from('customer_status').delete().eq('company_id', docCompanyId);
      } else {
        await supabase.from('customer_status').delete().not('id', 'is', null);
      }
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK).map((r: Record<string, unknown>) => ({ ...r, company_id: docCompanyId }));
        const { error: insErr } = await supabase.from('customer_status').insert(chunk);
        if (insErr) console.warn(`[process:${documentId}] 거래처 삽입 오류:`, insErr.message);
        else inserted += chunk.length;
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
      // 동일 파일명 기준 전체 삭제 (루프로 PostgREST 1000행 제한 우회)
      while (true) {
        const { data: ids } = await supabase
          .from('commission_settlements')
          .select('id')
          .eq('source_file', doc.filename)
          .limit(500);
        if (!ids || ids.length === 0) break;
        await supabase.from('commission_settlements')
          .delete().in('id', ids.map((r: { id: string }) => r.id));
        if (ids.length < 500) break;
      }
      const CHUNK = 500;
      let inserted = 0;
      let firstErr: string | null = null;
      let stripSett = false;
      for (let i = 0; i < rows.length; i += CHUNK) {
        let chunk = (rows.slice(i, i + CHUNK) as Record<string, unknown>[]).map(r => ({ ...r, company_id: docCompanyId }));
        if (stripSett) chunk = stripInsCode(chunk) as typeof chunk;
        let { error: insErr } = await supabase.from('commission_settlements').insert(chunk);
        if (insErr && !stripSett && isMissingInsCode(insErr)) {
          stripSett = true;
          ({ error: insErr } = await supabase.from('commission_settlements').insert(stripInsCode(chunk)));
        }
        if (insErr) {
          console.error(`[process:${documentId}] 정산 삽입 오류(chunk ${i}):`, insErr.message);
          if (!firstErr) firstErr = insErr.message;
        } else {
          inserted += chunk.length;
        }
      }
      // 첫 번째 청크부터 실패한 경우(컬럼 누락 등) → 오류 반환
      if (inserted === 0 && firstErr) {
        return fail(`수수료정산 DB 저장 실패: ${firstErr} — Supabase SQL Editor에서 20260628_company_id_isolation.sql 을 실행하세요`);
      }
      console.log(`[process:${documentId}] 수수료정산 ${inserted}/${total}건 저장 완료`);
      if (firstErr) console.warn(`[process:${documentId}] 일부 청크 오류: ${firstErr}`);
    }
    // 대시보드 집계 캐시 무효화 + /weekly 재검증
    await invalidateDashboardCache(supabase, docCompanyId);
    revalidatePath('/weekly');
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
    let stripUb = false;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK) as unknown as Record<string, unknown>[];
      let { error: insErr } = await supabase.from('ubist_data').insert(stripUb ? stripInsCode(slice) : slice);
      if (insErr && !stripUb && isMissingInsCode(insErr)) {
        stripUb = true;
        ({ error: insErr } = await supabase.from('ubist_data').insert(stripInsCode(slice)));
      }
      if (insErr) console.warn(`[process:${documentId}] Ubist 삽입 오류(chunk ${i}):`, insErr.message);
      else inserted += slice.length;
    }
    console.log(`[process:${documentId}] Ubist ${inserted}/${total}건 저장 완료`);

    // Ubist 파싱 결과로 disease_drugs 교정 (is_original + manufacturer + distributor)
    {
      const normP = (s: string) => s.replace(/[\s\.\-\/,·]/g, '').toLowerCase();
      type Info = { isOrig: boolean | null; mfr: string | null; dist: string | null };
      const ubistMap = new Map<string, Info>();
      for (const row of rows) {
        if (!row.product_name) continue;
        const key = normP(row.product_name);
        if (!ubistMap.has(key)) {
          ubistMap.set(key, {
            isOrig: row.is_original ?? null,
            mfr:    row.manufacturer ?? null,
            dist:   null, // 판매사는 UbistRow에 없음 — 나중에 스키마 추가 후 활용
          });
        }
      }
      if (ubistMap.size > 0) {
        const { data: ddRows } = await supabase
          .from('disease_drugs')
          .select('id, product_name, is_original, manufacturer, distributor');
        for (const drug of ddRows ?? []) {
          const n = normP((drug.product_name as string) ?? '');
          if (!n) continue;
          let info: Info | null = ubistMap.get(n) ?? null;
          if (!info) {
            for (const [un, v] of ubistMap) {
              if (un.startsWith(n) || n.startsWith(un)) { info = v; break; }
            }
          }
          if (!info) continue;
          const patch: Record<string, unknown> = {};
          if (info.isOrig !== null && info.isOrig !== (drug.is_original as boolean | null))
            patch.is_original = info.isOrig;
          if (info.mfr && !(drug.manufacturer as string | null))
            patch.manufacturer = info.mfr;
          if (Object.keys(patch).length > 0)
            await supabase.from('disease_drugs').update(patch).eq('id', drug.id);
        }
      }
    }

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
    const { rows, total, error: parseError } = parseDmfBuffer(buffer, doc.filename);

    if (parseError) return fail(`원료DMF 파싱 실패: ${parseError}`);

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
    return Response.json({ ok: true, inserted: rows.length });
  }

  // ── K. 재고현황 폴더 → monthly_stock 파싱 ─────────────────────────────
  if (category === '재고현황') {
    console.log(`[process:${documentId}] 재고현황 폴더 → 월별재고 데이터 파싱`);
    const { rows, total, error: parseError } = parseMonthlyStockBuffer(buffer, doc.filename);

    if (parseError) return fail(`재고현황 파싱 실패: ${parseError}`);

    if (rows.length > 0) {
      // 파일명이 동일해도 안전하도록 연도+기간 기준으로 기존 데이터 교체
      const yearPeriods = [...new Set(rows.map(r => `${r.year}|${r.period}`))];
      for (const yp of yearPeriods) {
        const [yr, pr] = yp.split('|');
        await supabase.from('monthly_stock').delete().eq('year', yr).eq('period', pr);
      }
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await supabase.from('monthly_stock').insert(rows.slice(i, i + CHUNK));
        if (insErr) console.warn(`[process:${documentId}] 재고현황 삽입 오류(chunk ${i}):`, insErr.message);
        else inserted += rows.slice(i, i + CHUNK).length;
      }
      console.log(`[process:${documentId}] 재고현황 ${inserted}/${rows.length}건 저장 완료 (원본 ${total}행, ${yearPeriods.length}개 기간)`);
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    return Response.json({ ok: true, inserted: rows.length });
  }

  // ── L. EDI 폴더 → trend_prescriptions 자동 동기화 ────────────────────
  if (category === 'EDI') {
    console.log(`[process:${documentId}] EDI 폴더 → 처방 데이터 파싱 및 DB 동기화`);
    const parseResult = parseEdiBuffer(buffer, doc.filename, doc.file_type);
    if ('error' in parseResult) return fail(`EDI 파싱 실패: ${parseResult.error}`);
    await syncEdiToDb(supabase, parseResult.rows, parseResult.data, doc.filename, docCompanyId);
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    revalidatePath('/edi');
    revalidatePath('/weekly');
    console.log(`[process:${documentId}] EDI ${parseResult.rows.length}행 저장 완료`);
    return Response.json({ ok: true, inserted: parseResult.rows.length });
  }

  // ── M. 위탁품목리스트 폴더 → products 마스터(보험코드) 적재 ─────────────
  if (category === '위탁품목리스트') {
    console.log(`[process:${documentId}] 위탁품목리스트 → products 마스터 적재`);
    let parsed: ReturnType<typeof parseProductListBuffer>;
    try {
      parsed = parseProductListBuffer(buffer);
    } catch (e) {
      return fail(`위탁품목리스트 파싱 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (parsed.length > 0) {
      const now = new Date().toISOString();
      // 재업로드 시 기존 식약처 보강값(item_seq·atc)을 보험코드 기준으로 이월
      let exQ = supabase.from('products').select('insurance_code, item_seq, atc_code');
      exQ = docCompanyId ? exQ.eq('company_id', docCompanyId) : exQ.is('company_id', null);
      const { data: existing } = await exQ;
      const carry: Record<string, { item_seq: string | null; atc_code: string | null }> = {};
      for (const e of (existing ?? []) as { insurance_code: string; item_seq: string | null; atc_code: string | null }[]) {
        if (e.insurance_code && (e.item_seq || e.atc_code)) carry[e.insurance_code] = { item_seq: e.item_seq, atc_code: e.atc_code };
      }

      const rows = parsed.map(p => ({
        company_id:          docCompanyId,
        insurance_code:      p.insurance_code,
        representative_code: p.representative_code || null,
        product_name:        p.product_name,
        ingredient_name:     p.ingredient_name || null,
        commission_rate:     Number.isFinite(p.commission_rate) ? p.commission_rate : null,
        distribution:        p.distribution || null,
        note:                p.note || null,
        no:                  Number.isFinite(p.no) ? p.no : null,
        item_seq:            carry[p.insurance_code]?.item_seq ?? null,
        atc_code:            carry[p.insurance_code]?.atc_code ?? null,
        source_document_id:  documentId,
        updated_at:          now,
      }));
      // 위탁사 전체 교체 (최신 리스트가 권위) — customer_status 패턴
      let delQ = supabase.from('products').delete();
      delQ = docCompanyId ? delQ.eq('company_id', docCompanyId) : delQ.is('company_id', null);
      const { error: delErr } = await delQ;
      if (delErr) return fail(`products 초기화 실패: ${delErr.message} — 20260710_products_master.sql 을 먼저 실행하세요`);

      const CHUNK = 500;
      let inserted = 0;
      let firstErr: string | null = null;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: insErr } = await supabase.from('products').insert(rows.slice(i, i + CHUNK));
        if (insErr) { if (!firstErr) firstErr = insErr.message; console.warn(`[process:${documentId}] products 삽입 오류(chunk ${i}):`, insErr.message); }
        else inserted += Math.min(CHUNK, rows.length - i);
      }
      if (inserted === 0 && firstErr) {
        return fail(`products 저장 실패: ${firstErr} — 20260710_products_master.sql 을 실행하세요`);
      }
      console.log(`[process:${documentId}] products ${inserted}/${parsed.length}건 저장 완료`);

      // 신규(이월 안 된) 제품만 식약처 보강 — best-effort
      try {
        const n = await enrichProductsFromMfds(supabase, docCompanyId);
        if (n > 0) console.log(`[process:${documentId}] 식약처 보강 ${n}건`);
      } catch (e) { console.warn(`[process:${documentId}] 식약처 보강 스킵:`, e instanceof Error ? e.message : e); }
    }
    await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
    revalidatePath('/product-list');
    return Response.json({ ok: true, inserted: parsed.length });
  }

  // ── G. 그 외 폴더 — 즉시 완료 ─────────────────────────────────────────
  console.log(`[process:${documentId}] 일반 폴더(${category || '미분류'}) → 즉시 완료`);
  await supabase.from('documents').update({ status: 'ready', error_message: null }).eq('id', documentId);
  return Response.json({ ok: true });
}
