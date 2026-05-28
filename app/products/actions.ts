'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UpcomingProduct } from './page';

export type ProductInput = {
  title:           string;
  launch_date:     string;
  manufacturer:    string;
  indication:      string;
  insurance_price: string;
  insurance_code:  string;
  status:          string;
  memo:            string;
};

type Result<T = void> = { data?: T; error?: string };

async function getAdmin() {
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

  if (profile.role !== 'admin')
    return { error: '관리자만 수정할 수 있습니다.' };

  return { supabase, user };
}

function clean(input: ProductInput) {
  return {
    title:           input.title.trim(),
    launch_date:     input.launch_date     || null,
    manufacturer:    input.manufacturer.trim()    || null,
    indication:      input.indication.trim()      || null,
    insurance_price: input.insurance_price.trim() || null,
    insurance_code:  input.insurance_code.trim()  || null,
    status:          input.status.trim()          || null,
    memo:            input.memo.trim()            || null,
  };
}

/* ── 생성 ─────────────────────────────────────────────────── */
export async function createProduct(
  input: ProductInput,
): Promise<Result<UpcomingProduct>> {
  const auth = await getAdmin();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.title) return { error: '품목명을 입력하세요.' };

  const { data, error } = await auth.supabase
    .from('upcoming_products')
    .insert(clean(input))
    .select()
    .single();

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/products');
  return { data: data as UpcomingProduct };
}

/* ── 수정 ─────────────────────────────────────────────────── */
export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<Result<UpcomingProduct>> {
  const auth = await getAdmin();
  if (auth.error || !auth.supabase) return { error: auth.error };
  if (!input.title) return { error: '품목명을 입력하세요.' };

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

/* ── 삭제 ─────────────────────────────────────────────────── */
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
