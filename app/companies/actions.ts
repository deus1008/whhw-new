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
    .from('profiles').select('status, role, roles').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved' || !profileIsAdmin(profile))
    throw new Error('Unauthorized');
}

function revalidate() {
  revalidatePath('/companies');
}

function parseCompanyFields(formData: FormData) {
  return {
    name:             (formData.get('name') as string)?.trim(),
    code:             (formData.get('code') as string)?.trim().toLowerCase(),
    full_name:        (formData.get('full_name') as string)?.trim() || null,
    representative:   (formData.get('representative') as string)?.trim() || null,
    business_no:      (formData.get('business_no') as string)?.trim() || null,
    contract_start:   (formData.get('contract_start') as string)?.trim() || null,
    contract_end:     (formData.get('contract_end') as string)?.trim() || null,
    auto_renewal:     (formData.get('auto_renewal') as string)?.trim() || null,
    product_list_url: (formData.get('product_list_url') as string)?.trim() || null,
    display_order:    parseInt(formData.get('display_order') as string) || 0,
  };
}

export async function createCompany(formData: FormData): Promise<{ error?: string }> {
  try { await verifyAdmin(); } catch { return { error: '권한이 없습니다.' }; }

  const fields = parseCompanyFields(formData);
  if (!fields.name || !fields.code) return { error: '표시명과 코드는 필수입니다.' };

  const { error } = await svc().from('client_companies').insert(fields);

  if (error) return { error: error.code === '23505' ? `코드 '${fields.code}'가 이미 존재합니다.` : error.message };
  revalidate();
  return {};
}

export async function updateCompany(formData: FormData): Promise<{ error?: string }> {
  try { await verifyAdmin(); } catch { return { error: '권한이 없습니다.' }; }

  const id     = formData.get('id') as string;
  const fields = parseCompanyFields(formData);

  if (!id || !fields.name || !fields.code) return { error: '필수 입력값이 없습니다.' };

  const { error } = await svc().from('client_companies').update(fields).eq('id', id);

  if (error) return { error: error.message };
  revalidate();
  return {};
}

export async function toggleCompanyStatus(formData: FormData): Promise<{ error?: string }> {
  try { await verifyAdmin(); } catch { return { error: '권한이 없습니다.' }; }

  const id      = formData.get('id') as string;
  const current = formData.get('status') as string;
  const next    = current === 'active' ? 'inactive' : 'active';

  const { error } = await svc().from('client_companies').update({ status: next }).eq('id', id);

  if (error) return { error: error.message };
  revalidate();
  return {};
}

export async function deleteCompany(formData: FormData): Promise<{ error?: string }> {
  try { await verifyAdmin(); } catch { return { error: '권한이 없습니다.' }; }

  const id = formData.get('id') as string;

  const linkedTables = [
    'upcoming_products', 'dc_status', 'inventory_items',
    'monthly_stock', 'trend_prescriptions', 'ubist_data',
  ];
  for (const tbl of linkedTables) {
    const { count } = await svc()
      .from(tbl).select('*', { count: 'exact', head: true }).eq('company_id', id);
    if (count && count > 0)
      return { error: `'${tbl}'에 연결된 데이터(${count.toLocaleString()}건)가 있어 삭제할 수 없습니다.` };
  }

  const { error } = await svc().from('client_companies').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}
