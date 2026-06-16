'use server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

function getSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Result = { error?: string };

export async function createReport(data: {
  title: string;
  content: string;
}): Promise<Result & { id?: string }> {
  const svc = getSvc();
  const { data: row, error } = await svc
    .from('reports')
    .insert([{ title: data.title, content: data.content }])
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
