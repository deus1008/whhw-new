'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole, profileIsAdmin } from '@/lib/roles';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getEffectiveCompanyId } from '@/lib/active-company';
import type { UpcomingProduct } from './page';

export type ProductInput = {
  title:           string;
  launch_date:     string;   // YYYY-MM-DD or YYYY-MM
  manufacturer:    string;
  indication:      string;
  insurance_price: string;
  insurance_code:  string;
  status:          string;
  memo:            string;
};

type Result<T = void> = { data?: T; error?: string };

// 보안 단계 — 시스템 관리자(role='관리자')만 열람·생성·수정 가능
const SECURE_STATUS = ['개발검토', '개발승인', '허가예정'];

/* ── 서비스 롤 클라이언트 (RLS 우회) ─────────────────────────── */
function sb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/* ── 인증 확인 (승인 멤버) ────────────────────────────────────── */
async function checkApproved(): Promise<{ userId: string; role: string; company_id: string | null } | { error: string }> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: '인증이 필요합니다.' };

  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();

  if (!profile || profile.status !== 'approved')
    return { error: '승인된 계정이 아닙니다.' };

  const profileCompanyId = (profile.company_id as string) ?? null;
  const isSystemAdmin = profileIsAdmin(profile);
  const company_id = await getEffectiveCompanyId(profileCompanyId, isSystemAdmin);
  return {
    userId: user.id,
    role: normalizeRole(profile.role),
    company_id,
  };
}

function clean(input: ProductInput) {
  let launch = input.launch_date.trim() || null;
  if (launch && /^\d{4}-\d{2}$/.test(launch)) launch = `${launch}-01`;

  return {
    title:           input.title.trim()           || null,
    launch_date:     launch,
    manufacturer:    input.manufacturer.trim()    || null,
    indication:      input.indication.trim()      || null,
    insurance_price: input.insurance_price.trim() || null,
    insurance_code:  input.insurance_code.trim()  || null,
    status:          input.status                 || null,
    memo:            input.memo.trim()            || null,
  };
}

/* ── 생성 (승인된 멤버) ───────────────────────────────────────── */
export async function createProduct(input: ProductInput): Promise<Result<UpcomingProduct>> {
  const auth = await checkApproved();
  if ('error' in auth) return { error: auth.error };
  if (!input.title.trim()) return { error: '제품명을 입력하세요.' };
  // 보안 단계 생성은 시스템 관리자만
  if (SECURE_STATUS.includes(input.status) && auth.role !== '관리자')
    return { error: '해당 단계는 관리자만 등록할 수 있습니다.' };

  const { data, error } = await sb()
    .from('upcoming_products')
    .insert({ ...clean(input), company_id: auth.company_id })
    .select()
    .single();

  if (error) return { error: `저장 실패: ${error.message}` };
  revalidatePath('/products');
  return { data: data as UpcomingProduct };
}

/* ── 수정 (승인된 멤버) ───────────────────────────────────────── */
export async function updateProduct(id: string, input: ProductInput): Promise<Result<UpcomingProduct>> {
  const auth = await checkApproved();
  if ('error' in auth) return { error: auth.error };
  if (!input.title.trim()) return { error: '제품명을 입력하세요.' };

  // 비관리자는 보안 단계 제품을 수정하거나, 보안 단계로 변경할 수 없음
  if (auth.role !== '관리자') {
    if (SECURE_STATUS.includes(input.status))
      return { error: '해당 단계는 관리자만 설정할 수 있습니다.' };
    const { data: cur } = await sb()
      .from('upcoming_products').select('status').eq('id', id).single();
    if (cur && SECURE_STATUS.includes((cur.status as string) ?? ''))
      return { error: '관리자 전용 단계 제품은 수정할 수 없습니다.' };
  }

  const { data, error } = await sb()
    .from('upcoming_products')
    .update(clean(input))
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: `수정 실패: ${error.message}` };
  revalidatePath('/products');
  return { data: data as UpcomingProduct };
}

/* ── 삭제 (관리자 전용) ───────────────────────────────────────── */
export async function deleteProduct(id: string): Promise<Result> {
  const auth = await checkApproved();
  if ('error' in auth) return { error: auth.error };
  if (auth.role !== '관리자') return { error: '관리자만 삭제할 수 있습니다.' };

  const { error } = await sb()
    .from('upcoming_products')
    .delete()
    .eq('id', id);

  if (error) return { error: `삭제 실패: ${error.message}` };
  revalidatePath('/products');
  return {};
}
