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

/** trend_prescriptions 에 EDI 원본 행 동기화 (이미 존재하면 스킵) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncEdiToDb(svc: any, rows: Record<string, unknown>[], data: EdiData, filename: string): Promise<void> {
  try {
    // 이미 DB에 저장됐으면 스킵
    const { count } = await svc
      .from('trend_prescriptions')
      .select('id', { count: 'exact', head: true })
      .eq('source_file', filename);
    if ((count ?? 0) > 0) return;

    const { detectedCols, period } = data;
    // period "YYYY.MM" → "YYYYMM"
    const prescMonth = period ? period.replace('.', '') : null;

    type InsertRow = {
      source_file: string;
      prescription_month: string | null;
      sales_rep: string | null;
      cso_name: string | null;
      hospital_name: string | null;
      product_name: string | null;
      prescription_amount: number | null;
    };

    const insertRows: InsertRow[] = [];
    for (const r of rows) {
      const sp  = detectedCols.salesperson ? String(r[detectedCols.salesperson] ?? '').trim() || null : null;
      const cso = detectedCols.cso         ? String(r[detectedCols.cso]         ?? '').trim() || null : null;
      const hos = detectedCols.hospital    ? String(r[detectedCols.hospital]    ?? '').trim() || null : null;
      const itm = detectedCols.item        ? String(r[detectedCols.item]        ?? '').trim() || null : null;
      const amt = detectedCols.finalAmount
        ? (Number(r[detectedCols.finalAmount]) || 0)
        : detectedCols.amount ? (Number(r[detectedCols.amount]) || 0) : 0;

      // 의미 있는 데이터가 있는 행만 저장
      if (!hos && !itm && amt === 0) continue;

      insertRows.push({
        source_file:          filename,
        prescription_month:   prescMonth,
        sales_rep:            sp,
        cso_name:             cso,
        hospital_name:        hos,
        product_name:         itm,
        prescription_amount:  amt > 0 ? amt : null,
      });
    }

    if (insertRows.length === 0) return;

    const CHUNK = 1000;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const { error } = await svc
        .from('trend_prescriptions')
        .insert(insertRows.slice(i, i + CHUNK));
      if (error) {
        console.warn(`[syncEdiToDb] 삽입 오류 (chunk ${i}):`, error.message);
        break;
      }
    }
    console.log(`[syncEdiToDb] ${filename}: ${insertRows.length}행 저장 완료`);
  } catch (e) {
    console.warn('[syncEdiToDb] 스킵:', e instanceof Error ? e.message : e);
  }
}

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

/* ── 헤더 행 자동 탐색 (BOM·개행 정규화, 다중 전략) ── */
function detectHeaderRow(rawArrays: unknown[][]): number {
  // 실제 파일 컬럼명 (스크린샷 기준 확정)
  const EXACT_COLS = new Set([
    '내부담당','내부담당자','담당자',        // salesperson
    '담당cso','cso명','cso',               // CSO
    '처방처명','처방처',                    // hospital
    '품목명','약품명',                      // item
    '처방금액','처방액',                    // amount
    '최종실적',                            // final
    '종별구분','종별',                      // type
    '실적월','처방월','청구월',             // date
  ]);
  const KW = ['담당자','담당','cso','거래처','처방처','품목','금액','처방','청구','기간','년월','사원','법인','성명'];

  let bestScore = -1;
  let bestRow   = 0;

  for (let ri = 0; ri < Math.min(rawArrays.length, 20); ri++) {
    const cells    = (rawArrays[ri] as unknown[]).map(c => String(c??'').replace(/^﻿/,'').replace(/[\r\n\s]+/g,' ').trim());
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length < 3) continue;

    const lower = nonEmpty.map(c => c.toLowerCase().replace(/\s/g,''));

    // 전략1: 정확한 컬럼명이 3개 이상 → 즉시 반환 (가장 신뢰도 높음)
    const exactHits = lower.filter(c => EXACT_COLS.has(c)).length;
    if (exactHits >= 3) return ri;

    // 전략2: 점수 기반
    const rowStr   = lower.join('|');
    const kwHits   = KW.filter(kw => rowStr.includes(kw)).length;
    const korCells = nonEmpty.filter(c => /[가-힣]/.test(c)).length;
    const score    = nonEmpty.length + exactHits * 5 + kwHits * 2 + korCells;
    if (score > bestScore) { bestScore = score; bestRow = ri; }
  }

  return bestRow;
}

/* ── EDI 폴더 파일 목록만 반환 ── */
export async function getEdiFileList(): Promise<{
  files: { id: string; filename: string; created_at: string }[];
  error?: string;
}> {
  const svc = getSvc();
  const { data: docs, error: dbErr } = await svc
    .from('documents')
    .select('id, filename, created_at')
    .eq('category', FOLDER_NAME)
    .in('file_type', ['xlsx', 'xls', 'csv', 'txt'])
    .order('created_at', { ascending: false });
  if (dbErr) return { files: [], error: dbErr.message };
  return { files: (docs ?? []) as { id: string; filename: string; created_at: string }[] };
}

