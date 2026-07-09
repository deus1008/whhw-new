import * as XLSX from 'xlsx';
import { processEdi } from './process';
import type { EdiData } from './process';
import { invalidateDashboardCache } from '@/lib/dashboard-cache';

export const CACHE_VERSION = 21;
const MAX_ROWS = 100_000;

/** trend_prescriptions 에 EDI 원본 행 동기화 (기존 데이터 삭제 후 재삽입) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncEdiToDb(svc: any, rows: Record<string, unknown>[], data: EdiData, filename: string, companyId?: string | null): Promise<void> {
  try {
    const { detectedCols, period } = data;
    const prescMonth = period ? period.replace(/[.\-]/, '') : null;

    await svc.from('trend_prescriptions').delete().eq('source_file', filename);
    if (prescMonth) {
      // YYYYMM 포맷 삭제 (현재 저장 포맷)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let delQ: any = svc.from('trend_prescriptions').delete().eq('prescription_month', prescMonth);
      if (companyId) delQ = delQ.eq('company_id', companyId);
      else delQ = delQ.is('company_id', null);
      await delQ;
      // 레거시 포맷(YYYY-MM, YYYY.MM)도 함께 삭제 — 이전 동기화 잔여 데이터 방지
      const prescMonthDash = `${prescMonth.slice(0, 4)}-${prescMonth.slice(4)}`;
      const prescMonthDot  = `${prescMonth.slice(0, 4)}.${prescMonth.slice(4)}`;
      for (const fmt of [prescMonthDash, prescMonthDot]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fmtQ: any = svc.from('trend_prescriptions').delete().eq('prescription_month', fmt);
        if (companyId) fmtQ = fmtQ.eq('company_id', companyId);
        else fmtQ = fmtQ.is('company_id', null);
        await fmtQ;
      }
    }

    type InsertRow = {
      source_file: string;
      prescription_month: string | null;
      sales_rep: string | null;
      cso_name: string | null;
      hospital_name: string | null;
      product_name: string | null;
      prescription_amount: number | null;
      company_id: string | null;
    };

    const insertRows: InsertRow[] = [];
    for (const r of rows) {
      const sp  = detectedCols.salesperson ? String(r[detectedCols.salesperson] ?? '').trim() || null : null;
      const cso = detectedCols.cso         ? String(r[detectedCols.cso]         ?? '').trim() || null : null;
      const hos = detectedCols.hospital    ? String(r[detectedCols.hospital]    ?? '').trim() || null : null;
      const itm = detectedCols.item        ? String(r[detectedCols.item]        ?? '').trim() || null : null;
      const amt = detectedCols.amount ? (Number(r[detectedCols.amount]) || 0) : 0;

      if (!hos && !itm && amt === 0) continue;

      insertRows.push({
        source_file:         filename,
        prescription_month:  prescMonth,
        sales_rep:           sp,
        cso_name:            cso,
        hospital_name:       hos,
        product_name:        itm,
        prescription_amount: amt !== 0 ? amt : null,
        company_id:          companyId ?? null,
      });
    }

    if (insertRows.length === 0) return;

    const CHUNK = 500;
    let insertedTotal = 0;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const { error } = await svc
        .from('trend_prescriptions')
        .insert(insertRows.slice(i, i + CHUNK));
      if (error) {
        console.warn(`[syncEdiToDb] 삽입 오류 (chunk ${i}):`, error.message);
        // break 대신 continue — 한 청크 실패가 전체 중단으로 이어지지 않도록
        continue;
      }
      insertedTotal += Math.min(CHUNK, insertRows.length - i);
    }
    console.log(`[syncEdiToDb] ${filename}: ${insertedTotal}/${insertRows.length}행 저장 완료`);

    // 대시보드 집계 캐시 무효화 — 다음 /weekly 로드 시 최신 데이터로 재계산
    await invalidateDashboardCache(svc, companyId ?? null);
  } catch (e) {
    console.warn('[syncEdiToDb] 스킵:', e instanceof Error ? e.message : e);
  }
}

/** xlsx/csv/txt 버퍼를 파싱하여 행 배열과 EdiData를 반환 */
export function parseEdiBuffer(
  buffer: Buffer,
  filename: string,
  fileType: string,
): { rows: Record<string, unknown>[]; data: EdiData; headerRow: number } | { error: string } {
  try {
    let wb: XLSX.WorkBook;
    const xlsxOpts = { cellFormula: false, cellHTML: false, sheetRows: MAX_ROWS + 1 };
    if (fileType === 'csv' || fileType === 'txt') {
      let text: string;
      try { text = new TextDecoder('euc-kr').decode(buffer); } catch { text = buffer.toString('utf-8'); }
      wb = XLSX.read(text, { type: 'string', ...xlsxOpts });
    } else {
      wb = XLSX.read(buffer, { type: 'buffer', ...xlsxOpts });
    }

    let bestSheet = wb.SheetNames[0];
    let bestRows  = 0;
    for (const name of wb.SheetNames) {
      const ref = wb.Sheets[name]['!ref'];
      if (!ref) continue;
      const range = XLSX.utils.decode_range(ref);
      if (range.e.r - range.s.r > bestRows) { bestRows = range.e.r - range.s.r; bestSheet = name; }
    }

    for (let hri = 0; hri <= 9; hri++) {
      try {
        let tryRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          wb.Sheets[bestSheet], { defval: '', range: hri },
        );
        if (tryRows.length === 0) continue;
        if (tryRows.length > MAX_ROWS) tryRows = tryRows.slice(0, MAX_ROWS);
        const tryData = processEdi(tryRows, filename);
        if (tryData.salesPersonStats.length > 0 || tryData.hospitalRanking.length > 0) {
          console.log(`[parseEdiBuffer] ${filename}: 헤더행=${hri}, 담당자 ${tryData.salesPersonStats.length}명`);
          return { rows: tryRows, data: tryData, headerRow: hri };
        }
      } catch { /* 이 행은 헤더가 아님, 다음 시도 */ }
    }
    return { error: '유효한 헤더 행을 찾을 수 없습니다 (행 0-9 시도 실패)' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '파싱 오류' };
  }
}
