import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export type PrescriptionRow = {
  sourceName: string;
  sido: string;
  gugun: string;
  type: string;
  doctorCount: string;
  csoName: string;
  duplicate: string;
  allowedCount: string;
  disallowedCount: string;
  unrecoverableCount: string;
  internalManager: string;
};

type Cell = string | number | boolean | null | undefined;

function cellStr(v: Cell): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return String(v);
  return String(v).trim();
}

/** raw 배열에서 후보 문자열 중 하나와 일치하는 열 인덱스를 반환 */
function findColIdx(headerRow: Cell[], candidates: string[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/\s/g, '');
  // 1순위: 정확 일치
  for (const c of candidates) {
    const cl = norm(c);
    const idx = headerRow.findIndex(h => norm(cellStr(h)) === cl);
    if (idx >= 0) return idx;
  }
  // 2순위: 헤더가 candidate를 포함
  for (const c of candidates) {
    const cl = norm(c);
    const idx = headerRow.findIndex(h => norm(cellStr(h)).includes(cl));
    if (idx >= 0) return idx;
  }
  // 3순위: candidate가 헤더를 포함 (헤더 3글자 이상)
  for (const c of candidates) {
    const cl = norm(c);
    const idx = headerRow.findIndex(h => {
      const hn = norm(cellStr(h));
      return hn.length >= 3 && cl.includes(hn);
    });
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseFile(wb: XLSX.WorkBook): PrescriptionRow[] {
  const sheetNames = wb.SheetNames;
  const mainPriority = ['처방처', '현황', '데이터', '전체', '목록', '내역'];
  let mainSheetName = sheetNames[0] ?? '';
  for (const kw of mainPriority) {
    const f = sheetNames.find(s => s.includes(kw));
    if (f) { mainSheetName = f; break; }
  }

  const ws = wb.Sheets[mainSheetName];
  if (!ws) return [];

  // raw 2D 배열로 읽기 (헤더 자동 처리 없음)
  const raw: Cell[][] = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: null });
  if (raw.length === 0) return [];

  /** 헤더 행 ri에서 colIdx 열의 실제 첫 유효 데이터값을 최대 5행 lookahead로 탐색 */
  function firstValid(ri: number, colIdx: number): string {
    for (let check = ri + 1; check < Math.min(ri + 6, raw.length); check++) {
      const v = cellStr(raw[check][colIdx]);
      if (v && !/^\d+$/.test(v)) return v;
    }
    return '';
  }

  const sourceNameCandidates = ['처방처명', '기관명', '병원명', '의원명'];
  let headerRowIdx = -1;
  let sourceColIdx = -1;

  for (let ri = 0; ri < Math.min(10, raw.length); ri++) {
    const colIdx = findColIdx(raw[ri], sourceNameCandidates);
    if (colIdx < 0) continue;
    if (!firstValid(ri, colIdx)) continue; // lookahead 5행 내에 유효값 없으면 skip
    headerRowIdx = ri;
    sourceColIdx = colIdx;
    break;
  }

  // sourceNameCandidates에서 못 찾은 경우 '처방처' 후보로 재시도
  if (headerRowIdx < 0) {
    const fallbackCandidates = ['처방처', '기관'];
    for (let ri = 0; ri < Math.min(10, raw.length); ri++) {
      const colIdx = findColIdx(raw[ri], fallbackCandidates);
      if (colIdx < 0) continue;
      if (!firstValid(ri, colIdx)) continue;
      headerRowIdx = ri;
      sourceColIdx = colIdx;
      break;
    }
  }

  if (headerRowIdx < 0 || sourceColIdx < 0) return [];

  const headerRow = raw[headerRowIdx];

  // 나머지 컬럼 인덱스 탐색
  const sidoIdx        = findColIdx(headerRow, ['시도', '광역시도', '시/도']);
  const gugunIdx       = findColIdx(headerRow, ['구군', '시군구', '구/군', '군구']);
  const typeIdx        = findColIdx(headerRow, ['종별', '기관종별', '의료기관종별', '종류']);
  const doctorIdx      = findColIdx(headerRow, ['의사수', '의사인원', '의사']);
  const csoIdx         = findColIdx(headerRow, ['CSO명', 'CSO사명', 'CSO']);
  const dupIdx         = findColIdx(headerRow, ['중복처', '중복']);
  const allowIdx       = findColIdx(headerRow, ['허용품목수', '허용품목', '허용수']);
  const disallowIdx    = findColIdx(headerRow, ['불가품목수', '불가품목', '불가수']);
  const unrecoverIdx   = findColIdx(headerRow, ['회수불가품목수', '회수불가품목', '회수불가']);
  const managerIdx     = findColIdx(headerRow, ['내부담당자', '담당자', '담당MR', '담당자명', '내부담당']);

  const dataRows = raw.slice(headerRowIdx + 1);

  return dataRows
    .map(row => ({
      sourceName:         cellStr(row[sourceColIdx]),
      sido:               sidoIdx      >= 0 ? cellStr(row[sidoIdx])      : '',
      gugun:              gugunIdx     >= 0 ? cellStr(row[gugunIdx])     : '',
      type:               typeIdx      >= 0 ? cellStr(row[typeIdx])      : '',
      doctorCount:        doctorIdx    >= 0 ? cellStr(row[doctorIdx])    : '',
      csoName:            csoIdx       >= 0 ? cellStr(row[csoIdx])       : '',
      duplicate:          dupIdx       >= 0 ? cellStr(row[dupIdx])       : '',
      allowedCount:       allowIdx     >= 0 ? cellStr(row[allowIdx])     : '',
      disallowedCount:    disallowIdx  >= 0 ? cellStr(row[disallowIdx])  : '',
      unrecoverableCount: unrecoverIdx >= 0 ? cellStr(row[unrecoverIdx]) : '',
      internalManager:    managerIdx   >= 0 ? cellStr(row[managerIdx])   : '',
    }))
    .filter(r => r.sourceName && !/^\d+$/.test(r.sourceName));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const idsParam = request.nextUrl.searchParams.get('ids');
  if (!idsParam) return NextResponse.json({ error: 'Missing ids' }, { status: 400 });

  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
  const isAdmin   = profileIsAdmin(profile);
  const companyId = await getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const settled = await Promise.allSettled(ids.map(async (id) => {
    const { data: doc, error: docErr } = await db
      .from('documents').select('storage_path, company_id, filename').eq('id', id).single();
    if (docErr || !doc) throw new Error(`Document ${id} not found`);
    if (companyId && doc.company_id && doc.company_id !== companyId)
      throw new Error(`Forbidden: ${id}`);

    const { data: fileData, error: dlErr } = await db.storage
      .from('documents').download(doc.storage_path as string);
    if (dlErr || !fileData) throw new Error(`Download failed: ${id}`);

    const uint8Array = new Uint8Array(await fileData.arrayBuffer());
    const wb = XLSX.read(uint8Array, { type: 'array' });
    return parseFile(wb);
  }));

  const rowMap = new Map<string, PrescriptionRow>();
  const results = settled
    .filter((r): r is PromiseFulfilledResult<PrescriptionRow[]> => r.status === 'fulfilled')
    .map(r => r.value);

  for (const fileRows of results.reverse()) {
    for (const row of fileRows) {
      rowMap.set(row.sourceName, row);
    }
  }

  const rows = Array.from(rowMap.values())
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName, 'ko'));

  const failedCount = settled.filter(r => r.status === 'rejected').length;
  return NextResponse.json({ rows, failedCount });
}
