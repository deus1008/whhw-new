'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import * as XLSX from 'xlsx';
import { processRaw } from '@/lib/performance/process';
import type { PerfData } from '@/lib/performance/process';

const BUCKET_DOCS = 'documents';
const BUCKET_CACHE = 'performance-data';
const FOLDER_NAME = '실적마감';

/** trend_prescriptions 에 실적마감 원본 행 동기화 (이미 존재하면 스킵) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncPerfToDb(svc: any, rows: Record<string, unknown>[], filename: string, period: string): Promise<void> {
  try {
    const { count } = await svc
      .from('trend_prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('source_file', filename);
    if ((count ?? 0) > 0) return;

    // period "YYYY.MM" → "YYYYMM"
    const prescMonth = period ? period.replace('.', '') : null;

    type InsertRow = {
      source_file: string;
      prescription_month: string | null;
      sales_rep: string | null;
      cso_name: string | null;
      hospital_name: string | null;
      product_name: string | null;
      hospital_type: string | null;
      prescription_amount: number | null;
    };

    const insertRows: InsertRow[] = [];
    for (const r of rows) {
      const amt = Number(r['처방금액']) || 0;
      if (amt === 0) continue; // 금액 없는 행 제외

      insertRows.push({
        source_file:         filename,
        prescription_month:  prescMonth,
        sales_rep:           String(r['현담당자']    ?? '').trim() || null,
        cso_name:            String(r['판매대행처명'] ?? '').trim() || null,
        hospital_name:       String(r['처방처명']    ?? r['거래처명'] ?? '').trim() || null,
        product_name:        String(r['품목명']      ?? '').trim() || null,
        hospital_type:       String(r['병원구분']    ?? r['종별구분'] ?? '').trim() || null,
        prescription_amount: amt,
      });
    }

    if (insertRows.length === 0) return;

    const CHUNK = 1000;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const { error } = await svc
        .from('trend_prescriptions')
        .insert(insertRows.slice(i, i + CHUNK));
      if (error) {
        console.warn(`[syncPerfToDb] 삽입 오류 (chunk ${i}):`, error.message);
        break;
      }
    }
    console.log(`[syncPerfToDb] ${filename}: ${insertRows.length}행 저장 완료`);
  } catch (e) {
    console.warn('[syncPerfToDb] 스킵:', e instanceof Error ? e.message : e);
  }
}

export interface StoredReport {
  period: string;
  filename: string;
  data: PerfData;
  updated_at: string;
  doc_id: string;
}

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/* ── 실적마감 폴더 파일 → 분석 결과 반환 ───────────────────── */
export async function getPerformanceData(): Promise<{
  reports: StoredReport[];
  errors: { filename: string; message: string }[];
}> {
  const svc = getSvc();

  // 실적마감 폴더의 xlsx/xls 파일 전체 조회 (RAG 상태 무관)
  const { data: docs, error: dbErr } = await svc
    .from('documents')
    .select('id, filename, file_type, storage_path, created_at, category')
    .eq('category', FOLDER_NAME)
    .in('file_type', ['xlsx', 'xls'])
    .order('created_at', { ascending: false });

  if (dbErr) {
    console.error('[getPerformanceData] db:', dbErr);
    return { reports: [], errors: [{ filename: '', message: dbErr.message }] };
  }
  if (!docs?.length) return { reports: [], errors: [] };

  const reports: StoredReport[] = [];
  const errors:  { filename: string; message: string }[] = [];

  await Promise.all(docs.map(async doc => {
    const cacheKey = `${doc.id}.json`;

    // ── 캐시 확인 ──────────────────────────────────────────
    try {
      const { data: cacheBlob } = await svc.storage
        .from(BUCKET_CACHE)
        .download(cacheKey);
      if (cacheBlob) {
        const cached = JSON.parse(await cacheBlob.text()) as StoredReport;
        reports.push(cached);
        return;
      }
    } catch { /* 캐시 없음 → 원본 처리 */ }

    // ── 원본 파일 다운로드 + 분석 ──────────────────────────
    try {
      const { data: fileBlob, error: dlErr } = await svc.storage
        .from(BUCKET_DOCS)
        .download(doc.storage_path);

      if (dlErr || !fileBlob) {
        errors.push({ filename: doc.filename, message: dlErr?.message ?? '파일 다운로드 실패' });
        return;
      }

      const buffer = Buffer.from(await fileBlob.arrayBuffer());
      const wb = XLSX.read(buffer, { type: 'buffer' });

      if (!wb.SheetNames.includes('raw')) {
        errors.push({ filename: doc.filename, message: '"raw" 시트를 찾을 수 없습니다.' });
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets['raw'], { defval: '' },
      );
      const data = processRaw(rows, doc.filename);

      const report: StoredReport = {
        period:     data.period,
        filename:   doc.filename,
        data,
        updated_at: doc.created_at as string,
        doc_id:     doc.id as string,
      };

      // 캐시 저장
      const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
      await svc.storage.from(BUCKET_CACHE).upload(cacheKey, blob, { upsert: true });

      // DB 저장 (행 단위 구조화) — 당월분만 저장
      const currentMonthRows = rows.filter(r =>
        String(r['실적구분'] ?? '').trim() === '당월분',
      );
      await syncPerfToDb(svc, currentMonthRows.length > 0 ? currentMonthRows : rows, doc.filename as string, data.period);

      reports.push(report);
    } catch (e) {
      console.error('[getPerformanceData] doc:', doc.id, e);
      errors.push({
        filename: doc.filename,
        message:  e instanceof Error ? e.message : '분석 중 오류 발생',
      });
    }
  }));

  // created_at 내림차순 정렬 (최신 파일 먼저)
  const sorted = reports.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return { reports: sorted, errors };
}

/* ── 캐시 초기화 (강제 재분석) ─────────────────────────────── */
export async function forceRefreshAnalysis(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  const role = normalizeRole(profile?.role);
  if (role !== '관리자' && role !== '영업관리총괄' && role !== '영업관리')
    return { error: '관리자만 새로고침할 수 있습니다.' };

  const svc = getSvc();

  // 실적마감 폴더 문서 ID 조회
  const { data: docs } = await svc
    .from('documents')
    .select('id')
    .eq('category', FOLDER_NAME)
    .in('file_type', ['xlsx', 'xls']);

  if (docs?.length) {
    const keys = docs.map(d => `${d.id}.json`);
    await svc.storage.from(BUCKET_CACHE).remove(keys);
  }

  revalidatePath('/performance');
  return {};
}
