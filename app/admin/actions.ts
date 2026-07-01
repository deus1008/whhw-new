'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { ALL_ROLES, normalizeRole, profileIsAdmin, type UserRole } from '@/lib/roles';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** 승인 대기 사용자 수 (홈 뱃지용) */
export async function getPendingUsersCount(): Promise<number> {
  const { count } = await svc()
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

type Status = 'pending' | 'approved' | 'rejected';

/** 관리자 확인만 수행 — 실제 DB 쓰기는 서비스롤(svc)로 처리 */
async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles').select('role, roles').eq('id', user.id).single();

  if (!profile || !profileIsAdmin(profile)) throw new Error('Unauthorized');
}

export async function updateStatus(formData: FormData) {
  await verifyAdmin();
  const userId = formData.get('userId') as string;
  const status = formData.get('status') as Status;

  if (!userId || !['pending', 'approved', 'rejected'].includes(status)) {
    throw new Error('Invalid parameters');
  }

  const { error } = await svc()
    .from('profiles').update({ status }).eq('id', userId);

  if (error) { console.error('[updateStatus error]', error); throw new Error(error.message); }
  revalidatePath('/admin');
}

export async function updateName(formData: FormData) {
  await verifyAdmin();
  const userId = formData.get('userId') as string;
  const full_name = (formData.get('full_name') as string)?.trim() ?? '';

  if (!userId) throw new Error('Invalid parameters');

  const { error } = await svc()
    .from('profiles').update({ full_name: full_name || null }).eq('id', userId);

  if (error) { console.error('[updateName error]', error); throw new Error(error.message); }
  revalidatePath('/admin');
}

export async function updateUserCompany(formData: FormData) {
  await verifyAdmin();
  const userId    = formData.get('userId') as string;
  const companyId = (formData.get('companyId') as string) || null;

  if (!userId) throw new Error('Invalid parameters');

  const { data, error } = await svc()
    .from('profiles').update({ company_id: companyId }).eq('id', userId).select('id, company_id');

  if (error) { console.error('[updateUserCompany error]', error); throw new Error(error.message); }
  console.log('[updateUserCompany ok]', { userId, companyId, updated: data });
  revalidatePath('/admin');
}

export async function updateRoles(formData: FormData) {
  await verifyAdmin();
  const userId = formData.get('userId') as string;
  const rawRoles = formData.getAll('roles') as string[];
  const roles = rawRoles.filter(r => ALL_ROLES.includes(r as UserRole)) as UserRole[];

  if (!userId || roles.length === 0) {
    throw new Error('역할을 하나 이상 선택해야 합니다.');
  }

  if (roles.includes('관리자')) {
    throw new Error('관리자 역할은 이 방법으로 부여할 수 없습니다.');
  }

  // 대상 사용자가 관리자인지 확인 (서비스롤로 조회)
  const { data: target } = await svc()
    .from('profiles').select('role, roles').eq('id', userId).single();
  if (target && profileIsAdmin(target)) {
    throw new Error('관리자 역할은 변경할 수 없습니다.');
  }

  const primaryRole = roles[0];

  // 1) roles 배열 + role 동시 업데이트 (서비스롤로 RLS 우회)
  const { error: err1 } = await svc()
    .from('profiles')
    .update({ roles, role: primaryRole })
    .eq('id', userId);

  if (err1) {
    // 2) CHECK 제약(23514) 또는 roles 컬럼 미존재 → role만 업데이트
    const { error: err2 } = await svc()
      .from('profiles')
      .update({ role: primaryRole })
      .eq('id', userId);

    if (err2) {
      if (err2.code === '23514') {
        console.warn('[updateRoles] CHECK constraint blocks new role names. Run DB migration SQL.');
      } else {
        console.error('[updateRoles fallback error]', err2);
        throw new Error(`역할 업데이트 실패: ${err2.message}`);
      }
    }
  }

  revalidatePath('/admin');
}
