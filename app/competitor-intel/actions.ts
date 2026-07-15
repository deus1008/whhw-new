'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

function svc() {
  return createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' as const };
  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status, full_name').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return { error: '승인된 사용자만 이용할 수 있습니다.' as const };
  const name = (profile.full_name as string) || '';
  return { user, profile, isAdmin: profileIsAdmin(profile), name };
}

export type TrendInput = {
  id?: string;
  company_name: string;
  trend_type: string;
  title: string;
  summary?: string;
  content?: string;
  source_name?: string;
  url?: string;
  event_date?: string | null;
  is_field?: boolean;
  supplement?: string;
};

/** 동향 항목 추가/수정 — 승인된 전 사용자 */
export async function saveTrend(input: TrendInput): Promise<{ error?: string; id?: string }> {
  const auth = await requireUser();
  if ('error' in auth) return { error: auth.error };
  if (!input.company_name?.trim() || !input.title?.trim()) return { error: '회사명과 제목은 필수입니다.' };

  const s = svc();
  const row = {
    company_name: input.company_name.trim(),
    trend_type:   input.trend_type || '기타',
    title:        input.title.trim(),
    summary:      input.summary?.trim() || null,
    content:      input.content?.trim() || null,
    source_name:  input.is_field ? '현장청취' : (input.source_name?.trim() || null),
    url:          input.url?.trim() || null,
    event_date:   input.event_date || null,
    is_field:     !!input.is_field,
    supplement:   input.supplement?.trim() || null,
    updated_at:   new Date().toISOString(),
  };

  if (input.id) {
    // 작성자 또는 관리자만 수정
    const { data: existing } = await s.from('competitor_trends').select('author_id').eq('id', input.id).single();
    if (existing && existing.author_id !== auth.user.id && !auth.isAdmin) return { error: '작성자 또는 관리자만 수정할 수 있습니다.' };
    const { error } = await s.from('competitor_trends').update(row).eq('id', input.id);
    if (error) return { error: error.message };
    revalidatePath('/competitor-intel');
    return { id: input.id };
  }

  const { data, error } = await s.from('competitor_trends')
    .insert({ ...row, author_id: auth.user.id, author_name: auth.name || null })
    .select('id').single();
  if (error) return { error: error.message };
  revalidatePath('/competitor-intel');
  return { id: data?.id as string };
}

/** 동향 삭제 — 작성자 또는 관리자 */
export async function deleteTrend(id: string): Promise<{ error?: string }> {
  const auth = await requireUser();
  if ('error' in auth) return { error: auth.error };
  const s = svc();
  const { data: existing } = await s.from('competitor_trends').select('author_id').eq('id', id).single();
  if (existing && existing.author_id !== auth.user.id && !auth.isAdmin) return { error: '작성자 또는 관리자만 삭제할 수 있습니다.' };
  const { error } = await s.from('competitor_trends').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/competitor-intel');
  return {};
}

/** 대상 경쟁사 추가 — 관리자 */
export async function addCompany(name: string): Promise<{ error?: string }> {
  const auth = await requireUser();
  if ('error' in auth) return { error: auth.error };
  if (!auth.isAdmin) return { error: '관리자만 회사를 추가할 수 있습니다.' };
  if (!name.trim()) return { error: '회사명을 입력하세요.' };
  const s = svc();
  const { data: max } = await s.from('competitor_companies').select('display_order').order('display_order', { ascending: false }).limit(1).maybeSingle();
  const { error } = await s.from('competitor_companies').insert({ name: name.trim(), display_order: ((max?.display_order as number) ?? 0) + 1 });
  if (error) return { error: error.message };
  revalidatePath('/competitor-intel');
  return {};
}

/** 대상 경쟁사 삭제(비활성) — 관리자 */
export async function removeCompany(id: string): Promise<{ error?: string }> {
  const auth = await requireUser();
  if ('error' in auth) return { error: auth.error };
  if (!auth.isAdmin) return { error: '관리자만 회사를 삭제할 수 있습니다.' };
  const { error } = await svc().from('competitor_companies').update({ active: false }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/competitor-intel');
  return {};
}

/** 삭제된 대상 업체 복원 — 관리자 */
export async function restoreCompany(id: string): Promise<{ error?: string }> {
  const auth = await requireUser();
  if ('error' in auth) return { error: auth.error };
  if (!auth.isAdmin) return { error: '관리자만 복원할 수 있습니다.' };
  const { error } = await svc().from('competitor_companies').update({ active: true }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/competitor-intel');
  return {};
}

/** 매체 추가 — 관리자 */
export async function addSource(name: string, baseUrl: string): Promise<{ error?: string }> {
  const auth = await requireUser();
  if ('error' in auth) return { error: auth.error };
  if (!auth.isAdmin) return { error: '관리자만 매체를 추가할 수 있습니다.' };
  if (!name.trim()) return { error: '매체명을 입력하세요.' };
  const s = svc();
  const { data: max } = await s.from('media_sources').select('display_order').order('display_order', { ascending: false }).limit(1).maybeSingle();
  const { error } = await s.from('media_sources').insert({ name: name.trim(), base_url: baseUrl.trim() || null, display_order: ((max?.display_order as number) ?? 0) + 1 });
  if (error) return { error: error.message };
  revalidatePath('/competitor-intel');
  return {};
}

/** 매체 삭제(비활성) — 관리자 */
export async function removeSource(id: string): Promise<{ error?: string }> {
  const auth = await requireUser();
  if ('error' in auth) return { error: auth.error };
  if (!auth.isAdmin) return { error: '관리자만 매체를 삭제할 수 있습니다.' };
  const { error } = await svc().from('media_sources').update({ active: false }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/competitor-intel');
  return {};
}

/** 지금 뉴스 수집 (자동수집 수동 트리거) — 관리자 */
export async function crawlNow(): Promise<{ error?: string; message?: string }> {
  const auth = await requireUser();
  if ('error' in auth) return { error: auth.error };
  if (!auth.isAdmin) return { error: '관리자만 수집을 실행할 수 있습니다.' };
  const { runCrawl } = await import('@/lib/competitor/sync');
  try {
    const r = await runCrawl(svc());
    revalidatePath('/competitor-intel');
    return { message: `수집 완료 — ${r.sources.join('·')} × ${r.companies}개사, 신규 ${r.inserted}건(총 ${r.found}건 확인)` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
