'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export type MboTarget = {
  id:           string;
  user_id:      string;
  year:         number;
  month:        number | null;
  item_name:    string;
  target_value: string;   // text — 숫자·텍스트 모두 허용
  actual_value: string;   // text — 숫자·텍스트 모두 허용
  unit:         string;
  note:         string | null;
  sort_order:   number;
  created_at:   string;
  updated_at:   string;
};

export type Member = {
  id:    string;
  email: string;
};

export type MonthlyActual = {
  month:        number;
  target_value: string;
  actual_value: string;
  note:         string | null;
};

function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getRole(): Promise<{ userId: string; isAdmin: boolean } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return { userId: user.id, isAdmin: profile?.role === 'admin' };
}

/* ── 멤버 목록 (admin 전용) ── */
export async function getMembers(): Promise<Member[]> {
  const sb = serviceClient();
  const { data } = await sb
    .from('profiles')
    .select('id, email')
    .eq('status', 'approved')
    .order('email');
  return (data ?? []) as Member[];
}

/* ── 목표 목록 조회 ── */
export async function getMboTargets(
  userId: string,
  year: number,
  month: number | null,
): Promise<MboTarget[]> {
  const sb = serviceClient();
  let q = sb
    .from('mbo_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('sort_order')
    .order('created_at');

  if (month === null) {
    q = q.is('month', null);
  } else {
    q = q.eq('month', month);
  }

  const { data, error } = await q;
  if (error) { console.error('[mbo] getMboTargets:', error.message); return []; }
  return (data ?? []) as MboTarget[];
}

/* ── 목표 추가 (admin) ── */
export async function createMboTarget(payload: {
  user_id:      string;
  year:         number;
  month:        number | null;
  item_name:    string;
  target_value: string;
  unit:         string;
  sort_order:   number;
}): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth?.isAdmin) return { error: '관리자만 목표를 설정할 수 있습니다.' };

  const sb = serviceClient();
  const { error } = await sb.from('mbo_targets').insert({
    ...payload,
    created_by: auth.userId,
  });

  if (error) {
    if (error.code === '42P01') return { error: 'mbo_targets 테이블이 없습니다. 마이그레이션을 실행해 주세요.' };
    return { error: error.message };
  }

  revalidatePath('/mbo');
  return {};
}

/* ── 목표 수정 (admin) ── */
export async function updateMboTarget(
  id: string,
  payload: Partial<Pick<MboTarget, 'item_name' | 'target_value' | 'unit' | 'sort_order'>>,
): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth?.isAdmin) return { error: '관리자만 목표를 수정할 수 있습니다.' };

  const sb = serviceClient();
  const { error } = await sb
    .from('mbo_targets')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/mbo');
  return {};
}

/* ── 순서 전체 재할당 (admin) ── */
// 이동 후 배열 전체의 sort_order를 0,1,2… 으로 재설정
export async function reorderMboTargets(
  items: { id: string; sort_order: number }[],
): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth?.isAdmin) return { error: '관리자만 순서를 변경할 수 있습니다.' };

  const sb = serviceClient();
  const now = new Date().toISOString();
  const results = await Promise.all(
    items.map(({ id, sort_order }) =>
      sb.from('mbo_targets')
        .update({ sort_order, updated_at: now })
        .eq('id', id)
    )
  );
  const firstError = results.find(r => r.error);
  if (firstError?.error) return { error: firstError.error.message };
  revalidatePath('/mbo');
  return {};
}

/* ── 목표 삭제 (admin) ── */
export async function deleteMboTarget(id: string): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth?.isAdmin) return { error: '관리자만 목표를 삭제할 수 있습니다.' };

  const sb = serviceClient();
  const { error } = await sb.from('mbo_targets').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/mbo');
  return {};
}

