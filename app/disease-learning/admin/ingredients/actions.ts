'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';

/** 관리자만 — 성분 설명은 영업 현장에 나가는 내용이라 서버에서 매번 확인한다 */
async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved' || !profileIsAdmin(profile)) {
    throw new Error('관리자 권한이 필요합니다');
  }
}

function svc() {
  return createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function saveIngredientInfo(
  ingredient: string, description: string, drugClass: string, reviewed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const d = description.trim();
    if (!d) return { ok: false, error: '설명이 비어 있습니다' };
    const { error } = await svc().from('ingredient_info').update({
      description: d, drug_class: drugClass.trim() || null, reviewed,
      updated_at: new Date().toISOString(),
    }).eq('ingredient_name', ingredient);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/disease-learning/admin/ingredients');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

export async function setReviewed(
  ingredient: string, reviewed: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const { error } = await svc().from('ingredient_info')
      .update({ reviewed, updated_at: new Date().toISOString() })
      .eq('ingredient_name', ingredient);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/disease-learning/admin/ingredients');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}
