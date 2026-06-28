'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: profile } = await supabase
    .from('profiles').select('role, roles').eq('id', user.id).single();
  if (!profile || !profileIsAdmin(profile)) throw new Error('Unauthorized');
  return user;
}

export async function setSecurityAccess(formData: FormData) {
  const grantingUser = await verifyAdmin();
  const userId  = formData.get('userId')  as string;
  const level   = formData.get('level')   as '내부' | '기밀';
  const granted = formData.get('granted') === '1';

  if (!userId || !['내부', '기밀'].includes(level)) throw new Error('Invalid parameters');

  if (granted) {
    const { error } = await svc().from('task_security_access')
      .upsert({ level, user_id: userId, granted_by: grantingUser.id }, { onConflict: 'level,user_id' });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await svc().from('task_security_access')
      .delete().eq('user_id', userId).eq('level', level);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/admin/security');
}
