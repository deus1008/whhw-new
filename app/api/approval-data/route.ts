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

/* 제품명 괄호 안 텍스트 = 성분명.
   - 부가/형태 괄호(수출용·1회용·미분화 등)를 반복 제거해 중첩 괄호 안의 실제 성분을 노출.
   - 남은 괄호 중 실제 성분을 취해 공백 정규화. 없으면 ''. */
const NON_INGREDIENT = /^((수출|내수|국내|병원|조제|약국)용?|[1일]?회용|수출명.*|미분화|나노화|밀리그램|그램|mg|g)$/i;
function extractIngredient(product: string): string {
  if (!product) return '';
  let s = product, prev = '';
  do {
    prev = s;
    s = s.replace(/[(（]([^()（）]*)[)）]/g, (m, inner) => NON_INGREDIENT.test(String(inner).trim()) ? '' : m);
  } while (s !== prev);
  const groups = s.match(/[(（]([^()（）]*)[)）]/g);
  if (!groups) return '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const inner = groups[i].replace(/^[(（]/, '').replace(/[)）]$/, '').trim();
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

/* drug_prices(약가표)에서 한글 성분 사전 구축 — item_name 괄호(한글 성분) + 한글 ingredient_name.
   프로세스 수명 동안 캐시(약가표는 자주 안 바뀜). */
let _dpDict: string[] | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function drugPriceIngredients(db: any): Promise<string[]> {
  if (_dpDict) return _dpDict;
  const set = new Set<string>();
  let from = 0; const P = 1000;
  while (true) {
    const { data } = await db.from('drug_prices').select('item_name, ingredient_name').range(from, from + P - 1);
    if (!data?.length) break;
    for (const r of data as { item_name: string | null; ingredient_name: string | null }[]) {
      // item_name 뒤 용량 괄호 "_(40mg/1정)" 제거 후 한글 성분 괄호 추출
      const nm = String(r.item_name ?? '').replace(/_\s*[(（][^()（）]*[)）]\s*$/, '');
      const paren = extractIngredient(nm);
      if (paren && /[가-힣]/.test(paren)) set.add(paren);
      const ing = String(r.ingredient_name ?? '');
      if (/[가-힣]/.test(ing)) {
        for (const part of ing.split(/[,/、]/)) {
          const p = part.trim().replace(/\s+/g, '');
          if (p.length >= 4 && /[가-힣]/.test(p) && !/\d/.test(p)) set.add(p);
        }
      }
    }
    if (data.length < P) break; from += P;
  }
  _dpDict = [...set];
  return _dpDict;
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

  // 무괄호 성분 보완: 괄호에서 얻은 성분 사전으로 제품명 부분매칭(실제 성분만 채움, 브랜드 오매칭 방지).
  //   제품명은 기본 성분명(암로디핀)을, 사전은 염 형태(암로디핀베실산염)를 담는 경우가 있어
  //   염·수화물을 뗀 기본형도 사전에 추가.
  const SALT = /(염산염|브롬화수소산염|황산염|질산염|인산염|말레산염|푸마르산염|타르타르산염|시트르산염|구연산염|숙신산염|베실산염|캄실산염|메실산염|토실산염|에실산염|아세트산염|아스파르트산염|글루콘산염|락트산염|살리실산염|프로피오네이트|칼슘|나트륨|칼륨|마그네슘|삼수화물|이수화물|일수화물|무수물|수화물)/g;
  const dictSet = new Set<string>();
  const addWithBase = (ing: string) => {
    if (ing.length >= 4) dictSet.add(ing);
    const base = ing.replace(SALT, '').trim();
    if (base.length >= 4 && base !== ing) dictSet.add(base);
  };
  for (const ing of new Set([...seen.values()].map(r => r.ingredient).filter(x => x && !x.includes(',')))) addWithBase(ing);
  // drug_prices(약가표) 성분 병합 → 무괄호 매칭 커버리지 확대
  try { for (const ing of await drugPriceIngredients(db)) addWithBase(ing); } catch { /* 약가표 조회 실패 시 무시 */ }
  const dict = [...dictSet].sort((a, b) => b.length - a.length);
  for (const r of seen.values()) {
    if (r.ingredient) continue;
    const np = r.product.replace(/\s+/g, '');
    // 제품명에 등장하는 사전 성분들을 모두(비겹침) 찾아 결합(복합제 대응).
    const hits: { start: number; len: number; name: string }[] = [];
    for (const d of dict) {
      let idx = np.indexOf(d);
      while (idx >= 0) { hits.push({ start: idx, len: d.length, name: d }); idx = np.indexOf(d, idx + 1); }
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a.start - b.start || b.len - a.len);
    const picked: string[] = [];
    let cover = -1;
    for (const h of hits) if (h.start >= cover) { picked.push(h.name); cover = h.start + h.len; }
    if (picked.length) r.ingredient = picked.join(',');
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
