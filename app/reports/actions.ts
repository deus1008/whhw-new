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

/** 승인된 사용자라면 누구나 파일 서명 URL 발급 */
export async function getDocFileUrl(
  docId: string,
): Promise<{ url?: string; filename?: string; file_type?: string; error?: string }> {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') return { error: 'Unauthorized' };

  const svc = getSvc();
  const { data: doc } = await svc
    .from('documents')
    .select('storage_path, filename, file_type')
    .eq('id', docId)
    .single();
  if (!doc) return { error: '파일을 찾을 수 없습니다.' };

  const { data, error } = await svc.storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 3600);
  if (error) return { error: error.message };

  return { url: data.signedUrl, filename: doc.filename, file_type: doc.file_type };
}

type Result = { error?: string };

async function getCompanyId(): Promise<string | null> {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles').select('role, company_id').eq('id', user.id).single();
  if (!profile) return null;
  const isAdmin = normalizeRole(profile.role as string) === '관리자';
  return getEffectiveCompanyId((profile.company_id as string) ?? null, isAdmin);
}

export async function createReport(data: {
  title: string;
  content: string;
}): Promise<Result & { id?: string }> {
  const [svc, companyId] = [getSvc(), await getCompanyId()];
  const { data: row, error } = await svc
    .from('reports')
    .insert([{ title: data.title, content: data.content, company_id: companyId ?? null }])
    .select('id')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/reports');
  return { id: row.id };
}

export async function updateReport(
  id: string,
  data: { title: string; content: string },
): Promise<Result> {
  const svc = getSvc();
  const { error } = await svc
    .from('reports')
    .update({ title: data.title, content: data.content, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/reports');
  revalidatePath(`/reports/${id}`);
  return {};
}

export async function deleteReport(id: string): Promise<Result> {
  const svc = getSvc();
  const { error } = await svc.from('reports').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/reports');
  return {};
}
