import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';
import * as XLSX from 'xlsx';
import { stripCompanyAffix } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type SheetRow = Record<string, string | number | boolean | null>;

export type DrilldownRow = {
  company: string;
  ingredient: string;     // 품목허가공고엔 성분 컬럼이 없어 '' (하위호환)
  product: string;
  approvalDate: string;
  approvalType?: string;
  rxType?: string;
  cancelled?: boolean;
  cancelDate?: string;
};

export type PeriodResult = {
  id: string;
  filename: string;
  period: string; // "YYYY-MM" (허가일자 기준 허가월)
  meta: {
    totalCount: number;        // 유효 허가(취소 제외)
    approvedCount: number;     // 전체 허가(취소 포함)
    cancelledCount: number;    // 취소 건수
    uniqueIngredients: number;
    topIngredientName: string;
    topIngredientCompanyCount: number;
    topIngredientTotalCount: number;
    pipelineCount: number;
  };
  companyBreakdown:      { name: string; count: number }[];
  approvalTypeBreakdown: { name: string; count: number }[];
  rxTypeBreakdown:       { name: string; count: number }[];
  topIngredients:        { name: string; count: number }[];
  cumulativeIngredients: { name: string; count: number }[];
  drilldownRows:         DrilldownRow[];
  pipeline: { disease: string; ingredient: string; ownStatus: string; thisMonth: string }[];
  warnings: string[];
};

export type CombinedData = {
  meta: {
    totalCount: number;
    approvedCount: number;
    cancelledCount: number;
    uniqueIngredients: number;
    topIngredientName: string;
    topIngredientCompanyCount: number;
    topIngredientTotalCount: number;
    pipelineCount: number;
    periodCount: number;
  };
  companyBreakdown:      { name: string; count: number }[];
  approvalTypeBreakdown: { name: string; count: number }[];
  rxTypeBreakdown:       { name: string; count: number }[];
  topIngredients:        { name: string; count: number }[];
  monthlyTrend:          { period: string; filename: string; count: number; approved: number; cancelled: number }[];
  drilldownRows:         DrilldownRow[];
  pipeline: { disease: string; ingredient: string; ownStatus: string; thisMonth: string }[];
};

/* ── 유틸 ── */
function findCol(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const cl = c.toLowerCase();
    const f = headers.find(h => h.toLowerCase().includes(cl) || cl.includes(h.toLowerCase()));
    if (f) return f;
  }
  return null;
}

function str(v: string | number | boolean | null | undefined): string {
  return String(v ?? '').trim();
}

