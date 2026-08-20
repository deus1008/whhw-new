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

// 드릴다운 테이블용(회사→성분→품목→허가일)
export type DrilldownRow = {
  company: string;
  ingredient: string;
  product: string;
  approvalDate: string;
};

// 허가 1건(허가일자 기준 허가월 부여) — 클라이언트가 기간·전문일반으로 필터/집계.
export type ApprovalRow = {
  month: string;        // YYYY-MM (허가일자 기준)
  company: string;
  ingredient: string;
  product: string;
  approvalDate: string;
  approvalType: string; // 허가심사유형
  rxType: string;       // 전문일반
  cancelled: boolean;   // 취소일자 기재 여부
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

/* 제품명 괄호 안 텍스트 = 성분명. 뒤쪽 부가괄호(수출용·1회용 등)는 건너뛰고 실제 성분 괄호 사용. 없으면 ''. */
const NON_INGREDIENT = /^((수출|내수|국내|병원|조제|약국)용?|[1일]?회용|수출명.*|밀리그램|그램|mg|g)$/i;
function extractIngredient(product: string): string {
  if (!product) return '';
  const groups = product.match(/[(（]([^()（）]*)[)）]/g);
  if (!groups) return '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const inner = groups[i].replace(/^[(（]/, '').replace(/[)）]$/, '').trim();
    // 띄어쓰기 차이로 다른 성분 취급되지 않도록 내부 공백 제거로 정규화.
    if (inner && !NON_INGREDIENT.test(inner)) return inner.replace(/\s+/g, '');
  }
  return '';
}

/* ── 파일 → 행 추출 ── */
type RawRow = { company: string; product: string; ingredient: string; approvalDate: string; cancelDate: string; approvalType: string; rxType: string };

function parseRawRows(wb: XLSX.WorkBook): RawRow[] {
  const sheetNames = wb.SheetNames;
  let mainSheet = sheetNames[0] ?? '';
  for (const kw of ['허가', '공고', '품목', '데이터', '목록', '내역']) {
    const f = sheetNames.find(s => s.includes(kw));
    if (f) { mainSheet = f; break; }
  }
  const ws = wb.Sheets[mainSheet];
  const raw: SheetRow[] = ws ? XLSX.utils.sheet_to_json<SheetRow>(ws, { defval: null }) : [];
  if (raw.length === 0) return [];

  const headers = Object.keys(raw[0]);
  const productCol = findCol(headers, ['제품명', '품목명', '품명', '의약품명', '품목']);
  const companyCol = findCol(headers, ['업체명', '회사명', '제약사', '제조사', '허가업체']);
  const apprCol    = findCol(headers, ['허가일자', '허가일', '승인일', '허가연월일', '공고일']);
  const cancelCol  = findCol(headers, ['취소일자', '취소일', '취하일자', '취하일']);
  const typeCol    = findCol(headers, ['허가심사유형', '허가유형', '허가구분', '심사유형', '유형']);
  const rxCol      = findCol(headers, ['전문일반', '전문/일반', '전문의약품']);

  return raw.map(r => {
    const product = productCol ? str(r[productCol]) : '';
    return {
      company:      companyCol ? stripCompanyAffix(str(r[companyCol])) : '',
      product,
      ingredient:   extractIngredient(product),
      approvalDate: apprCol    ? formatDate(r[apprCol]) : '',
      cancelDate:   cancelCol  ? formatDate(r[cancelCol]) : '',
      approvalType: typeCol    ? (str(r[typeCol]) || '기타') : '기타',
      rxType:       rxCol      ? str(r[rxCol]) : '',
    };
  }).filter(r => r.company || r.product);
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

  const settled = await Promise.allSettled(ids.map(async (id): Promise<RawRow[]> => {
    const { data: doc, error: docErr } = await db
      .from('documents').select('storage_path, company_id, filename').eq('id', id).single();
    if (docErr || !doc) throw new Error(`Document ${id} not found`);
    if (companyId && doc.company_id && doc.company_id !== companyId) throw new Error(`Forbidden: ${id}`);
    const { data: fileData, error: dlErr } = await db.storage.from('documents').download(doc.storage_path as string);
    if (dlErr || !fileData) throw new Error(`Download failed: ${id}`);
    const wb = XLSX.read(new Uint8Array(await fileData.arrayBuffer()), { type: 'array' });
    return parseRawRows(wb);
  }));

  const failedCount = settled.filter(r => r.status === 'rejected').length;

  // 파일 간 중복 제거(제품·업체·허가일자). 취소 정보 있는 행 우선.
  const seen = new Map<string, RawRow>();
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const row of s.value) {
      const key = `${row.product}||${row.company}||${row.approvalDate}`;
      const ex = seen.get(key);
      if (!ex || (!ex.cancelDate && row.cancelDate)) seen.set(key, row);
    }
  }

  // 허가일자 → 허가월. 이력이 수십 년이므로 최근 N개월만.
  const MONTHS_WINDOW = 48;
  const monthSet = new Set<string>();
  const byRow: { row: RawRow; month: string }[] = [];
  let undated = 0;
  for (const row of seen.values()) {
    const m = MONTH_RE.test(row.approvalDate) ? row.approvalDate.slice(0, 7) : '';
    if (!m) { undated++; continue; }
    monthSet.add(m);
    byRow.push({ row, month: m });
  }
  const allMonths = [...monthSet].sort();
  const totalMonths = allMonths.length;
  const windowMonths = allMonths.slice(-MONTHS_WINDOW);
  const windowSet = new Set(windowMonths);

  const rxSet = new Set<string>();
  const rows: ApprovalRow[] = [];
  for (const { row, month } of byRow) {
    if (!windowSet.has(month)) continue;
    if (row.rxType) rxSet.add(row.rxType);
    rows.push({
      month, company: row.company, ingredient: row.ingredient, product: row.product,
      approvalDate: row.approvalDate, approvalType: row.approvalType || '기타',
      rxType: row.rxType, cancelled: !!row.cancelDate,
    });
  }

  return NextResponse.json({
    rows,
    months: windowMonths,
    rxTypes: [...rxSet].sort(),
    totalMonths, windowMonths: MONTHS_WINDOW,
    undated, failedCount,
  });
}
