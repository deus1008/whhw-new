'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import type { VisitRecord } from './page';

function svc() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type RecordInput = {
  visited_at:    string;
  customer_name: string;
  customer_type: string;
  contact_name:  string;
  purpose:       string;
  products:      string;
  content:       string;
  next_action:   string;
  follow_up_date: string;
};

type Result<T> = { data?: T; error?: string };

async function getAuthorized() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: '인증이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') {
    return { error: '승인된 계정이 아닙니다.' };
  }

  const role = normalizeRole(profile.role);
  const isAdmin = role === '관리자' || role === '사업총괄' || role === '영업관리총괄';
  return { supabase, user, role: isAdmin ? '관리자' : role };
}

function cleanInput(input: RecordInput) {
  return {
    visited_at:    input.visited_at,
    customer_name: input.customer_name.trim(),
    customer_type: input.customer_type,
    contact_name:  input.contact_name.trim()  || null,
    purpose:       input.purpose.trim()       || null,
    products:      input.products.trim()      || null,
    content:       input.content.trim(),
    next_action:   input.next_action.trim()   || null,
    follow_up_date: input.follow_up_date      || null,
  };
}

/** 제품명 텍스트를 파싱해 visit_products 행 배열로 변환 */
function parseProductNames(productsText: string | null | undefined): string[] {
  if (!productsText?.trim()) return [];
  return productsText
    .split(/[,，、\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/** 영업방문 → 주요일정(marketing_schedules) 자동 동기화 */
async function syncVisitSchedules(
  visitId: string,
  userId: string,
  input: RecordInput,
): Promise<void> {
  const db = svc();

  // 담당자명 조회
  const { data: profile } = await db.from('profiles').select('name').eq('id', userId).single();
  const assignee: string | null = (profile as { name?: string } | null)?.name ?? null;

  // 기존 연동 일정 전부 삭제 (재방문 포함)
  await db.from('marketing_schedules').delete().eq('visit_record_id', visitId);

  const entries: Record<string, unknown>[] = [];

  // 방문일 일정
  entries.push({
    user_id:         userId,
    title:           `${input.customer_name} 영업미팅`,
    start_date:      input.visited_at,
    category:        '영업미팅',
    memo:            [input.purpose, input.content].filter(Boolean).join('\n') || null,
    assignee,
    visit_record_id: visitId,
  });

  // 재방문일 일정
  if (input.follow_up_date) {
    entries.push({
      user_id:         userId,
      title:           `${input.customer_name} 재방문`,
      start_date:      input.follow_up_date,
      category:        '영업미팅',
      memo:            input.next_action || null,
      assignee,
      visit_record_id: visitId,
    });
  }

  const { error } = await db.from('marketing_schedules').insert(entries);
  if (error) console.error('[syncVisitSchedules]', error.message);
}

/** visit_products 테이블에 제품 목록을 동기화 (기존 삭제 후 재삽입) */
async function syncVisitProducts(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  visitId: string,
  productsText: string | null | undefined,
): Promise<void> {
  try {
    await supabase.from('visit_products').delete().eq('visit_id', visitId);
    const names = parseProductNames(productsText);
    if (names.length === 0) return;
    await supabase.from('visit_products').insert(
      names.map((product_name, i) => ({ visit_id: visitId, product_name, sort_order: i })),
    );
  } catch (e) {
    // visit_products 테이블 미존재 시 무시 (마이그레이션 전 상태)
    console.warn('[syncVisitProducts] 스킵:', e instanceof Error ? e.message : e);
  }
}

/* ── 생성 ─────────────────────────────────────────────────── */
export async function createVisitRecord(input: RecordInput): Promise<Result<VisitRecord>> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  if (!input.visited_at)    return { error: '방문일을 입력하세요.' };
  if (!input.customer_name) return { error: '거래처명을 입력하세요.' };
  if (!input.content)       return { error: '협의 내용을 입력하세요.' };

  const { data, error } = await auth.supabase
    .from('visit_records')
    .insert({ ...cleanInput(input), user_id: auth.user!.id })
    .select()
    .single();

  if (error) return { error: `저장 실패: ${error.message}` };
  await syncVisitProducts(auth.supabase, data.id, input.products);
  await syncVisitSchedules(data.id, auth.user!.id, input);
  return { data: data as VisitRecord };
}

/* ── 수정 ─────────────────────────────────────────────────── */
export async function updateVisitRecord(id: string, input: RecordInput): Promise<Result<VisitRecord>> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  if (!input.visited_at)    return { error: '방문일을 입력하세요.' };
  if (!input.customer_name) return { error: '거래처명을 입력하세요.' };
  if (!input.content)       return { error: '협의 내용을 입력하세요.' };

  // 본인 레코드인지 확인 (admin이 아닌 경우)
  if (auth.role !== '관리자') {
    const { data: existing } = await auth.supabase
      .from('visit_records').select('user_id').eq('id', id).single();
    if (!existing || existing.user_id !== auth.user!.id) {
      return { error: '수정 권한이 없습니다.' };
    }
  }

  const { data, error } = await auth.supabase
    .from('visit_records')
    .update(cleanInput(input))
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: `수정 실패: ${error.message}` };
  await syncVisitProducts(auth.supabase, id, input.products);
  await syncVisitSchedules(id, (data as VisitRecord).user_id, input);
  return { data: data as VisitRecord };
}

/* ── 삭제 ─────────────────────────────────────────────────── */
export async function deleteVisitRecord(id: string): Promise<Result<void>> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  if (auth.role !== '관리자') {
    const { data: existing } = await auth.supabase
      .from('visit_records').select('user_id').eq('id', id).single();
    if (!existing || existing.user_id !== auth.user!.id) {
      return { error: '삭제 권한이 없습니다.' };
    }
  }

  const { error } = await auth.supabase
    .from('visit_records')
    .delete()
    .eq('id', id);

  if (error) return { error: `삭제 실패: ${error.message}` };
  return {};
}
