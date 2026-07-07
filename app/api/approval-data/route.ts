import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type SheetRow = Record<string, string | number | boolean | null>;

export type PeriodResult = {
  id: string;
  filename: string;
  period: string; // "YYYY-MM"
  meta: {
    totalCount: number;
    uniqueDiseases: number;
    uniqueIngredients: number;
    csoCount: number;
    csoCompanyCount: number;
    topIngredientName: string;
    topIngredientCompanyCount: number;
    topIngredientTotalCount: number;
    pipelineCount: number;
  };
  diseaseBreakdown:      { name: string; count: number }[];
  approvalTypeBreakdown: { name: string; count: number }[];
  topIngredients:        { name: string; count: number }[];
  cumulativeIngredients: { name: string; count: number }[];
  pipeline: { disease: string; ingredient: string; ownStatus: string; thisMonth: string }[];
  warnings: string[];
};

export type CombinedData = {
  meta: {
    totalCount: number;
    uniqueDiseases: number;
    uniqueIngredients: number;
    csoCount: number;
    csoCompanyCount: number;
    topIngredientName: string;
    topIngredientCompanyCount: number;
    topIngredientTotalCount: number;
    pipelineCount: number;
    periodCount: number;
  };
  diseaseBreakdown:      { name: string; count: number }[];
  approvalTypeBreakdown: { name: string; count: number }[];
  topIngredients:        { name: string; count: number }[];
  monthlyTrend:          { period: string; filename: string; count: number }[];
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

function extractPeriodKey(filename: string): string {
  const m1 = filename.match(/(\d{4})년?\s*(\d{1,2})월/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}`;
  const m2 = filename.match(/(\d{4})[.\-](\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  const m3 = filename.match(/_(\d{2})\.(\d{2})/);
  if (m3) return `20${m3[1]}-${m3[2]}`;
  return '';
}

function mergeBreakdowns(
  lists: { name: string; count: number }[][],
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const list of lists)
    for (const item of list)
      map.set(item.name, (map.get(item.name) ?? 0) + item.count);
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/* ── 단일 파일 파싱 ── */
function parseFile(wb: XLSX.WorkBook): Omit<PeriodResult, 'id' | 'filename' | 'period'> {
  const warnings: string[] = [];
  const sheetNames = wb.SheetNames;

  const mainPriority = ['허가현황', '데이터', '전체', '목록', '내역', '허가'];
  let mainSheetName = sheetNames[0] ?? '';
  for (const kw of mainPriority) {
    const f = sheetNames.find(s => s.includes(kw));
    if (f) { mainSheetName = f; break; }
  }

  const mainWs = wb.Sheets[mainSheetName];
  const rows: SheetRow[] = mainWs
    ? XLSX.utils.sheet_to_json<SheetRow>(mainWs, { defval: null })
    : [];

  if (rows.length === 0) warnings.push(`'${mainSheetName}' 시트에 데이터가 없습니다.`);

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const diseaseCol      = findCol(headers, ['질환군', '질환분류', '치료질환', '질환']);
  const ingredientCol   = findCol(headers, ['성분명', '성분']);
  const approvalTypeCol = findCol(headers, ['허가유형', '허가구분', '허가종류', '유형']);
  const companyCol      = findCol(headers, ['회사명', '업체명', '제약사', '허가업체', '제조사']);
  const csoCol          = findCol(headers, ['CSO여부', 'CSO', 'cso', 'CSO사']);

  const diseaseMap         = new Map<string, number>();
  const approvalTypeMap    = new Map<string, number>();
  const ingredientCountMap = new Map<string, number>();
  const ingredientCompanyMap = new Map<string, Set<string>>();
  const csoCompanies = new Set<string>();
  let csoCount = 0;

  for (const row of rows) {
    const disease      = diseaseCol      ? str(row[diseaseCol])      || '기타' : '기타';
    const approvalType = approvalTypeCol ? str(row[approvalTypeCol]) || '기타' : '기타';
    const ingredient   = ingredientCol   ? str(row[ingredientCol]) : '';
    const company      = companyCol      ? str(row[companyCol]) : '';
    const csoRaw       = csoCol          ? str(row[csoCol]).toUpperCase() : '';

    diseaseMap.set(disease, (diseaseMap.get(disease) ?? 0) + 1);
    approvalTypeMap.set(approvalType, (approvalTypeMap.get(approvalType) ?? 0) + 1);

    if (ingredient) {
      ingredientCountMap.set(ingredient, (ingredientCountMap.get(ingredient) ?? 0) + 1);
      if (company) {
        if (!ingredientCompanyMap.has(ingredient)) ingredientCompanyMap.set(ingredient, new Set());
        ingredientCompanyMap.get(ingredient)!.add(company);
      }
    }
    if (['Y', 'CSO', '예', 'O', '○', '1'].includes(csoRaw)) {
      csoCount++;
      if (company) csoCompanies.add(company);
    }
  }

  const totalCount = rows.length;

  // 최다 집중 성분 (회사 수 기준)
  let topIngredientName = '', topIngredientCompanyCount = 0, topIngredientTotalCount = 0;
  for (const [name, companies] of ingredientCompanyMap.entries()) {
    if (companies.size > topIngredientCompanyCount) {
      topIngredientCompanyCount = companies.size;
      topIngredientName = name;
      topIngredientTotalCount = ingredientCountMap.get(name) ?? 0;
    }
  }
  if (!topIngredientName && ingredientCountMap.size > 0) {
    let mx = 0;
    for (const [name, cnt] of ingredientCountMap.entries()) {
      if (cnt > mx) { mx = cnt; topIngredientName = name; topIngredientTotalCount = cnt; }
    }
  }

  const diseaseBreakdown = Array.from(diseaseMap.entries())
    .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const approvalTypeBreakdown = Array.from(approvalTypeMap.entries())
    .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const topIngredients = Array.from(ingredientCountMap.entries())
    .map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  // 누계 시트
  let cumulativeIngredients: { name: string; count: number }[] = [];
  for (const kw of ['누계', '분기', '집계', '3월', '4월', '5월']) {
    const f = sheetNames.find(s => s !== mainSheetName && s.includes(kw));
    if (f && wb.Sheets[f]) {
      const cumRows = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[f], { defval: null });
      const ch = cumRows.length > 0 ? Object.keys(cumRows[0]) : [];
      const nameCol  = findCol(ch, ['성분명', '성분']);
      const countCol = findCol(ch, ['누계', '건수', '허가수', '합계', '품목수', 'count']);
      if (nameCol && countCol) {
        cumulativeIngredients = cumRows
          .map(r => ({ name: str(r[nameCol]), count: Number(r[countCol] ?? 0) }))
          .filter(r => r.name && r.count > 0)
          .sort((a, b) => b.count - a.count).slice(0, 5);
        break;
      }
    }
  }
  if (cumulativeIngredients.length === 0) cumulativeIngredients = topIngredients;

  // 파이프라인 시트
  let pipeline: PeriodResult['pipeline'] = [];
  for (const kw of ['파이프라인', 'pipeline', '자사', '포트폴리오', '현황']) {
    const f = sheetNames.find(s => s !== mainSheetName && s.includes(kw));
    if (f && wb.Sheets[f]) {
      const pRows = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[f], { defval: null });
      const ph = pRows.length > 0 ? Object.keys(pRows[0]) : [];
      const dc = findCol(ph, ['질환군', '질환분류', '질환']);
      const ic = findCol(ph, ['성분명', '성분']);
      const oc = findCol(ph, ['자사현황', '자사', '현황', '보유현황']);
      const mc = findCol(ph, ['이달', '동향', '6월', '7월', '최근', '월동향']);
      if (dc || ic) {
        pipeline = pRows.map(r => ({
          disease:   dc ? str(r[dc]) : '',
          ingredient: ic ? str(r[ic]) : '',
          ownStatus: oc ? str(r[oc]) : '',
          thisMonth: mc ? str(r[mc]) : '',
        })).filter(r => r.disease || r.ingredient);
        break;
      }
    }
  }

  return {
    meta: {
      totalCount, uniqueDiseases: diseaseMap.size, uniqueIngredients: ingredientCountMap.size,
      csoCount, csoCompanyCount: csoCompanies.size,
      topIngredientName, topIngredientCompanyCount, topIngredientTotalCount,
      pipelineCount: pipeline.length,
    },
    diseaseBreakdown, approvalTypeBreakdown, topIngredients, cumulativeIngredients, pipeline, warnings,
  };
}

/* ── 통합 집계 ── */
function computeCombined(periods: PeriodResult[]): CombinedData {
  const diseaseBreakdown      = mergeBreakdowns(periods.map(p => p.diseaseBreakdown));
  const approvalTypeBreakdown = mergeBreakdowns(periods.map(p => p.approvalTypeBreakdown));
  const topIngredients        = mergeBreakdowns(periods.map(p => p.topIngredients)).slice(0, 5);
  const monthlyTrend          = periods.map(p => ({ period: p.period, filename: p.filename, count: p.meta.totalCount }));

  // 파이프라인: 가장 최근 달 기준
  const withPipeline = [...periods].reverse().find(p => p.pipeline.length > 0);
  const pipeline = withPipeline?.pipeline ?? [];

  const totalCount       = periods.reduce((s, p) => s + p.meta.totalCount, 0);
  const csoCount         = periods.reduce((s, p) => s + p.meta.csoCount, 0);
  const csoCompanySet    = new Set(periods.flatMap(p =>
    p.pipeline.map(r => r.ownStatus).filter(Boolean)));
  const allIngredients   = mergeBreakdowns(periods.map(p => p.topIngredients));
  const topIng           = allIngredients[0];

  return {
    meta: {
      totalCount,
      uniqueDiseases: diseaseBreakdown.length,
      uniqueIngredients: allIngredients.length,
      csoCount,
      csoCompanyCount: csoCompanySet.size,
      topIngredientName: topIng?.name ?? '',
      topIngredientCompanyCount: 0,
      topIngredientTotalCount: topIng?.count ?? 0,
      pipelineCount: pipeline.length,
      periodCount: periods.length,
    },
    diseaseBreakdown, approvalTypeBreakdown, topIngredients, monthlyTrend, pipeline,
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

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const settled = await Promise.allSettled(ids.map(async (id): Promise<PeriodResult> => {
    const { data: doc, error: docErr } = await db
      .from('documents')
      .select('storage_path, company_id, filename')
      .eq('id', id)
      .single();

    if (docErr || !doc) throw new Error(`Document ${id} not found`);
    if (companyId && doc.company_id && doc.company_id !== companyId)
      throw new Error(`Forbidden: ${id}`);

    const { data: fileData, error: dlErr } = await db.storage
      .from('documents').download(doc.storage_path as string);
    if (dlErr || !fileData) throw new Error(`Download failed: ${id}`);

    const uint8Array = new Uint8Array(await fileData.arrayBuffer());
    const wb = XLSX.read(uint8Array, { type: 'array' });
    const parsed = parseFile(wb);
    const period = extractPeriodKey(doc.filename as string);

    return { id, filename: doc.filename as string, period, ...parsed };
  }));

  const periods = settled
    .filter((r): r is PromiseFulfilledResult<PeriodResult> => r.status === 'fulfilled')
    .map(r => r.value)
    .sort((a, b) => a.period.localeCompare(b.period));

  const failedCount = settled.filter(r => r.status === 'rejected').length;
  const combined    = computeCombined(periods);

  return NextResponse.json({ periods, combined, failedCount });
}
