'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UpcomingProduct } from './page';

export type ProductInput = {
  year_label:    string;
  launch_timing: string;
  product_name:  string;
  category:      string;
  ingredient:    string;
  is_priority:   boolean;
  memo:          string;
};

type Result<T = void> = { data?: T; error?: string };

/* ── 공통: 승인된 멤버 인증 ─────────────────────────────────── */
async function getApproved() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: '인증이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved')
    return { error: '승인된 계정이 아닙니다.' };

  return { supabase, user, role: profile.role as string };
}

/* ── 공통: 관리자 인증 ─────────────────────────────────────── */
async function getAdmin() {
  const auth = await getApproved();
  if (auth.error || !auth.supabase) return auth;
  if (auth.role !== 'admin') return { error: '관리자만 삭제할 수 있습니다.' };
  return auth;
}

function clean(input: ProductInput) {
  return {
    year_label:    input.year_label.trim(),
    launch_timing: input.launch_timing.trim(),
    product_name:  input.product_name.trim(),
    category:      input.category.trim()   || null,
    ingredient:    input.ingredient.trim() || null,
    is_priority:   input.is_priority,
    memo:          input.memo.trim()       || null,
  };
}

/* ── 생성 (승인된 멤버) ─────────────────────────────────────── */
export async function createProduct(
  input: ProductInput,
): Promise<Result<UpcomingProduct>> {
  const auth = await getApproved();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.product_name)  return { error: '제품명을 입력하세요.' };
  if (!input.year_label)    return { error: '연도를 입력하세요.' };
  if (!input.launch_timing) return { error: '발매예정 시기를 입력하세요.' };

  const { data, error } = await auth.supabase
    .from('upcoming_products')
    .insert({ ...clean(input), user_id: auth.user!.id })
    .select()
    .single();

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/products');
  return { data: data as UpcomingProduct };
}

/* ── 수정 (승인된 멤버) ─────────────────────────────────────── */
export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<Result<UpcomingProduct>> {
  const auth = await getApproved();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.product_name)  return { error: '제품명을 입력하세요.' };
  if (!input.year_label)    return { error: '연도를 입력하세요.' };
  if (!input.launch_timing) return { error: '발매예정 시기를 입력하세요.' };

  const { data, error } = await auth.supabase
    .from('upcoming_products')
    .update(clean(input))
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: `수정 실패: ${error.message}` };
  revalidatePath('/products');
  return { data: data as UpcomingProduct };
}

/* ── 삭제 (관리자 전용) ─────────────────────────────────────── */
export async function deleteProduct(id: string): Promise<Result> {
  const auth = await getAdmin();
  if (auth.error || !auth.supabase) return { error: auth.error };

  const { error } = await auth.supabase
    .from('upcoming_products')
    .delete()
    .eq('id', id);

  if (error) return { error: `삭제 실패: ${error.message}` };
  revalidatePath('/products');
  return {};
}