/* ── 월별 실적 전체 조회 (targetId 배열) ── */
export async function getMonthlyActualsByTargets(
  targetIds: string[],
): Promise<Record<string, MonthlyActual[]>> {
  if (targetIds.length === 0) return {};
  const sb = serviceClient();
  const { data, error } = await sb
    .from('mbo_monthly_actuals')
    .select('target_id, month, target_value, actual_value, note')
    .in('target_id', targetIds);
  if (error) { console.error('[mbo] getMonthlyActuals:', error.message); return {}; }

  const result: Record<string, MonthlyActual[]> = {};
  for (const row of data ?? []) {
    const tid = row.target_id as string;
    if (!result[tid]) result[tid] = [];
    result[tid].push({
      month:        row.month as number,
      target_value: String(row.target_value ?? ''),
      actual_value: String(row.actual_value ?? ''),
      note:         row.note as string | null,
    });
  }
  return result;
}

/* ── 월별 목표·실적 저장 + 연간 합산 자동 반영 ── */
export async function upsertMonthlyEntry(
  targetId:    string,
  month:       number,
  field:       'target' | 'actual',
  value:       string,
): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth) return { error: '로그인이 필요합니다.' };

  const sb  = serviceClient();
  const now = new Date().toISOString();

  // 권한 확인
  if (!auth.isAdmin) {
    const { data: t } = await sb.from('mbo_targets').select('user_id').eq('id', targetId).single();
    if (!t || (t as { user_id: string }).user_id !== auth.userId) return { error: '권한이 없습니다.' };
  }

  const col = field === 'target' ? 'target_value' : 'actual_value';

  // upsert 월별 행
  const { error: uErr } = await sb.from('mbo_monthly_actuals').upsert(
    { target_id: targetId, month, [col]: value, updated_by: auth.userId, updated_at: now },
    { onConflict: 'target_id,month' },
  );
  if (uErr) return { error: uErr.message };

  // 해당 필드 전체 합산 → 연간 값 갱신
  const { data: allMonths } = await sb
    .from('mbo_monthly_actuals')
    .select(col)
    .eq('target_id', targetId);

  const validNums = (allMonths ?? [])
    .map(r => String((r as Record<string, string>)[col] ?? '').trim())
    .filter(v => v !== '' && !isNaN(Number(v)))
    .map(Number);

  const newSum = validNums.length > 0 ? String(validNums.reduce((a, b) => a + b, 0)) : '';

  if (newSum !== '') {
    const parentCol = field === 'target' ? 'target_value' : 'actual_value';
    await sb.from('mbo_targets')
      .update({ [parentCol]: newSum, updated_at: now })
      .eq('id', targetId);
  }

  revalidatePath('/mbo');
  return {};
}

/* ── 현수준 색상 조회 ── */
export async function getMboStatus(
  userId: string,
  year: number,
  month: number | null,
): Promise<string | null> {
  const sb = serviceClient();
  let q = sb.from('mbo_status').select('status_color').eq('user_id', userId).eq('year', year);
  q = month === null ? q.is('month', null) : q.eq('month', month);
  const { data } = await q.maybeSingle();
  return (data as { status_color: string } | null)?.status_color ?? null;
}

/* ── 현수준 색상 설정 (admin) ── */
export async function setMboStatus(
  userId: string,
  year: number,
  month: number | null,
  color: string,
): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth?.isAdmin) return { error: '관리자만 현수준을 설정할 수 있습니다.' };

  const sb = serviceClient();
  const now = new Date().toISOString();

  let q = sb.from('mbo_status').select('id').eq('user_id', userId).eq('year', year);
  q = month === null ? q.is('month', null) : q.eq('month', month);
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    await sb.from('mbo_status').update({ status_color: color, updated_at: now }).eq('id', (existing as { id: string }).id);
  } else {
    await sb.from('mbo_status').insert({ user_id: userId, year, month, status_color: color, created_by: auth.userId });
  }

  revalidatePath('/mbo');
  return {};
}

/* ── 실적 업데이트 (admin + 본인) ── */
export async function updateMboActual(
  id: string,
  actualValue: string,
  note: string,
): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth) return { error: '로그인이 필요합니다.' };

  const sb = serviceClient();

  // 본인 또는 admin 확인
  if (!auth.isAdmin) {
    const { data } = await sb
      .from('mbo_targets')
      .select('user_id')
      .eq('id', id)
      .single();
    if (!data || data.user_id !== auth.userId) return { error: '권한이 없습니다.' };
  }

  const { error } = await sb
    .from('mbo_targets')
    .update({ actual_value: actualValue, note, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/mbo');
  return {};
}
