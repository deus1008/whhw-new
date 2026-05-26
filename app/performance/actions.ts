'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { processRaw } from '@/lib/performance/process';
import type { PerfData } from '@/lib/performance/process';

const BUCKET = 'performance-data';

export interface StoredReport {
  period: string;
  filename: string;
  data: PerfData;
  updated_at: string;
}

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(url, key);
}

/* ── 이력 전체 조회 ─────────────────────────────────────────── */
export async function fetchPerformanceReports(): Promise<StoredReport[]> {
  const svc = getSvc();

  const { data: files, error: listErr } = await svc.storage
    .from(BUCKET)
    .list('', { sortBy: { column: 'name', order: 'desc' } });

  if (listErr || !files?.length) return [];

  const jsonFiles = files.filter(f => f.name.endsWith('.json'));

  const reports = await Promise.all(
    jsonFiles.map(async f => {
      const { data: blob } = await svc.storage.from(BUCKET).download(f.name);
      if (!blob) return null;
      const text = await blob.text();
      return JSON.parse(text) as StoredReport;
    }),
  );

  return reports
    .filter((r): r is StoredReport => r !== null)
    .sort((a, b) => b.period.localeCompare(a.period));
}

/* ── 업로드 (관리자 전용) ───────────────────────────────────── */
export async function uploadPerformanceData(
  formData: FormData,
): Promise<{ period?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin')
    return { error: '관리자만 업로드할 수 있습니다.' };

  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일이 없습니다.' };
  if (!file.name.match(/\.(xlsx|xls)$/i))
    return { error: 'xlsx / xls 파일만 지원합니다.' };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });

    if (!wb.SheetNames.includes('raw'))
      return { error: '"raw" 시트를 찾을 수 없습니다.' };

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets['raw'], { defval: '' },
    );
    const data = processRaw(rows, file.name);

    const report: StoredReport = {
      period:     data.period,
      filename:   file.name,
      data,
      updated_at: new Date().toISOString(),
    };

    const json    = JSON.stringify(report);
    const blob    = new Blob([json], { type: 'application/json' });
    const path    = `${data.period}.json`;
    const svc     = getSvc();

    // 동일 월이면 덮어쓰기, 신규면 추가
    const { error: upErr } = await svc.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'application/json' });

    if (upErr) return { error: `저장 실패: ${upErr.message}` };

    revalidatePath('/performance');
    return { period: data.period };
  } catch (e) {
    console.error('[uploadPerformanceData]', e);
    return { error: e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.' };
  }
}

/* ── 삭제 (관리자 전용) ─────────────────────────────────────── */
export async function deletePerformanceReport(
  period: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin')
    return { error: '관리자만 삭제할 수 있습니다.' };

  const svc = getSvc();
  const { error } = await svc.storage.from(BUCKET).remove([`${period}.json`]);
  if (error) return { error: `삭제 실패: ${error.message}` };

  revalidatePath('/performance');
  return {};
}
