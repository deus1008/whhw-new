'use server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyAdmin() {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: p } = await supabase
    .from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!p || p.status !== 'approved') throw new Error('Unauthorized');
  const rawRoles: string[] = p.roles?.length ? p.roles : (p.role ? [p.role] : []);
  if (!rawRoles.map((r: string) => r.trim()).includes('관리자')) throw new Error('Unauthorized');
}

type Result = { error?: string };

export async function createNotice(data: {
  title: string;
  content: string;
  is_pinned: boolean;
}): Promise<Result & { id?: string }> {
  try { await verifyAdmin(); } catch { return { error: '권한이 없습니다.' }; }
  const { data: row, error } = await getSvc()
    .from('notices')
    .insert([{ title: data.title, content: data.content, is_pinned: data.is_pinned }])
    .select('id').single();
  if (error) return { error: error.message };
  revalidatePath('/notices');
  return { id: row.id };
}

export async function updateNotice(
  id: string,
  data: { title: string; content: string; is_pinned: boolean },
): Promise<Result> {
  try { await verifyAdmin(); } catch { return { error: '권한이 없습니다.' }; }
  const { error } = await getSvc()
    .from('notices')
    .update({ title: data.title, content: data.content, is_pinned: data.is_pinned, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/notices');
  revalidatePath(`/notices/${id}`);
  return {};
}

export async function deleteNotice(id: string): Promise<Result> {
  try { await verifyAdmin(); } catch { return { error: '권한이 없습니다.' }; }
  const { error } = await getSvc().from('notices').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/notices');
  return {};
}