/* ── 단건 파일 분析 ── */
export async function analyzeEdiFile(docId: string): Promise<{
  report?: EdiReport;
  error?: string;
}> {
  const svc = getSvc();
  const { data: doc, error: dbErr } = await svc
    .from('documents')
    .select('id, filename, file_type, storage_path, created_at')
    .eq('id', docId).single();
  if (dbErr || !doc) return { error: '파일을 찾을 수 없습니다.' };

  const d = doc as Record<string,string>;
  const cacheKey = `${CACHE_PREFIX}${d.id}.json`;
  const CV = 18;
  try {
    const { data: blob } = await svc.storage.from(BUCKET_CACHE).download(cacheKey);
    if (blob) {
      const cached = JSON.parse(await blob.text()) as EdiReport & { cacheVersion?: number };
      const cd = cached.data as unknown as Record<string,unknown>;
      if ((cached as unknown as Record<string,unknown>).cacheVersion === CV &&
          Array.isArray(cd.salesPersonStats) &&
          Array.isArray(cd.itemHospStats)) {
        return { report: cached };
      }
    }
  } catch { /* no cache */ }

  const { data: fileBlob, error: dlErr } = await svc.storage.from(BUCKET_DOCS).download(d.storage_path);
  if (dlErr || !fileBlob) return { error: dlErr?.message ?? '다운로드 실패' };
  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  if (buffer.length / 1024 / 1024 > 150)
    return { error: `파일 크기(${Math.round(buffer.length/1024/1024)}MB) 초과 — 150MB 이하 파일만 지원합니다` };

  try {
    let wb: XLSX.WorkBook;
    const xlsxOpts = { cellFormula: false, cellHTML: false, sheetRows: MAX_ROWS + 1 };
    if (d.file_type === 'csv' || d.file_type === 'txt') {
      let text: string;
      try { text = new TextDecoder('euc-kr').decode(buffer); } catch { text = buffer.toString('utf-8'); }
      wb = XLSX.read(text, { type: 'string', ...xlsxOpts });
    } else {
      wb = XLSX.read(buffer, { type: 'buffer', ...xlsxOpts });
    }
    let bestSheet = wb.SheetNames[0], bestRows = 0;
    for (const name of wb.SheetNames) {
      const ref = wb.Sheets[name]['!ref'];
      if (!ref) continue;
      const range = XLSX.utils.decode_range(ref);
      if (range.e.r - range.s.r > bestRows) { bestRows = range.e.r - range.s.r; bestSheet = name; }
    }
    // 행 0-9를 순서대로 헤더로 시도 → processEdi 성공 시 사용
    let data: ReturnType<typeof processEdi> | null = null;
    let usedHeaderRow = 0;
    for (let hri = 0; hri <= 9; hri++) {
      try {
        let tryRows = XLSX.utils.sheet_to_json<Record<string,unknown>>(
          wb.Sheets[bestSheet], { defval: '', range: hri },
        );
        if (tryRows.length === 0) continue;
        if (tryRows.length > MAX_ROWS) tryRows = tryRows.slice(0, MAX_ROWS);
        const tryData = processEdi(tryRows, d.filename);
        // salesperson 또는 hospital 데이터가 있으면 성공
        if (tryData.salesPersonStats.length > 0 || tryData.hospitalRanking.length > 0) {
          data = tryData;
          usedHeaderRow = hri;
          console.log(`[EDI] ${d.filename}: 헤더행=${hri} 성공 (담당자 ${tryData.salesPersonStats.length}명)`);
          break;
        }
      } catch { /* 이 행은 헤더가 아님, 다음 시도 */ }
    }
    if (!data) throw new Error('유효한 헤더 행을 찾을 수 없습니다 (행 0-9 시도 실패)');
    const report = { period: data!.period || d.filename, filename: d.filename, data, updated_at: d.created_at, doc_id: d.id, cacheVersion: CV } as EdiReport & { cacheVersion: number };
    try {
      const cBlob = new Blob([JSON.stringify(report)], { type: 'application/json' });
      await svc.storage.from(BUCKET_CACHE).upload(cacheKey, cBlob, { upsert: true });
    } catch { /* ignore */ }
    // DB 저장 (행 단위 구조화)
    if (data) {
      // 성공한 headerRow의 rows를 다시 파싱
      const savedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[bestSheet], { defval: '', range: usedHeaderRow },
      ).slice(0, MAX_ROWS);
      await syncEdiToDb(svc, savedRows, data, d.filename);
    }
    return { report };
  } catch (e) { return { error: e instanceof Error ? e.message : '분析 오류' }; }
}

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
        const CACHE_VERSION = 18; // totalHospitalCount 등 실제 건수 필드 추가
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

      let wb: XLSX.WorkBook;
      const xlsxOpts = { cellFormula: false, cellHTML: false, sheetRows: MAX_ROWS + 1 };

      if (doc.file_type === 'csv' || doc.file_type === 'txt') {
        let text: string;
        try {
          text = new TextDecoder('euc-kr').decode(buffer);
        } catch {
          text = buffer.toString('utf-8');
        }
        wb = XLSX.read(text, { type: 'string', ...xlsxOpts });
      } else {
        wb = XLSX.read(buffer, { type: 'buffer', ...xlsxOpts });
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

      // 실제 헤더 행 탐색 (첫 행이 제목/단위 행일 경우 대비)
      // 키워드가 포함된 행을 헤더로 사용
      const rawArrays2 = XLSX.utils.sheet_to_json<unknown[]>(
        wb.Sheets[bestSheet], { header: 1, defval: '' },
      );
      const headerRowIdx = detectHeaderRow(rawArrays2);

      let rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[bestSheet], { defval: '', range: headerRowIdx },
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
        cacheVersion: 18,
      };

      // 캐시 저장 (실패해도 무시)
      try {
        const cacheBlob = new Blob([JSON.stringify(report)], { type: 'application/json' });
        await svc.storage.from(BUCKET_CACHE).upload(cacheKey, cacheBlob, { upsert: true });
      } catch (cacheErr) {
        console.warn('[getEdiData] cache write failed:', cacheErr);
      }

      // DB 저장 (행 단위 구조화)
      await syncEdiToDb(svc, rows, data, doc.filename as string);

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
