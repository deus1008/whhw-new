/**
 * POST /api/admin/reprocess-ubist
 * 기존에 업로드된 Ubist 문서를 재파싱해서:
 *   1) ubist_data 재적재 (기존 데이터 교체)
 *   2) disease_drugs.is_original 교정 (Ubist Generic 컬럼 기준)
 * 관리자 전용 1회성 마이그레이션
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { parseUbistBuffer } from '@/lib/ubist/parse';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** 제품명 정규화: 공백·점·슬래시·하이픈 제거 후 소문자 */
function normProd(s: string): string {
  return s.replace(/[\s\.\-\/,·]/g, '').toLowerCase();
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
  if (!profile || !profileIsAdmin(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = svc();

  // 1. Ubist 카테고리 문서 목록 조회
  const { data: docs, error: docsErr } = await db
    .from('documents')
    .select('id, filename, storage_path')
    .eq('category', 'Ubist')
    .eq('status', 'ready');

  if (docsErr) return NextResponse.json({ error: docsErr.message }, { status: 500 });
  if (!docs?.length) return NextResponse.json({ ok: true, message: 'Ubist 문서 없음', updated: 0 });

  // 제품명 → is_original 맵 (모든 Ubist 파일 통합)
  const ubistMap = new Map<string, boolean>(); // normProd(product_name) → is_original

  let totalInserted = 0;
  const errors: string[] = [];

  for (const doc of docs) {
    // Storage에서 파일 다운로드
    const { data: fileData, error: dlErr } = await db.storage
      .from('documents')
      .download(doc.storage_path as string);

    if (dlErr || !fileData) {
      errors.push(`${doc.filename}: 다운로드 실패`);
      continue;
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { rows, error: parseErr } = parseUbistBuffer(buffer, doc.filename as string, doc.id as string);

    if (parseErr || !rows.length) {
      errors.push(`${doc.filename}: 파싱 실패 (${parseErr ?? '행 없음'})`);
      continue;
    }

    // ubist_data 기존 행 삭제 후 재적재
    await db.from('ubist_data').delete().eq('source_file', doc.filename);

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: insErr } = await db.from('ubist_data').insert(rows.slice(i, i + CHUNK));
      if (insErr) errors.push(`${doc.filename} chunk ${i}: ${insErr.message}`);
      else totalInserted += rows.slice(i, i + CHUNK).length;
    }

    // 제품명 → is_original 맵 누적
    for (const row of rows) {
      if (row.product_name && row.is_original !== null) {
        ubistMap.set(normProd(row.product_name), row.is_original);
      }
    }
  }

  // 2. disease_drugs.is_original 교정 (Ubist 데이터 기준)
  let diseaseDrugsUpdated = 0;
  if (ubistMap.size > 0) {
    const { data: diseaseDrugs } = await db
      .from('disease_drugs')
      .select('id, product_name, is_original');

    for (const drug of diseaseDrugs ?? []) {
      const n = normProd((drug.product_name as string) ?? '');
      if (!n) continue;

      let matched: boolean | null = null;

      // 1순위: 정확히 일치
      if (ubistMap.has(n)) {
        matched = ubistMap.get(n)!;
      } else {
        // 2순위: 이름 접두사 매칭 (예: "글리젠타듀오서방정" ↔ "글리젠타듀오서방정2")
        for (const [ubistNorm, isOrig] of ubistMap) {
          if (ubistNorm.startsWith(n) || n.startsWith(ubistNorm)) {
            matched = isOrig;
            break;
          }
        }
      }

      if (matched !== null && matched !== (drug.is_original as boolean | null)) {
        const { error: updErr } = await db
          .from('disease_drugs')
          .update({ is_original: matched })
          .eq('id', drug.id);
        if (!updErr) diseaseDrugsUpdated++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    docs_processed: docs.length,
    ubist_products_mapped: ubistMap.size,
    ubist_rows_inserted: totalInserted,
    disease_drugs_updated: diseaseDrugsUpdated,
    errors: errors.length ? errors : undefined,
  });
}
