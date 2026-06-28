'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';

export type DcItem = {
  id: string;
  category: string;
  product_name: string;
  hospital_name: string;
  progress: string | null;
  due_date: string | null;   // YYYY-MM-DD
  memo: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyEditor(): Promise<{ userId: string; company_id: string | null }> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('인증이 필요합니다.');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') throw new Error('승인된 계정이 아닙니다.');

  const role = normalizeRole(profile.role);
  const editorRoles = ['관리자', '마케팅총괄', 'PM'];
  if (!editorRoles.includes(role)) throw new Error('편집 권한이 없습니다.');

  return { userId: user.id, company_id: (profile.company_id as string) ?? null };
}

/* ── 전체 조회 ─────────────────────────────────────────────── */
export async function getDcItems(companyId?: string | null): Promise<DcItem[]> {
  let q = svc().from('dc_status').select('*').order('category').order('sort_order').order('created_at');
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q;
  if (error) { console.error('[getDcItems]', error); return []; }
  return (data ?? []) as DcItem[];
}

/* ── 추가 ──────────────────────────────────────────────────── */
export async function createDcItem(formData: FormData): Promise<{ error?: string }> {
  try {
    const { userId, company_id } = await verifyEditor();
    const item = {
      category:      (formData.get('category')      as string)?.trim() || '준비중',
      product_name:  (formData.get('product_name')  as string)?.trim(),
      hospital_name: (formData.get('hospital_name') as string)?.trim(),
      progress:      (formData.get('progress')      as string)?.trim() || null,
      due_date:      (formData.get('due_date')      as string)?.trim() || null,
      memo:          (formData.get('memo')          as string)?.trim() || null,
      sort_order:    parseInt((formData.get('sort_order') as string) || '0'),
      created_by:    userId,
      company_id,
    };

    if (!item.product_name)  return { error: '제품명을 입력하세요.' };
    if (!item.hospital_name) return { error: '병원명을 입력하세요.' };

    const { error } = await svc().from('dc_status').insert(item);
    if (error) return { error: error.message };

    revalidatePath('/dc');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : '오류가 발생했습니다.' };
  }
}

/* ── 수정 ──────────────────────────────────────────────────── */
export async function updateDcItem(formData: FormData): Promise<{ error?: string }> {
  try {
    await verifyEditor(); // company_id는 수정 시 변경하지 않음
    const id = formData.get('id') as string;
    if (!id) return { error: '항목 ID가 없습니다.' };

    const updates = {
      category:      (formData.get('category')      as string)?.trim(),
      product_name:  (formData.get('product_name')  as string)?.trim(),
      hospital_name: (formData.get('hospital_name') as string)?.trim(),
      progress:      (formData.get('progress')      as string)?.trim() || null,
      due_date:      (formData.get('due_date')      as string)?.trim() || null,
      memo:          (formData.get('memo')          as string)?.trim() || null,
      sort_order:    parseInt((formData.get('sort_order') as string) || '0'),
      updated_at:    new Date().toISOString(),
    };

    if (!updates.product_name)  return { error: '제품명을 입력하세요.' };
    if (!updates.hospital_name) return { error: '병원명을 입력하세요.' };

    const { error } = await svc().from('dc_status').update(updates).eq('id', id);
    if (error) return { error: error.message };

    revalidatePath('/dc');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : '오류가 발생했습니다.' };
  }
}

/* ── 삭제 ──────────────────────────────────────────────────── */
export async function deleteDcItem(id: string): Promise<{ error?: string }> {
  try {
    await verifyEditor();
    const { error } = await svc().from('dc_status').delete().eq('id', id);
    if (error) return { error: error.message };
    revalidatePath('/dc');
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : '오류가 발생했습니다.' };
  }
}
