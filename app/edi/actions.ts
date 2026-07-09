'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { EdiData } from '@/lib/edi/process';
import { parseEdiBuffer, syncEdiToDb, CACHE_VERSION } from '@/lib/edi/parse-and-sync';

const BUCKET_DOCS  = 'documents';
const BUCKET_CACHE = 'performance-data';
const FOLDER_NAME  = 'EDI';
const CACHE_PREFIX = 'edi-';


export interface EdiReport {
  period:     string;
  filename:   string;
  data:       EdiData;
  updated_at: string;
  doc_id:     string;
}

function getSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/* ── EDI 폴더 파일 → 분석 결과 반환 ────────────────────────── */

/* ── EDI 폴더 파일 목록만 반환 ── */
export async function getEdiFileList(companyId?: string | null): Promise<{
  files: { id: string; filename: string; created_at: string }[];
  error?: string;
}> {
  const svc = getSvc();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = svc
    .from('documents')
    .select('id, filename, created_at')
    .eq('category', FOLDER_NAME)
    .in('file_type', ['xlsx', 'xls', 'csv', 'txt'])
    .order('created_at', { ascending: false });
  if (companyId) q = q.eq('company_id', companyId);
  const { data: docs, error: dbErr } = await q;
  if (dbErr) return { files: [], error: dbErr.message };

  // 파일명에서 연월(YYYYMM 또는 YYYY-MM) 추출 후 내림차순 정렬
  const extractYearMonth = (filename: string): string => {
    const m = filename.match(/(\d{4})[.\-_]?(\d{2})/);
    return m ? `${m[1]}${m[2]}` : '000000';
  };

  const sorted = ((docs ?? []) as { id: string; filename: string; created_at: string }[])
    .sort((a, b) => extractYearMonth(b.filename).localeCompare(extractYearMonth(a.filename)));

  return { files: sorted };
}

/* ── 단건 파일 분析 ── */
// force=true: 캐시가 있어도 강제 재파싱 + DB 재동기화 (전체 DB 동기화 버튼에서 사용)
export async function analyzeEdiFile(docId: string, force = false): Promise<{
  report?: EdiReport;
  error?: string;
}> {
  const svc = getSvc();
  const { data: doc, error: dbErr } = await svc
    .from('documents')
    .select('id, filename, file_type, storage_path, created_at, company_id')
    .eq('id', docId).single();
  if (dbErr || !doc) return { error: '파일을 찾을 수 없습니다.' };

  const d = doc as Record<string,string>;
  const cacheKey = `${CACHE_PREFIX}${d.id}.json`;
  if (!force) {
    try {
      const { data: blob } = await svc.storage.from(BUCKET_CACHE).download(cacheKey);
      if (blob) {
        const cached = JSON.parse(await blob.text()) as EdiReport & { cacheVersion?: number };
        const cd = cached.data as unknown as Record<string,unknown>;
        if ((cached as unknown as Record<string,unknown>).cacheVersion === CACHE_VERSION &&
            Array.isArray(cd.salesPersonStats) &&
            Array.isArray(cd.itemHospStats)) {
          return { report: cached };
        }
      }
    } catch { /* no cache */ }
  }

  const { data: fileBlob, error: dlErr } = await svc.storage.from(BUCKET_DOCS).download(d.storage_path);
  if (dlErr || !fileBlob) return { error: dlErr?.message ?? '다운로드 실패' };
  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  if (buffer.length / 1024 / 1024 > 150)
    return { error: `파일 크기(${Math.round(buffer.length/1024/1024)}MB) 초과 — 150MB 이하 파일만 지원합니다` };

  const parseResult = parseEdiBuffer(buffer, d.filename, d.file_type);
  if ('error' in parseResult) return { error: parseResult.error };
  const { rows, data } = parseResult;
  const report = { period: data.period || d.filename, filename: d.filename, data, updated_at: d.created_at, doc_id: d.id, cacheVersion: CACHE_VERSION } as EdiReport & { cacheVersion: number };
  try {
    const cBlob = new Blob([JSON.stringify(report)], { type: 'application/json' });
    await svc.storage.from(BUCKET_CACHE).upload(cacheKey, cBlob, { upsert: true });
  } catch { /* ignore */ }
  const ediCompanyId = (d as Record<string, unknown>).company_id as string | null ?? null;
  await syncEdiToDb(svc, rows, data, d.filename, ediCompanyId);
  return { report };
}

