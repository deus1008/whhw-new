'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getRoles } from '@/lib/roles';
import * as XLSX from 'xlsx';

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
  name:  string;
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
    .select('role, roles')
    .eq('id', user.id)
    .single();
  const userRoles = getRoles(profile ?? {});
  return { userId: user.id, isAdmin: userRoles.includes('관리자') };
}

/* ── 멤버 목록 (admin 전용) — 아주얼라이언스 직원만 ── */
export async function getMembers(): Promise<Member[]> {
  const sb = serviceClient();
  const { data } = await sb
    .from('profiles')
    .select('id, email, full_name, role, roles')
    .eq('status', 'approved')
    .is('company_id', null)   // 위탁사 배정 없음 = 얼라이언스 직원
    .order('full_name');

  return ((data ?? []) as Array<{
    id: string; email: string; full_name: string | null;
    role: string | null; roles: string[] | null;
  }>)
    .filter(p => !getRoles(p).includes('관리자'))   // 관리자 제외
    .map(p => ({ id: p.id, email: p.email, name: p.full_name ?? p.email }));
}

/* ── 목표 목록 조회 ── */
export async function getMboTargets(
  userId: string,
  year: number,
  month: number | null,
  companyId: string | null,
): Promise<MboTarget[]> {
  const sb = serviceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = sb
    .from('mbo_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('sort_order')
    .order('created_at');

  if (month === null) { q = q.is('month', null); } else { q = q.eq('month', month); }
  if (companyId)      { q = q.eq('company_id', companyId); } else { q = q.is('company_id', null); }

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
  company_id:   string | null;
}): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth) return { error: '로그인이 필요합니다.' };

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
  if (!auth) return { error: '로그인이 필요합니다.' };

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
  if (!auth) return { error: '로그인이 필요합니다.' };

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
  if (!auth) return { error: '로그인이 필요합니다.' };

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

  // 권한 확인 + 부모 항목 단위 조회 (합산 vs 평균 결정)
  const { data: parentTarget } = await sb
    .from('mbo_targets')
    .select('user_id, unit')
    .eq('id', targetId)
    .single();

  if (!auth.isAdmin) {
    if (!parentTarget || (parentTarget as { user_id: string }).user_id !== auth.userId)
      return { error: '권한이 없습니다.' };
  }

  // 단위가 '%'이면 평균, 그 외는 합산
  const useAvg = String((parentTarget as { unit: string } | null)?.unit ?? '').trim() === '%';

  const col = field === 'target' ? 'target_value' : 'actual_value';

  // upsert 월별 행
  const { error: uErr } = await sb.from('mbo_monthly_actuals').upsert(
    { target_id: targetId, month, [col]: value, updated_by: auth.userId, updated_at: now },
    { onConflict: 'target_id,month' },
  );
  if (uErr) return { error: uErr.message };

  // 해당 필드 전체 조회 → 합산 또는 평균 → 연간 값 갱신
  const { data: allMonths } = await sb
    .from('mbo_monthly_actuals')
    .select(col)
    .eq('target_id', targetId);

  const validNums = (allMonths ?? [])
    .map(r => String((r as Record<string, string>)[col] ?? '').trim())
    .filter(v => v !== '' && !isNaN(Number(v)))
    .map(Number);

  let newVal = '';
  if (validNums.length > 0) {
    const total = validNums.reduce((a, b) => a + b, 0);
    newVal = useAvg
      ? String(Math.round((total / validNums.length) * 100) / 100)  // 소수점 2자리
      : String(total);
  }

  if (newVal !== '') {
    const parentCol = field === 'target' ? 'target_value' : 'actual_value';
    await sb.from('mbo_targets')
      .update({ [parentCol]: newVal, updated_at: now })
      .eq('id', targetId);
  }

  revalidatePath('/mbo');
  return {};
}