function formatDate(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    const d = new Date((v - 25569) * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  const m1 = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2,'0')}-${m1[3].padStart(2,'0')}`;
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return s;
}

const MONTH_RE = /^\d{4}-\d{2}/;

function mergeBreakdowns(lists: { name: string; count: number }[][]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const list of lists)
    for (const item of list)
      map.set(item.name, (map.get(item.name) ?? 0) + item.count);
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/* ── 파일 → 행 추출(허가일자·취소일자 등) ── */
type RawRow = { company: string; product: string; approvalDate: string; cancelDate: string; approvalType: string; rxType: string };

function parseRawRows(wb: XLSX.WorkBook): { rows: RawRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const sheetNames = wb.SheetNames;
  let mainSheet = sheetNames[0] ?? '';
  for (const kw of ['허가', '공고', '품목', '데이터', '목록', '내역']) {
    const f = sheetNames.find(s => s.includes(kw));
    if (f) { mainSheet = f; break; }
  }
  const ws = wb.Sheets[mainSheet];
  const raw: SheetRow[] = ws ? XLSX.utils.sheet_to_json<SheetRow>(ws, { defval: null }) : [];
  if (raw.length === 0) { warnings.push(`'${mainSheet}' 시트에 데이터가 없습니다.`); return { rows: [], warnings }; }

  const headers = Object.keys(raw[0]);
  const productCol = findCol(headers, ['제품명', '품목명', '품명', '의약품명', '품목']);
  const companyCol = findCol(headers, ['업체명', '회사명', '제약사', '제조사', '허가업체']);
  const apprCol    = findCol(headers, ['허가일자', '허가일', '승인일', '허가연월일', '공고일']);
  const cancelCol  = findCol(headers, ['취소일자', '취소일', '취하일자', '취하일']);
  const typeCol    = findCol(headers, ['허가심사유형', '허가유형', '허가구분', '심사유형', '유형']);
  const rxCol      = findCol(headers, ['전문일반', '전문/일반', '전문의약품']);
  if (!apprCol) warnings.push('허가일자 컬럼을 자동 인식하지 못했습니다.');

  const rows = raw.map(r => ({
    company:      companyCol ? stripCompanyAffix(str(r[companyCol])) : '',
    product:      productCol ? str(r[productCol]) : '',
    approvalDate: apprCol    ? formatDate(r[apprCol]) : '',
    cancelDate:   cancelCol  ? formatDate(r[cancelCol]) : '',
    approvalType: typeCol    ? (str(r[typeCol]) || '기타') : '기타',
    rxType:       rxCol      ? str(r[rxCol]) : '',
  })).filter(r => r.company || r.product);

  return { rows, warnings };
}

/* ── 허가월(허가일자 기준) 단위 집계 ── */
function buildPeriod(month: string, rows: RawRow[]): PeriodResult {
  const active    = rows.filter(r => !r.cancelDate);
  const cancelled = rows.filter(r =>  r.cancelDate);

  const companyMap = new Map<string, number>();
  const typeMap    = new Map<string, number>();
  const rxMap      = new Map<string, number>();
  for (const r of active) {
    if (r.company) companyMap.set(r.company, (companyMap.get(r.company) ?? 0) + 1);
    typeMap.set(r.approvalType || '기타', (typeMap.get(r.approvalType || '기타') ?? 0) + 1);
    if (r.rxType) rxMap.set(r.rxType, (rxMap.get(r.rxType) ?? 0) + 1);
  }
  const toArr = (m: Map<string, number>) => Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const companyBreakdown = toArr(companyMap);
  const drilldownRows: DrilldownRow[] = active.map(r => ({
    company: r.company, ingredient: '', product: r.product, approvalDate: r.approvalDate,
    approvalType: r.approvalType, rxType: r.rxType, cancelled: false, cancelDate: '',
  })).filter(r => r.company || r.product);

  return {
    id: month, filename: '', period: month,
    meta: {
      totalCount: active.length,
      approvedCount: rows.length,
      cancelledCount: cancelled.length,
      uniqueIngredients: 0,
      topIngredientName: '', topIngredientCompanyCount: 0, topIngredientTotalCount: 0,
      pipelineCount: 0,
    },
    companyBreakdown,
    approvalTypeBreakdown: toArr(typeMap),
    rxTypeBreakdown:       toArr(rxMap),
    topIngredients: [], cumulativeIngredients: [],
    drilldownRows, pipeline: [], warnings: [],
  };
}

function computeCombined(periods: PeriodResult[]): CombinedData {
  const companyBreakdown      = mergeBreakdowns(periods.map(p => p.companyBreakdown));
  const approvalTypeBreakdown = mergeBreakdowns(periods.map(p => p.approvalTypeBreakdown));
  const rxTypeBreakdown       = mergeBreakdowns(periods.map(p => p.rxTypeBreakdown));
  const monthlyTrend = periods.map(p => ({
    period: p.period, filename: '',
    count: p.meta.totalCount, approved: p.meta.approvedCount, cancelled: p.meta.cancelledCount,
  }));
  const totalCount     = periods.reduce((s, p) => s + p.meta.totalCount, 0);
  const approvedCount  = periods.reduce((s, p) => s + p.meta.approvedCount, 0);
  const cancelledCount = periods.reduce((s, p) => s + p.meta.cancelledCount, 0);

  return {
    meta: {
      totalCount, approvedCount, cancelledCount,
      uniqueIngredients: 0,
      topIngredientName: '', topIngredientCompanyCount: 0, topIngredientTotalCount: 0,
      pipelineCount: 0, periodCount: periods.length,
    },
    drilldownRows: periods.flatMap(p => p.drilldownRows),
    companyBreakdown, approvalTypeBreakdown, rxTypeBreakdown, topIngredients: [], monthlyTrend, pipeline: [],
  };
}

/* ── GET 핸들러 ── */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const idsParam = request.nextUrl.searchParams.get('ids');
  if (!idsParam) return NextResponse.json({ error: 'Missing ids param' }, { status: 400 });
  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: 'No valid IDs' }, { status: 400 });

  const isAdmin   = profileIsAdmin(profile);
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);

  const db = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 모든 파일 행 수집
  const settled = await Promise.allSettled(ids.map(async (id): Promise<RawRow[]> => {
    const { data: doc, error: docErr } = await db
      .from('documents').select('storage_path, company_id, filename').eq('id', id).single();
    if (docErr || !doc) throw new Error(`Document ${id} not found`);
    if (companyId && doc.company_id && doc.company_id !== companyId) throw new Error(`Forbidden: ${id}`);
    const { data: fileData, error: dlErr } = await db.storage.from('documents').download(doc.storage_path as string);
    if (dlErr || !fileData) throw new Error(`Download failed: ${id}`);
    const wb = XLSX.read(new Uint8Array(await fileData.arrayBuffer()), { type: 'array' });
    return parseRawRows(wb).rows;
  }));

  const failedCount = settled.filter(r => r.status === 'rejected').length;

  // 파일 간 중복 제거(제품·업체·허가일자). 취소 정보가 있는 행 우선.
  const seen = new Map<string, RawRow>();
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const row of s.value) {
      const key = `${row.product}||${row.company}||${row.approvalDate}`;
      const ex = seen.get(key);
      if (!ex || (!ex.cancelDate && row.cancelDate)) seen.set(key, row);
    }
  }

  // 허가월(허가일자 기준)로 그룹
  const byMonth = new Map<string, RawRow[]>();
  let undated = 0;
  for (const row of seen.values()) {
    const m = MONTH_RE.test(row.approvalDate) ? row.approvalDate.slice(0, 7) : '';
    if (!m) { undated++; continue; }
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(row);
  }

  // 품목허가 이력이 수십 년에 걸쳐 있어, 최근 N개월(허가일자 기준)만 표시.
  const MONTHS_WINDOW = 36;
  const allMonths = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const windowMonths = allMonths.slice(-MONTHS_WINDOW);
  const totalMonths = allMonths.length;
  const periods = windowMonths.map(([month, rows]) => buildPeriod(month, rows));

  if (periods.length > 0) {
    if (undated > 0) periods[periods.length - 1].warnings.push(`허가일자 미기재 ${undated}건은 허가월 분류에서 제외됨`);
    if (totalMonths > MONTHS_WINDOW) periods[0].warnings.push(`허가일자 기준 최근 ${MONTHS_WINDOW}개월만 표시(전체 ${totalMonths}개월 중)`);
  }

  const combined = computeCombined(periods);

  return NextResponse.json({ periods, combined, failedCount, totalMonths, windowMonths: MONTHS_WINDOW });
}
