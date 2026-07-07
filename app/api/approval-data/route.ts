import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SheetRow = Record<string, string | number | boolean | null>;

function findCol(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const cl = c.toLowerCase();
    const found = headers.find(h => h.toLowerCase().includes(cl) || cl.includes(h.toLowerCase()));
    if (found) return found;
  }
  return null;
}

function str(v: string | number | boolean | null | undefined): string {
  return String(v ?? '').trim();
}

function parseApprovalData(wb: XLSX.WorkBook, filename: string) {
  const warnings: string[] = [];
  const sheetNames = wb.SheetNames;

  // Find main data sheet
  const mainPriority = ['허가현황', '데이터', '전체', '목록', '내역', '허가'];
  let mainSheetName = sheetNames[0] ?? '';
  for (const keyword of mainPriority) {
    const found = sheetNames.find(s => s.includes(keyword));
    if (found) { mainSheetName = found; break; }
  }

  const mainWs = wb.Sheets[mainSheetName];
  const rows: SheetRow[] = mainWs ? XLSX.utils.sheet_to_json<SheetRow>(mainWs, { defval: null }) : [];

  if (rows.length === 0) warnings.push(`'${mainSheetName}' 시트에 데이터가 없습니다.`);

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  const diseaseCol   = findCol(headers, ['질환군', '질환분류', '치료질환', '질환']);
  const ingredientCol = findCol(headers, ['성분명', '성분']);
  const approvalTypeCol = findCol(headers, ['허가유형', '허가구분', '허가종류', '유형']);
  const companyCol   = findCol(headers, ['회사명', '업체명', '제약사', '허가업체', '제조사']);
  const csoCol       = findCol(headers, ['CSO여부', 'CSO', 'cso', 'CSO사']);
  const productCol   = findCol(headers, ['품목명', '제품명', '품명']);

  const diseaseMap      = new Map<string, number>();
  const approvalTypeMap = new Map<string, number>();
  const ingredientCountMap = new Map<string, number>();
  const ingredientCompanyMap = new Map<string, Set<string>>();
  const csoCompanies = new Set<string>();
  let csoCount = 0;

  for (const row of rows) {
    const disease = diseaseCol ? str(row[diseaseCol]) || '기타' : '기타';
    const approvalType = approvalTypeCol ? str(row[approvalTypeCol]) || '기타' : '기타';
    const ingredient = ingredientCol ? str(row[ingredientCol]) : '';
    const company = companyCol ? str(row[companyCol]) : '';
    const csoRaw = csoCol ? str(row[csoCol]).toUpperCase() : '';

    diseaseMap.set(disease, (diseaseMap.get(disease) ?? 0) + 1);
    approvalTypeMap.set(approvalType, (approvalTypeMap.get(approvalType) ?? 0) + 1);

    if (ingredient) {
      ingredientCountMap.set(ingredient, (ingredientCountMap.get(ingredient) ?? 0) + 1);
      if (company) {
        if (!ingredientCompanyMap.has(ingredient)) ingredientCompanyMap.set(ingredient, new Set());
        ingredientCompanyMap.get(ingredient)!.add(company);
      }
    }

    if (csoRaw === 'Y' || csoRaw === 'CSO' || csoRaw === '예' || csoRaw === 'O' || csoRaw === '○' || csoRaw === '1') {
      csoCount++;
      if (company) csoCompanies.add(company);
    }
  }

  const totalCount = rows.length;

  let topIngredientName = '';
  let topIngredientCompanyCount = 0;
  let topIngredientTotalCount = 0;
  for (const [name, companies] of ingredientCompanyMap.entries()) {
    if (companies.size > topIngredientCompanyCount) {
      topIngredientCompanyCount = companies.size;
      topIngredientName = name;
      topIngredientTotalCount = ingredientCountMap.get(name) ?? 0;
    }
  }
  if (!topIngredientName && ingredientCountMap.size > 0) {
    let maxCnt = 0;
    for (const [name, cnt] of ingredientCountMap.entries()) {
      if (cnt > maxCnt) { maxCnt = cnt; topIngredientName = name; topIngredientTotalCount = cnt; }
    }
  }

  const diseaseBreakdown = Array.from(diseaseMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const approvalTypeBreakdown = Array.from(approvalTypeMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const topIngredients = Array.from(ingredientCountMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Cumulative ingredients sheet
  let cumulativeIngredients: { name: string; count: number }[] = [];
  const cumKeywords = ['누계', '분기', '집계', '성분', '3월', '4월', '5월'];
  for (const kw of cumKeywords) {
    const found = sheetNames.find(s => s !== mainSheetName && s.includes(kw));
    if (found && wb.Sheets[found]) {
      const cumRows = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[found], { defval: null });
      const cumHdrs = cumRows.length > 0 ? Object.keys(cumRows[0]) : [];
      const nameCol = findCol(cumHdrs, ['성분명', '성분']);
      const countCol = findCol(cumHdrs, ['누계', '건수', '허가수', '합계', '품목수', 'count']);
      if (nameCol && countCol) {
        cumulativeIngredients = cumRows
          .map(r => ({ name: str(r[nameCol]), count: Number(r[countCol] ?? 0) }))
          .filter(r => r.name && r.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        break;
      }
    }
  }
  if (cumulativeIngredients.length === 0) cumulativeIngredients = topIngredients;

  // Pipeline sheet
  let pipeline: { disease: string; ingredient: string; ownStatus: string; thisMonth: string }[] = [];
  const pipelineKeywords = ['파이프라인', 'pipeline', '자사', '포트폴리오', '현황'];
  for (const kw of pipelineKeywords) {
    const found = sheetNames.find(s => s !== mainSheetName && s.includes(kw));
    if (found && wb.Sheets[found]) {
      const pRows = XLSX.utils.sheet_to_json<SheetRow>(wb.Sheets[found], { defval: null });
      const pHdrs = pRows.length > 0 ? Object.keys(pRows[0]) : [];
      const diseaseC = findCol(pHdrs, ['질환군', '질환분류', '질환']);
      const ingredC  = findCol(pHdrs, ['성분명', '성분']);
      const ownC     = findCol(pHdrs, ['자사현황', '자사', '현황', '보유현황']);
      const monthC   = findCol(pHdrs, ['이달', '동향', '6월', '최근', '월동향']);
      if (diseaseC || ingredC) {
        pipeline = pRows.map(r => ({
          disease:   diseaseC ? str(r[diseaseC]) : '',
          ingredient: ingredC ? str(r[ingredC]) : '',
          ownStatus: ownC ? str(r[ownC]) : '',
          thisMonth: monthC ? str(r[monthC]) : '',
        })).filter(r => r.disease || r.ingredient);
        break;
      }
    }
  }

  // If no pipeline sheet, try to find pipeline columns in main sheet
  if (pipeline.length === 0 && headers.length > 0) {
    const ownC = findCol(headers, ['자사현황', '자사여부', '자사']);
    if (ownC && diseaseCol && ingredientCol) {
      pipeline = rows
        .filter(r => str(r[ownC]))
        .map(r => ({
          disease: diseaseCol ? str(r[diseaseCol]) : '',
          ingredient: ingredientCol ? str(r[ingredientCol]) : '',
          ownStatus: str(r[ownC]),
          thisMonth: productCol ? str(r[productCol]) : '',
        }));
    }
  }

  return {
    meta: {
      sheetNames,
      mainSheetName,
      totalCount,
      uniqueDiseases: diseaseMap.size,
      uniqueIngredients: ingredientCountMap.size,
      csoCount,
      csoCompanyCount: csoCompanies.size,
      topIngredientName,
      topIngredientCompanyCount,
      topIngredientTotalCount,
      pipelineCount: pipeline.length,
      columnsDetected: { diseaseCol, ingredientCol, approvalTypeCol, companyCol, csoCol, productCol },
    },
    diseaseBreakdown,
    approvalTypeBreakdown,
    topIngredients,
    cumulativeIngredients,
    pipeline,
    warnings,
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const docId = request.nextUrl.searchParams.get('id');
  if (!docId) return NextResponse.json({ error: 'Missing id param' }, { status: 400 });

  const isAdmin = profileIsAdmin(profile);
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: doc, error: docErr } = await db
    .from('documents')
    .select('storage_path, company_id, filename')
    .eq('id', docId)
    .single();

  if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  if (companyId && doc.company_id && doc.company_id !== companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: fileData, error: downloadErr } = await db.storage
    .from('documents')
    .download(doc.storage_path);

  if (downloadErr || !fileData) {
    console.error('[approval-data] download error:', downloadErr?.message);
    return NextResponse.json({ error: 'File download failed' }, { status: 503 });
  }

  try {
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const wb = XLSX.read(uint8Array, { type: 'array' });
    const result = parseApprovalData(wb, doc.filename as string);
    return NextResponse.json({ filename: doc.filename, ...result });
  } catch (e) {
    console.error('[approval-data] parse error:', e);
    return NextResponse.json({ error: 'File parse failed' }, { status: 500 });
  }
}
