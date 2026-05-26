'use server';

/*
  ┌──────────────────────────────────────────────────────────────┐
  │  Supabase SQL Editor에서 아래 SQL을 한 번 실행하세요.           │
  │                                                              │
  │  CREATE TABLE IF NOT EXISTS performance_reports (            │
  │    period      text PRIMARY KEY,                             │
  │    filename    text NOT NULL,                                │
  │    data        jsonb NOT NULL,                               │
  │    uploaded_by uuid REFERENCES auth.users(id),               │
  │    updated_at  timestamptz DEFAULT now()                     │
  │  );                                                          │
  │                                                              │
  │  ALTER TABLE performance_reports ENABLE ROW LEVEL SECURITY;  │
  │                                                              │
  │  CREATE POLICY "read_all" ON performance_reports             │
  │    FOR SELECT TO authenticated USING (true);                 │
  │                                                              │
  │  CREATE POLICY "write_admin" ON performance_reports          │
  │    FOR ALL TO authenticated                                  │
  │    USING (                                                   │
  │      EXISTS (                                                │
  │        SELECT 1 FROM profiles                                │
  │        WHERE profiles.id = auth.uid()                        │
  │          AND profiles.role = 'admin'                         │
  │      )                                                       │
  │    );                                                        │
  └──────────────────────────────────────────────────────────────┘
*/

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { processRaw } from '@/lib/performance/process';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 누락되었습니다.');
  return createServiceClient(url, key);
}

export async function uploadPerformanceData(
  formData: FormData,
): Promise<{ period?: string; error?: string }> {
  // ── 인증 확인 ──────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin')
    return { error: '관리자만 업로드할 수 있습니다.' };

  // ── 파일 검증 ──────────────────────────────────────────────
  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일이 없습니다.' };
  if (!file.name.match(/\.(xlsx|xls)$/i))
    return { error: 'xlsx / xls 파일만 지원합니다.' };

  // ── Excel 파싱 + 분석 ──────────────────────────────────────
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });

    if (!wb.SheetNames.includes('raw'))
      return { error: '"raw" 시트를 찾을 수 없습니다.' };

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets['raw'],
      { defval: '' },
    );
    const data = processRaw(rows, file.name);

    // ── DB upsert ──────────────────────────────────────────────
    const svc = getServiceClient();
    const { error: dbErr } = await svc
      .from('performance_reports')
      .upsert(
        {
          period:      data.period,
          filename:    file.name,
          data,
          uploaded_by: user.id,
          updated_at:  new Date().toISOString(),
        },
        { onConflict: 'period' },
      );

    if (dbErr) return { error: `저장 실패: ${dbErr.message}` };

    revalidatePath('/performance');
    return { period: data.period };
  } catch (e) {
    console.error('[uploadPerformanceData]', e);
    return { error: e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.' };
  }
}

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

  const svc = getServiceClient();
  const { error: dbErr } = await svc
    .from('performance_reports')
    .delete()
    .eq('period', period);

  if (dbErr) return { error: `삭제 실패: ${dbErr.message}` };

  revalidatePath('/performance');
  return {};
}
