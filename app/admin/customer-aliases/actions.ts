'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import XLSX from 'xlsx';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '인증이 필요합니다.' };
  const { data: p } = await supabase.from('profiles').select('role,status').eq('id', user.id).single();
  if (!p || p.status !== 'approved') return { error: '접근 권한 없음' };
  if (normalizeRole(p.role) !== '관리자') return { error: '관리자만 접근 가능합니다.' };
  return { user };
}

/* ── 거래처현황 Excel 파싱 (모듈 레벨 캐시) ── */
const LEVEL_COL: Record<string, number> = {
  '1차': 2, '2차': 3, '3차': 4, '4차': 5,
  '5차': 6, '6차': 7, '7차': 8, '8차': 9, '9차': 10,
};

export type CustomerOption = {
  id: string;            // 업체명 (= canonical name)
  customer_name: string;
  customer_type: string | null; // 개인/법인
  region: string | null;
};

let _excelCache: { key: string; options: CustomerOption[] } | null = null;

async function fetchExcelCustomers(): Promise<CustomerOption[]> {
  const db = svc();
  const { data: docs } = await db
    .from('documents')
    .select('id, storage_path, created_at')
    .eq('category', '거래처현황')
    .order('created_at', { ascending: false })
    .limit(1);

  const doc = (docs ?? [])[0] as Record<string, string> | undefined;
  if (!doc) return [];

  if (_excelCache?.key === doc.storage_path) return _excelCache.options;

  const { data: blob } = await db.storage.from('documents').download(doc.storage_path);
  if (!blob) return [];

  const buf = Buffer.from(await blob.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  const seen = new Set<string>();
  const options: CustomerOption[] = [];

  for (let i = 1; i < all.length; i++) {
    const r = all[i] as unknown[];
    if (!r[0]) continue;
    const level = String(r[11] ?? '').trim();
    const nameIdx = LEVEL_COL[level] ?? 2;
    const name = String(r[nameIdx] ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    options.push({
      id: name,
      customer_name: name,
      customer_type: String(r[12] ?? '').trim() || null,
      region: null,
    });
  }

  options.sort((a, b) => a.customer_name.localeCompare(b.customer_name, 'ko'));
  _excelCache = { key: doc.storage_path, options };
  return options;
}

/* ── 미매핑 거래처명 목록 ── */
export type UnmappedRow = { name: string; visit_count: number; last_visit: string };

export async function getUnmappedNames(): Promise<UnmappedRow[]> {
  const db = svc();

  const [{ data: visits }, excelCustomers, { data: aliasData }] = await Promise.all([
    db.from('visit_records').select('customer_name, visited_at'),
    fetchExcelCustomers(),
    db.from('customer_aliases').select('alias_norm'),
  ]);

  const canonicalSet = new Set(
    excelCustomers.map(c => c.customer_name.toLowerCase().trim()),
  );
  const aliasSet = new Set((aliasData ?? []).map((a: { alias_norm: string }) => a.alias_norm));

  const counts: Record<string, { count: number; last: string }> = {};
  for (const v of visits ?? []) {
    const norm = v.customer_name.toLowerCase().trim();
    if (canonicalSet.has(norm) || aliasSet.has(norm)) continue;
    if (!counts[v.customer_name]) counts[v.customer_name] = { count: 0, last: v.visited_at };
    counts[v.customer_name].count += 1;
    if (v.visited_at > counts[v.customer_name].last) counts[v.customer_name].last = v.visited_at;
  }

  return Object.entries(counts)
    .map(([name, { count, last }]) => ({ name, visit_count: count, last_visit: last }))
    .sort((a, b) => b.visit_count - a.visit_count);
}

/* ── 전체 매핑 현황 ── */
export type AliasRow = {
  id: number;
  alias: string;
  alias_norm: string;
  customer_id: string;
  canonical_name: string;
  customer_type: string | null;
  region: string | null;
  note: string | null;
  created_at: string;
};

// customer_id가 UUID이면 이전 데이터 (customer_status 참조)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAliases(): Promise<AliasRow[]> {
  const db = svc();
  const { data: aliases } = await db
    .from('customer_aliases')
    .select('id, alias, alias_norm, customer_id, note, created_at')
    .order('alias');

  if (!aliases || aliases.length === 0) return [];

  // 하위 호환: 이전 UUID 형식 항목은 customer_status에서 이름 조회
  const uuidIds = aliases
    .filter((a: { customer_id: string }) => UUID_RE.test(a.customer_id))
    .map((a: { customer_id: string }) => a.customer_id);

  let oldMap: Record<string, { customer_name: string; customer_type: string | null; region: string | null }> = {};
  if (uuidIds.length > 0) {
    const { data: old } = await db
      .from('customer_status')
      .select('id, customer_name, customer_type, region')
      .in('id', uuidIds);
    oldMap = Object.fromEntries(
      (old ?? []).map((c: { id: string; customer_name: string; customer_type: string | null; region: string | null }) => [c.id, c]),
    );
  }

  // 신규 텍스트 형식 항목: Excel에서 bizType 조회
  const excelCustomers = await fetchExcelCustomers();
  const excelMap = Object.fromEntries(excelCustomers.map(c => [c.customer_name, c]));

  return (aliases as { id: number; alias: string; alias_norm: string; customer_id: string; note: string | null; created_at: string }[]).map(a => {
    if (UUID_RE.test(a.customer_id)) {
      const old = oldMap[a.customer_id];
      return {
        id:             a.id,
        alias:          a.alias,
        alias_norm:     a.alias_norm,
        customer_id:    a.customer_id,
        canonical_name: old?.customer_name ?? '(구 매핑)',
        customer_type:  old?.customer_type ?? null,
        region:         old?.region ?? null,
        note:           a.note,
        created_at:     a.created_at,
      };
    } else {
      const excel = excelMap[a.customer_id];
      return {
        id:             a.id,
        alias:          a.alias,
        alias_norm:     a.alias_norm,
        customer_id:    a.customer_id,
        canonical_name: a.customer_id,
        customer_type:  excel?.customer_type ?? null,
        region:         null,
        note:           a.note,
        created_at:     a.created_at,
      };
    }
  });
}

/* ── 거래처 목록 (드롭다운용) ── */
export async function getCustomerOptions(): Promise<CustomerOption[]> {
  return fetchExcelCustomers();
}

/* ── 매핑 생성 ── */
export async function createAlias(
  alias: string,
  customer_id: string,
  note: string,
): Promise<{ error?: string }> {
  const auth = await assertAdmin();
  if (auth.error) return { error: auth.error };

  const alias_norm = alias.toLowerCase().trim();
  const { error } = await svc()
    .from('customer_aliases')
    .insert({ alias: alias.trim(), alias_norm, customer_id, note: note.trim() || null, created_by: auth.user!.id });

  if (error) {
    if (error.code === '23505') return { error: `"${alias.trim()}" 별칭이 이미 존재합니다.` };
    return { error: error.message };
  }
  return {};
}

/* ── 매핑 삭제 ── */
export async function deleteAlias(id: number): Promise<{ error?: string }> {
  const auth = await assertAdmin();
  if (auth.error) return { error: auth.error };

  const { error } = await svc().from('customer_aliases').delete().eq('id', id);
  if (error) return { error: error.message };
  return {};
}
