'use server';

import { createClient } from '@/lib/supabase/server';
import type { VisitRecord } from './page';

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

  return { supabase, user, role: profile.role as string };
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
  if (auth.role !== 'admin') {
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
  return { data: data as VisitRecord };
}

/* ── 삭제 ─────────────────────────────────────────────────── */
export async function deleteVisitRecord(id: string): Promise<Result<void>> {
  const auth = await getAuthorized();
  if (auth.error || !auth.supabase) return { error: auth.error };

  if (auth.role !== 'admin') {
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
