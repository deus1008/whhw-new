'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { processEdi } from '@/lib/edi/process';
import type { EdiData } from '@/lib/edi/process';

const BUCKET_DOCS  = 'documents';
const BUCKET_CACHE = 'performance-data';
const FOLDER_NAME  = 'EDI';
const CACHE_PREFIX = 'edi-';

/** 한 파일에서 처리할 최대 행 수 (메모리 보호) */
const MAX_ROWS = 100_000;

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
export async function getEdiData(): Promise<{
  reports: EdiReport[];
  errors:  { filename: string; message: string }[];
}> {
  const svc = getSvc();

  const { data: docs, error: dbErr } = await svc
    .from('documents')
    .select('id, filename, file_type, storage_path, created_at')
    .eq('category', FOLDER_NAME)
    .in('file_type', ['xlsx', 'xls', 'csv', 'txt'])
    .order('created_at', { ascending: false });

  if (dbErr) {
    console.error('[getEdiData] db:', dbErr);
    return { reports: [], errors: [{ filename: '', message: dbErr.message }] };
  }
  if (!docs?.length) return { reports: [], errors: [] };

  const reports: EdiReport[] = [];
  const errors:  { filename: string; message: string }[] = [];

  // ⚠ 순차 처리 — 병렬 처리 시 메모리 폭증 방지
  for (const doc of docs) {
    const cacheKey = `${CACHE_PREFIX}${doc.id}.json`;

    /* ── 캐시 확인 ── */
    try {
      const { data: blob } = await svc.storage.from(BUCKET_CACHE).download(cacheKey);
      if (blob) {
        const cached = JSON.parse(await blob.text()) as EdiReport;
        // 구버전 캐시 감지: 필수 필드 없거나 캐시 버전 불일치 시 재처리
        const CACHE_VERSION = 3; // 담당자명 키워드 순서 변경 시 올릴 것
        const d = cached.data as unknown as Record<string, unknown>;
        if (
          !Array.isArray(d.salesPersonStats) ||
          !Array.isArray(d.itemStats) ||
          (cached as unknown as Record<string, unknown>).cacheVersion !== CACHE_VERSION
        ) {
          throw new Error('cache outdated – reprocess');
        }
        reports.push(cached);
        continue;
      }
    } catch { /* 캐시 없음 또는 구버전 */ }

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
      let wb: XLSX.WorkBook;

      if (doc.file_type === 'csv' || doc.file_type === 'txt') {
        let text: string;
        try {
          text = new TextDecoder('euc-kr').decode(buffer);
        } catch {
          text = buffer.toString('utf-8');
        }
        wb = XLSX.read(text, { type: 'string' });
      } else {
        wb = XLSX.read(buffer, { type: 'buffer' });
      }

      // 가장 많은 행을 가진 시트 선택
      let bestSheet = wb.SheetNames[0];
      let bestRows  = 0;
      for (const name of wb.SheetNames) {
        const ref = wb.Sheets[name]['!ref'];
        if (!ref) continue;
        const range = XLSX.utils.decode_range(ref);
        const rowCount = range.e.r - range.s.r;
        if (rowCount > bestRows) { bestRows = rowCount; bestSheet = name; }
      }

      let rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[bestSheet], { defval: '' },
      );

      if (!rows.length) {
        errors.push({ filename: doc.filename, message: '데이터 행이 없습니다.' });
        continue;
      }

      // 행 수 제한
      if (rows.length > MAX_ROWS) {
        console.warn(`[getEdiData] ${doc.filename}: ${rows.length}행 → ${MAX_ROWS}행으로 제한`);
        rows = rows.slice(0, MAX_ROWS);
      }

      const data = processEdi(rows, doc.filename);
      const report: EdiReport & { cacheVersion: number } = {
        period:       data.period || doc.filename,
        filename:     doc.filename,
        data,
        updated_at:   doc.created_at as string,
        doc_id:       doc.id as string,
        cacheVersion: 3,
      };

      // 캐시 저장 (실패해도 무시)
      try {
        const cacheBlob = new Blob([JSON.stringify(report)], { type: 'application/json' });
        await svc.storage.from(BUCKET_CACHE).upload(cacheKey, cacheBlob, { upsert: true });
      } catch (cacheErr) {
        console.warn('[getEdiData] cache write failed:', cacheErr);
      }

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
export async function forceRefreshEdi(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin')
    return { error: '관리자만 새로고침할 수 있습니다.' };

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
