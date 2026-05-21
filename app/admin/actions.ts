'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_EMAIL } from '@/lib/constants';

type Status = 'pending' | 'approved' | 'rejected';

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.email !== ADMIN_EMAIL) {
    throw new Error('Unauthorized');
  }
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
    .from('profiles')
    .update({ status })
    .eq('id', userId);

  if (error) {
    console.error('[updateStatus error]', error);
    throw new Error(error.message);
  }

  revalidatePath('/admin');
}
