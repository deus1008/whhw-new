'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UpcomingProduct, DateEntry } from './page';

export type ProductInput = {
  ingredient:     string;
  product_name:   string;
  approval_dates: DateEntry[];
  launch_dates:   DateEntry[];
  product_type:   string;
  contractor:     string;
  indication:     string;
  expected_price: string;
  status:         string;
  memo:           string;
  is_priority:    boolean;
};

type Result<T = void> = { data?: T; error?: string };

async function getApproved() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: '인증이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('role, status').eq('id', user.id).single();

  if (!profile || profile.status !== 'approved')
    return { error: '승인된 계정이 아닙니다.' };

  return { supabase, user, role: profile.role as string };
}

async function getAdmin() {
  const auth = await getApproved();
  if (auth.error || !auth.supabase) return auth;
  if (auth.role !== 'admin') return { error: '관리자만 삭제할 수 있습니다.' };
  return auth;
}

function clean(input: ProductInput) {
  return {
    ingredient:     input.ingredient.trim(),
    product_name:   input.product_name.trim()   || null,
    approval_dates: input.approval_dates.filter(d => d.date),
    launch_dates:   input.launch_dates.filter(d => d.date),
    product_type:   input.product_type || '자사',
    contractor:     input.product_type === '위탁' ? (input.contractor.trim() || null) : null,
    indication:     input.indication.trim()     || null,
    expected_price: input.expected_price.trim() || null,
    status:         input.status                || null,
    memo:           input.memo.trim()           || null,
    is_priority:    input.is_priority,
  };
}

/* ── 생성 (승인된 멤버) ─────────────────────────────────────── */
export async function createProduct(input: ProductInput): Promise<Result<UpcomingProduct>> {
  const auth = await getApproved();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.ingredient.trim()) return { error: '성분명을 입력하세요.' };

  const { data, error } = await auth.supabase
    .from('upcoming_products')
    .insert({ ...clean(input), user_id: auth.user!.id })
    .select().single();

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/products');
  return { data: data as UpcomingProduct };
}

/* ── 수정 (승인된 멤버) ─────────────────────────────────────── */
export async function updateProduct(id: string, input: ProductInput): Promise<Result<UpcomingProduct>> {
  const auth = await getApproved();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.ingredient.trim()) return { error: '성분명을 입력하세요.' };

  const { data, error } = await auth.supabase
    .from('upcoming_products')
    .update(clean(input))
    .eq('id', id)
    .select().single();

  if (error) return { error: `수정 실패: ${error.message}` };
  revalidatePath('/products');
  return { data: data as UpcomingProduct };
}

/* ── 삭제 (관리자 전용) ─────────────────────────────────────── */
export async function deleteProduct(id: string): Promise<Result> {
  const auth = await getAdmin();
  if (auth.error || !auth.supabase) return { error: auth.error };

  const { error } = await auth.supabase
    .from('upcoming_products').delete().eq('id', id);

  if (error) return { error: `삭제 실패: ${error.message}` };
  revalidatePath('/products');
  return {};
}
