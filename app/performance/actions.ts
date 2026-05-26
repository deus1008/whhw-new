'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { processRaw } from '@/lib/performance/process';
import type { PerfData } from '@/lib/performance/process';

const BUCKET_DOCS = 'documents';
const BUCKET_CACHE = 'performance-data';
const FOLDER_NAME = '실적마감';

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

      reports.push(report);
    } catch (e) {
      console.error('[getPerformanceData] doc:', doc.id, e);
      errors.push({
        filename: doc.filename,
        message:  e instanceof Error ? e.message : '분석 중 오류 발생',
      });
    }
  }));

  // 동일 period는 가장 최근 파일 하나만 유지
  const periodMap = new Map<string, StoredReport>();
  // reports는 created_at 내림차순이므로 앞쪽(최신)이 우선
  for (const r of reports) {
    if (!periodMap.has(r.period)) periodMap.set(r.period, r);
  }

  const sorted = [...periodMap.values()]
    .sort((a, b) => b.period.localeCompare(a.period));

  return { reports: sorted, errors };
}

/* ── 캐시 초기화 (강제 재분석) ─────────────────────────────── */
export async function forceRefreshAnalysis(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin')
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