/* ── 월별 목표·실적 일괄 저장 (저장하기 버튼용) ── */
export async function upsertMonthlyEntries(
  targetId: string,
  entries: Array<{ month: number; targetValue: string; actualValue: string }>,
): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth) return { error: '로그인이 필요합니다.' };

  const sb  = serviceClient();
  const now = new Date().toISOString();

  // 권한 확인 + 단위 조회
  const { data: parentTarget } = await sb
    .from('mbo_targets')
    .select('user_id, unit')
    .eq('id', targetId)
    .single();

  if (!auth.isAdmin) {
    if (!parentTarget || (parentTarget as { user_id: string }).user_id !== auth.userId)
      return { error: '권한이 없습니다.' };
  }

  const useAvg = String((parentTarget as { unit: string } | null)?.unit ?? '').trim() === '%';

  // 12개월 일괄 upsert
  const upsertData = entries.map(e => ({
    target_id:    targetId,
    month:        e.month,
    target_value: e.targetValue,
    actual_value: e.actualValue,
    updated_by:   auth.userId,
    updated_at:   now,
  }));

  const { error: uErr } = await sb
    .from('mbo_monthly_actuals')
    .upsert(upsertData, { onConflict: 'target_id,month' });
  if (uErr) return { error: uErr.message };

  // 합산/평균 → 연간 목표·실적 갱신
  const aggregate = (vals: string[]) => {
    const nums = vals.filter(v => v.trim() !== '' && !isNaN(Number(v))).map(Number);
    if (nums.length === 0) return '';
    const total = nums.reduce((a, b) => a + b, 0);
    return useAvg
      ? String(Math.round((total / nums.length) * 100) / 100)
      : String(total);
  };

  const newTarget = aggregate(entries.map(e => e.targetValue));
  const newActual = aggregate(entries.map(e => e.actualValue));

  const updates: Record<string, string> = { updated_at: now };
  if (newTarget !== '') updates.target_value = newTarget;
  if (newActual !== '') updates.actual_value = newActual;

  if (Object.keys(updates).length > 1) {
    await sb.from('mbo_targets').update(updates).eq('id', targetId);
  }

  revalidatePath('/mbo');
  return {};
}

/* ── 목표 항목 복사 (admin) ── */
export async function copyMboTargets(
  fromUserId: string,
  toUserId:   string,
  year:       number,
  companyId:  string | null,
): Promise<{ error?: string; count: number }> {
  const auth = await getRole();
  if (!auth?.isAdmin) return { error: '관리자만 복사할 수 있습니다.', count: 0 };

  const sb  = serviceClient();
  const now = new Date().toISOString();

  // 원본 연간 목표 조회 (현재 위탁사 기준)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let srcQ: any = sb
    .from('mbo_targets')
    .select('item_name, target_value, unit, sort_order')
    .eq('user_id', fromUserId)
    .eq('year', year)
    .is('month', null)
    .order('sort_order');
  srcQ = companyId ? srcQ.eq('company_id', companyId) : srcQ.is('company_id', null);
  const { data: sources, error: fetchErr } = await srcQ;

  if (fetchErr) return { error: fetchErr.message, count: 0 };
  if (!sources || sources.length === 0) return { error: '복사할 목표 항목이 없습니다.', count: 0 };

  // 대상 멤버 기존 연간 목표 삭제 (덮어쓰기)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let delQ: any = sb.from('mbo_targets').delete()
    .eq('user_id', toUserId).eq('year', year).is('month', null);
  delQ = companyId ? delQ.eq('company_id', companyId) : delQ.is('company_id', null);
  await delQ;

  // 복사 삽입 — target_value 유지, actual_value 초기화
  const rows = (sources as Array<{ item_name: string; target_value: string; unit: string; sort_order: number }>)
    .map((s, i) => ({
      user_id:      toUserId,
      year,
      month:        null,
      item_name:    s.item_name,
      target_value: s.target_value,
      actual_value: '',
      unit:         s.unit,
      sort_order:   i,
      company_id:   companyId ?? null,
      created_by:   auth.userId,
      created_at:   now,
      updated_at:   now,
    }));

  const { error: insErr } = await sb.from('mbo_targets').insert(rows);
  if (insErr) return { error: insErr.message, count: 0 };

  revalidatePath('/mbo');
  return { count: rows.length };
}

/* ── 현수준 색상 조회 ── */
export async function getMboStatus(
  userId: string,
  year: number,
  month: number | null,
  companyId: string | null,
): Promise<string | null> {
  const sb = serviceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = sb.from('mbo_status').select('status_color').eq('user_id', userId).eq('year', year);
  q = month === null ? q.is('month', null) : q.eq('month', month);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data } = await q.maybeSingle();
  return (data as { status_color: string } | null)?.status_color ?? null;
}

