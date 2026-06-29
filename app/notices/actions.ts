'use server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyAdminAndGetCompany(): Promise<string | null> {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: p } = await supabase
    .from('profiles').select('role, roles, status, company_id').eq('id', user.id).single();
  if (!p || p.status !== 'approved') throw new Error('Unauthorized');
  const rawRoles: string[] = p.roles?.length ? p.roles : (p.role ? [p.role] : []);
  const isAdmin = rawRoles.map((r: string) => normalizeRole(r)).includes('관리자');
  if (!isAdmin) throw new Error('Unauthorized');
  return getEffectiveCompanyId((p.company_id as string) ?? null, true);
}

type Result = { error?: string };

export async function createNotice(data: {
  title: string;
  content: string;
  is_pinned: boolean;
}): Promise<Result & { id?: string }> {
  let companyId: string | null = null;
  try { companyId = await verifyAdminAndGetCompany(); } catch { return { error: '권한이 없습니다.' }; }
  const { data: row, error } = await getSvc()
    .from('notices')
    .insert([{ title: data.title, content: data.content, is_pinned: data.is_pinned, company_id: companyId ?? null }])
    .select('id').single();
  if (error) return { error: error.message };
  revalidatePath('/notices');
  return { id: row.id };
}

export async function updateNotice(
  id: string,
  data: { title: string; content: string; is_pinned: boolean },
): Promise<Result> {
  try { await verifyAdminAndGetCompany(); } catch { return { error: '권한이 없습니다.' }; }
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
  try { await verifyAdminAndGetCompany(); } catch { return { error: '권한이 없습니다.' }; }
  const { error } = await getSvc().from('notices').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/notices');
  return {};
}
