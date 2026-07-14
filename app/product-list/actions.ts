'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

/** 제품 생동/DMF 여부 수동 수정 (관리자 전용). value: true/false/null(미확인) */
export async function updateProductFlag(
  id: string,
  field: 'is_bioequiv' | 'has_dmf',
  value: boolean | null,
): Promise<{ error?: string }> {
  if (field !== 'is_bioequiv' && field !== 'has_dmf') return { error: '잘못된 필드입니다.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved' || !profileIsAdmin(profile))
    return { error: '관리자만 수정할 수 있습니다.' };

  const svc = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await svc.from('products').update({ [field]: value }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/product-list');
  return {};
}