/* ── 현수준 색상 설정 (admin) ── */
export async function setMboStatus(
  userId: string,
  year: number,
  month: number | null,
  color: string,
  companyId: string | null,
): Promise<{ error?: string }> {
  const auth = await getRole();
  if (!auth) return { error: '로그인이 필요합니다.' };

  const sb = serviceClient();
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = sb.from('mbo_status').select('id').eq('user_id', userId).eq('year', year);
  q = month === null ? q.is('month', null) : q.eq('month', month);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    await sb.from('mbo_status').update({ status_color: color, updated_at: now }).eq('id', (existing as { id: string }).id);
  } else {
    await sb.from('mbo_status').insert({ user_id: userId, year, month, status_color: color, company_id: companyId ?? null, created_by: auth.userId });
  }

  revalidatePath('/mbo');
  return {};
}

/* ── 담당자별 목표 파일에서 ETC처방액 목표 가져오기 (admin) ── */
export async function importEtcTargetsFromDoc(
  fyYear: number,
  companyId: string | null,
): Promise<{ error?: string; updated?: number; messages?: string[] }> {
  const auth = await getRole();
  if (!auth?.isAdmin) return { error: '관리자만 실행할 수 있습니다.' };

  const sb = serviceClient();

  // 1. '담당자별 목표' 카테고리의 최신 파일 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docQ: any = sb.from('documents')
    .select('id, filename, storage_path, created_at')
    .ilike('category', '%담당자별 목표%')
    .order('created_at', { ascending: false })
    .limit(1);
  if (companyId) docQ = docQ.eq('company_id', companyId);
  else docQ = docQ.is('company_id', null);

  const { data: docs, error: docErr } = await docQ;
  if (docErr) return { error: docErr.message };
  if (!docs || docs.length === 0) return { error: "'담당자별 목표' 폴더에 파일이 없습니다." };

  const doc = docs[0] as { id: string; filename: string; storage_path: string };

  // 2. Storage 다운로드
  const { data: fileData, error: dlErr } = await sb.storage
    .from('documents')
    .download(doc.storage_path);
  if (dlErr || !fileData) return { error: `파일 다운로드 실패: ${dlErr?.message}` };

  // 3. Excel 파싱
  const buffer = await fileData.arrayBuffer();
  const wb = XLSX.read(Buffer.from(buffer), { type: 'buffer' });

  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { error: 'Excel 시트를 읽을 수 없습니다.' };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  if (rows.length === 0) return { error: '파일에 데이터가 없습니다.' };

  const headers = Object.keys(rows[0]);

  // 담당자명 컬럼 감지
  const nameCol = headers.find(h =>
    h.includes('담당자') || h.includes('성명') || h.includes('이름') || /^name$/i.test(h)
  );
  if (!nameCol) return { error: `담당자 컬럼을 찾을 수 없습니다. 헤더: ${headers.join(', ')}` };

  // ETC처방액 연간 합계 컬럼 감지 (합계, 연간, 계, total, sum 포함하는 것 우선)
  const etcHeaders = headers.filter(h => {
    const u = h.toUpperCase();
    return (u.includes('ETC') || u.includes('처방액')) && h !== nameCol;
  });
  const totalEtcCol = etcHeaders.find(h => {
    const u = h.toUpperCase();
    return u.includes('합계') || u.includes('연간') || u.includes('계') || u.includes('TOTAL') || u.includes('SUM');
  }) ?? etcHeaders[0] ?? null;

  // 월별 컬럼 감지 (FY 월 순서 기준: FY1=4월, FY2=5월 … FY12=3월)
  const MONTH_MAP: Array<{ fyMonth: number; patterns: RegExp[] }> = [
    { fyMonth:  1, patterns: [/^4월/, /\b4\b.*월/, /apr/i, /M1$/i] },
    { fyMonth:  2, patterns: [/^5월/, /\b5\b.*월/, /may/i, /M2$/i] },
    { fyMonth:  3, patterns: [/^6월/, /\b6\b.*월/, /jun/i, /M3$/i] },
    { fyMonth:  4, patterns: [/^7월/, /\b7\b.*월/, /jul/i, /M4$/i] },
    { fyMonth:  5, patterns: [/^8월/, /\b8\b.*월/, /aug/i, /M5$/i] },
    { fyMonth:  6, patterns: [/^9월/, /\b9\b.*월/, /sep/i, /M6$/i] },
    { fyMonth:  7, patterns: [/^10월/, /\b10\b.*월/, /oct/i, /M7$/i] },
    { fyMonth:  8, patterns: [/^11월/, /\b11\b.*월/, /nov/i, /M8$/i] },
    { fyMonth:  9, patterns: [/^12월/, /\b12\b.*월/, /dec/i, /M9$/i] },
    { fyMonth: 10, patterns: [/^1월/,  /\b1\b.*월/,  /jan/i, /M10$/i] },
    { fyMonth: 11, patterns: [/^2월/,  /\b2\b.*월/,  /feb/i, /M11$/i] },
    { fyMonth: 12, patterns: [/^3월/,  /\b3\b.*월/,  /mar/i, /M12$/i] },
  ];

  // ETC 관련 컬럼 중 월별인 것 찾기
  const monthColMap: Array<{ fyMonth: number; col: string }> = [];
  for (const { fyMonth, patterns } of MONTH_MAP) {
    const matched = etcHeaders.find(h => patterns.some(p => p.test(h)));
    if (matched) monthColMap.push({ fyMonth, col: matched });
  }

  // 4. profiles name → user_id 매핑
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, full_name')
    .is('company_id', null)
    .eq('status', 'approved');

  const nameToId = new Map<string, string>();
  for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
    if (p.full_name) nameToId.set(p.full_name.trim(), p.id);
  }

  const messages: string[] = [];
  let updated = 0;

  for (const row of rows) {
    const personName = String(row[nameCol] ?? '').trim();
    if (!personName) continue;

    const userId = nameToId.get(personName);
    if (!userId) {
      messages.push(`⚠ "${personName}" → 사용자를 찾을 수 없습니다 (건너뜀)`);
      continue;
    }

    // 해당 사용자의 ETC처방액 연간 목표 행 찾기
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tQ: any = sb.from('mbo_targets')
      .select('id, item_name, unit')
      .eq('user_id', userId)
      .eq('year', fyYear)
      .is('month', null);
    tQ = companyId ? tQ.eq('company_id', companyId) : tQ.is('company_id', null);
    const { data: existingTargets } = await tQ;

    const etcTarget = ((existingTargets ?? []) as { id: string; item_name: string; unit: string }[])
      .find(t => t.item_name.toUpperCase().includes('ETC') || t.item_name.includes('처방액'));

    if (!etcTarget) {
      messages.push(`⚠ "${personName}" → ETC처방액 목표 항목이 없습니다 (건너뜀)`);
      continue;
    }

    const now = new Date().toISOString();

    // 월별 데이터 처리
    if (monthColMap.length > 0) {
      const upsertData = monthColMap
        .map(({ fyMonth, col }) => {
          const raw = row[col];
          const val = raw === null || raw === '' ? '' : String(Number(raw) || 0);
          return { target_id: etcTarget.id, month: fyMonth, target_value: val, actual_value: '', updated_by: auth.userId, updated_at: now };
        });

      const { error: mErr } = await sb.from('mbo_monthly_actuals')
        .upsert(upsertData, { onConflict: 'target_id,month' });
      if (mErr) {
        messages.push(`⚠ "${personName}" → 월별 저장 실패: ${mErr.message}`);
        continue;
      }

      // 연간 합산
      const total = upsertData.reduce((s, e) => s + (Number(e.target_value) || 0), 0);
      await sb.from('mbo_targets')
        .update({ target_value: String(total), updated_at: now })
        .eq('id', etcTarget.id);

      messages.push(`✅ "${personName}" → 월별 ${monthColMap.length}개월, 연간 합계 ${total.toLocaleString()}`);
    } else {
      // 연간 합계 컬럼만 사용
      const rawVal = totalEtcCol ? row[totalEtcCol] : null;
      const numVal = rawVal === null || rawVal === '' ? null : Number(rawVal);
      if (numVal === null || isNaN(numVal)) {
        messages.push(`⚠ "${personName}" → 숫자 값을 읽을 수 없습니다 (건너뜀)`);
        continue;
      }

      const { error: updErr } = await sb.from('mbo_targets')
        .update({ target_value: String(numVal), updated_at: now })
        .eq('id', etcTarget.id);
      if (updErr) {
        messages.push(`⚠ "${personName}" → 업데이트 실패: ${updErr.message}`);
        continue;
      }

      messages.push(`✅ "${personName}" → ${numVal.toLocaleString()}`);
    }

    updated++;
  }

  revalidatePath('/mbo');
  return { updated, messages, error: updated === 0 ? '업데이트된 항목이 없습니다.' : undefined };
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
