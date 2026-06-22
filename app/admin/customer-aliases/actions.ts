'use server';

import { createClient as createSvc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';

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

/* ── 미매핑 거래처명 목록 ── */
export type UnmappedRow = { name: string; visit_count: number; last_visit: string };

export async function getUnmappedNames(): Promise<UnmappedRow[]> {
  const db = svc();

  // visit_records 전체 거래처명
  const { data: visits } = await db
    .from('visit_records')
    .select('customer_name, visited_at');

  // customer_status 정규명 (소문자 set)
  const { data: customers } = await db
    .from('customer_status')
    .select('customer_name');

  // customer_aliases alias_norm set
  const { data: aliases } = await db
    .from('customer_aliases')
    .select('alias_norm');

  const canonicalSet = new Set(
    (customers ?? []).map(c => c.customer_name.toLowerCase().trim()),
  );
  const aliasSet = new Set((aliases ?? []).map(a => a.alias_norm));

  // 방문기록 거래처명을 집계
  const counts: Record<string, { count: number; last: string }> = {};
  for (const v of visits ?? []) {
    const norm = v.customer_name.toLowerCase().trim();
    if (canonicalSet.has(norm) || aliasSet.has(norm)) continue; // 이미 매핑됨
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

export async function getAliases(): Promise<AliasRow[]> {
  const db = svc();
  const { data: aliases } = await db
    .from('customer_aliases')
    .select('id, alias, alias_norm, customer_id, note, created_at')
    .order('alias');

  if (!aliases || aliases.length === 0) return [];

  const customerIds = [...new Set(aliases.map(a => a.customer_id))];
  const { data: customers } = await db
    .from('customer_status')
    .select('id, customer_name, customer_type, region')
    .in('id', customerIds);

  const customerMap = Object.fromEntries(
    (customers ?? []).map(c => [c.id, c]),
  );

  return aliases.map(a => {
    const c = customerMap[a.customer_id] ?? {};
    return {
      id:             a.id,
      alias:          a.alias,
      alias_norm:     a.alias_norm,
      customer_id:    a.customer_id,
      canonical_name: (c as { customer_name?: string }).customer_name ?? '(삭제됨)',
      customer_type:  (c as { customer_type?: string }).customer_type ?? null,
      region:         (c as { region?: string }).region ?? null,
      note:           a.note,
      created_at:     a.created_at,
    };
  });
}

/* ── customer_status 전체 목록 (드롭다운용) ── */
export type CustomerOption = {
  id: string;
  customer_name: string;
  customer_type: string | null;
  region: string | null;
};

export async function getCustomerOptions(): Promise<CustomerOption[]> {
  const { data } = await svc()
    .from('customer_status')
    .select('id, customer_name, customer_type, region')
    .order('customer_name');
  return (data ?? []) as CustomerOption[];
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
