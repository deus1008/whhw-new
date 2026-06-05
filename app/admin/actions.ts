'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ALL_ROLES, type UserRole } from '@/lib/roles';

type Status = 'pending' | 'approved' | 'rejected';

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();

  if (!profile || profile.role !== '관리자') throw new Error('Unauthorized');
  return supabase;
}

export async function updateStatus(formData: FormData) {
  const supabase = await verifyAdmin();
  const userId = formData.get('userId') as string;
  const status = formData.get('status') as Status;

  if (!userId || !['pending', 'approved', 'rejected'].includes(status)) {
    throw new Error('Invalid parameters');
  }

  const { error } = await supabase
    .from('profiles').update({ status }).eq('id', userId);

  if (error) { console.error('[updateStatus error]', error); throw new Error(error.message); }
  revalidatePath('/admin');
}

export async function updateRole(formData: FormData) {
  const supabase = await verifyAdmin();
  const userId = formData.get('userId') as string;
  const role   = formData.get('role')   as UserRole;

  if (!userId || !ALL_ROLES.includes(role)) {
    throw new Error('Invalid parameters');
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .neq('role', '관리자'); // 관리자 역할 행은 절대 변경 불가

  if (error) { console.error('[updateRole error]', error); throw new Error(error.message); }
  revalidatePath('/admin');
}