export async function getEdiData(force = false): Promise<{
  reports: EdiReport[];
  errors:  { filename: string; message: string }[];
}> {
  const svc = getSvc();

  const { data: docsRaw, error: dbErr } = await svc
    .from('documents')
    .select('id, filename, file_type, storage_path, created_at, company_id')
    .eq('category', FOLDER_NAME)
    .in('file_type', ['xlsx', 'xls', 'csv', 'txt']);

  if (dbErr) {
    console.error('[getEdiData] db:', dbErr);
    return { reports: [], errors: [{ filename: '', message: dbErr.message }] };
  }
  if (!docsRaw?.length) return { reports: [], errors: [] };

  // 파일명에서 연월 추출 (업로드 순서가 아닌 파일명 기준 정렬)
  const extractYM = (fn: string) => {
    const m = fn.match(/(\d{4})[.\-_]?(\d{2})/);
    return m ? `${m[1]}${m[2]}` : '000000';
  };
  // 오래된 월 → 최신 월 순서로 처리: 마지막에 처리된 파일이 DB 최종 상태가 됨
  // 동일 연월이면 업로드 시각 오래된 것 먼저 → 최신 업로드가 마지막에 처리되어 우선
  const docs = [...docsRaw].sort((a, b) => {
    const ym = extractYM(a.filename as string).localeCompare(extractYM(b.filename as string));
    if (ym !== 0) return ym;
    return (a.created_at as string).localeCompare(b.created_at as string);
  });

  const reports: EdiReport[] = [];
  const errors:  { filename: string; message: string }[] = [];

  // ⚠ 순차 처리 — 병렬 처리 시 메모리 폭증 방지
  for (const doc of docs) {
    const cacheKey = `${CACHE_PREFIX}${doc.id}.json`;

    /* ── 캐시 확인 (force=true 시 건너뜀) ── */
    if (!force) {
      try {
        const { data: blob } = await svc.storage.from(BUCKET_CACHE).download(cacheKey);
        if (blob) {
          const cached = JSON.parse(await blob.text()) as EdiReport;
          const d = cached.data as unknown as Record<string, unknown>;
          if (
            !Array.isArray(d.salesPersonStats) ||
            !Array.isArray(d.itemStats) ||
            !Array.isArray(d.itemHospStats) ||
            (cached as unknown as Record<string, unknown>).cacheVersion !== CACHE_VERSION
          ) {
            throw new Error('cache outdated – reprocess');
          }
          reports.push(cached);
          continue;
        }
      } catch { /* 캐시 없음 또는 구버전 */ }
    }

    /* ── 원본 파일 처리 ── */
    try {
      const { data: fileBlob, error: dlErr } = await svc.storage
        .from(BUCKET_DOCS)
        .download(doc.storage_path);

      if (dlErr || !fileBlob) {
        errors.push({ filename: doc.filename, message: dlErr?.message ?? '파일 다운로드 실패' });
        continue;
      }

      const buffer = Buffer.from(await fileBlob.arrayBuffer());

      const fileSizeMB = buffer.length / 1024 / 1024;
      if (fileSizeMB > 150) {
        errors.push({
          filename: doc.filename,
          message:  `파일 크기(${fileSizeMB.toFixed(0)}MB)가 150MB 제한을 초과합니다.`,
        });
        continue;
      }

      const parseResult = parseEdiBuffer(buffer, doc.filename, doc.file_type);
      if ('error' in parseResult) {
        errors.push({ filename: doc.filename, message: parseResult.error });
        continue;
      }
      const { rows: savedRows, data } = parseResult;

      const report: EdiReport & { cacheVersion: number } = {
        period:       data.period || doc.filename,
        filename:     doc.filename,
        data,
        updated_at:   doc.created_at as string,
        doc_id:       doc.id as string,
        cacheVersion: CACHE_VERSION,
      };

      // 캐시 저장 (실패해도 무시)
      try {
        const cacheBlob = new Blob([JSON.stringify(report)], { type: 'application/json' });
        await svc.storage.from(BUCKET_CACHE).upload(cacheKey, cacheBlob, { upsert: true });
      } catch (cacheErr) {
        console.warn('[getEdiData] cache write failed:', cacheErr);
      }

      // DB 저장 (행 단위 구조화)
      const docCoId = (doc as Record<string, unknown>).company_id as string | null ?? null;
      await syncEdiToDb(svc, savedRows, data, doc.filename as string, docCoId);

      reports.push(report);
    } catch (e) {
      console.error('[getEdiData] doc:', doc.id, e);
      errors.push({
        filename: doc.filename,
        message:  e instanceof Error ? e.message : '분석 중 오류 발생',
      });
    }
  }

  return {
    reports: reports.sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    errors,
  };
}

/* ── 캐시 초기화 (관리자 전용) ──────────────────────────────── */
/** 모든 EDI 파일을 강제 재처리하여 trend_prescriptions DB를 최신화 */
export async function syncAllEdiToDb(): Promise<{ synced: number; errors: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { synced: 0, errors: 0, error: '로그인이 필요합니다.' };

  const result = await getEdiData(true); // 캐시 건너뜀 → Excel 재처리 → DB 동기화
  return { synced: result.reports.length, errors: result.errors.length };
}

export async function forceRefreshEdi(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  // 승인된 사용자라면 누구나 캐시 새로고침 가능

  const svc = getSvc();
  const { data: docs } = await svc
    .from('documents')
    .select('id')
    .eq('category', FOLDER_NAME)
    .in('file_type', ['xlsx', 'xls', 'csv', 'txt']);

  if (docs?.length) {
    const keys = docs.map(d => `${CACHE_PREFIX}${d.id}.json`);
    await svc.storage.from(BUCKET_CACHE).remove(keys);
  }

  revalidatePath('/edi');
  return {};
}
