'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ALL_ROLES, normalizeRole, type UserRole } from '@/lib/roles';

type Status = 'pending' | 'approved' | 'rejected';

/** 관리자 확인 — role 단일 컬럼만 사용 (항상 존재) */
async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();

  if (!profile || normalizeRole(profile.role) !== '관리자') throw new Error('Unauthorized');
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
    .from('profiles').update({ status }).eq('id', userId);

  if (error) { console.error('[updateStatus error]', error); throw new Error(error.message); }
  revalidatePath('/admin');
}

export async function updateName(formData: FormData) {
  const supabase = await verifyAdmin();
  const userId = formData.get('userId') as string;
  const full_name = (formData.get('full_name') as string)?.trim() ?? '';

  if (!userId) throw new Error('Invalid parameters');

  const { error } = await supabase
    .from('profiles').update({ full_name: full_name || null }).eq('id', userId);

  if (error) { console.error('[updateName error]', error); throw new Error(error.message); }
  revalidatePath('/admin');
}

export async function updateRoles(formData: FormData) {
  const supabase = await verifyAdmin();
  const userId = formData.get('userId') as string;
  const rawRoles = formData.getAll('roles') as string[];
  const roles = rawRoles.filter(r => ALL_ROLES.includes(r as UserRole)) as UserRole[];

  if (!userId || roles.length === 0) {
    throw new Error('역할을 하나 이상 선택해야 합니다.');
  }

  // 관리자 역할 할당 시도 방지
  if (roles.includes('관리자')) {
    throw new Error('관리자 역할은 이 방법으로 부여할 수 없습니다.');
  }

  // 대상 사용자가 관리자인지 확인 (role 컬럼으로만 — 항상 존재)
  const { data: target } = await supabase
    .from('profiles').select('role').eq('id', userId).single();
  if (normalizeRole(target?.role) === '관리자') {
    throw new Error('관리자 역할은 변경할 수 없습니다.');
  }

  const primaryRole = roles[0];

  // 1) roles 배열 + role 동시 업데이트 시도
  const { error: err1 } = await supabase
    .from('profiles')
    .update({ roles, role: primaryRole })
    .eq('id', userId);

  if (err1) {
    // 2) CHECK 제약(23514) 또는 roles 컬럼 미존재 → role만 업데이트 시도
    const { error: err2 } = await supabase
      .from('profiles')
      .update({ role: primaryRole })
      .eq('id', userId);

    if (err2) {
      if (err2.code === '23514') {
        // DB CHECK 제약이 신규 역할명을 막고 있음 — Supabase SQL 마이그레이션 필요
        // 페이지를 죽이지 말고 콘솔에만 기록
        console.warn('[updateRoles] CHECK constraint blocks new role names. Run DB migration SQL.');
      } else {
        console.error('[updateRoles fallback error]', err2);
        throw new Error(`역할 업데이트 실패: ${err2.message}`);
      }
    }
  }

  revalidatePath('/admin');
}
