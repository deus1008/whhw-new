'use server';

import { createClient as createUserClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function getCommissionFileUrl(
  docId: string,
): Promise<{ url?: string; error?: string }> {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return { error: 'Unauthorized' };

  const svc = getSvc();
  const { data: doc } = await svc
    .from('documents')
    .select('storage_path, filename')
    .eq('id', docId)
    .single();
  if (!doc) return { error: '파일을 찾을 수 없습니다.' };

  const { data, error } = await svc.storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 3600);
  if (error) return { error: error.message };

  return { url: data.signedUrl };
}
