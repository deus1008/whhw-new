'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole, profileIsAdmin } from '@/lib/roles';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getEffectiveCompanyId } from '@/lib/active-company';
import type { UpcomingProduct } from './page';

export type HistoryImage = { path: string; name: string };

export type ProductInput = {
  title:           string;
  launch_date:     string;   // YYYY-MM-DD or YYYY-MM
  manufacturer:    string;
  indication:      string;
  insurance_price: string;
  insurance_code:  string;
  status:          string;
  memo:            string;
  history:         string;
  maker:           string;
  history_images:  HistoryImage[];   // 개발 히스토리 첨부 이미지 (storage 경로)
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
    history:         input.history.trim()         || null,
    maker:           input.maker.trim()           || null,
    history_images:  Array.isArray(input.history_images) ? input.history_images : [],
  };
}

// 선택 컬럼(history·maker) 미존재(마이그레이션 전) 판별 — 그 경우 해당 컬럼 없이 재시도
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMissingOptionalCol(err: any): boolean {
  const m = String(err?.message ?? '');
  return !!err && (err.code === '42703' || m.includes('history') || m.includes('maker') || m.includes('history_images'));
}

const BUCKET = 'documents';
const IMG_PREFIX = 'product-history';

/* ── 히스토리 이미지 업로드 (승인된 멤버) ─────────────────────── */
export async function uploadHistoryImage(formData: FormData): Promise<Result<{ path: string; name: string; url: string }>> {
  const auth = await checkApproved();
  if ('error' in auth) return { error: auth.error };

  const file = formData.get('file');
  if (!(file instanceof File)) return { error: '파일이 없습니다.' };
  if (!file.type.startsWith('image/')) return { error: '이미지 파일만 첨부할 수 있습니다.' };
  if (file.size > 10 * 1024 * 1024) return { error: '이미지는 10MB 이하만 첨부할 수 있습니다.' };

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${IMG_PREFIX}/${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb().storage.from(BUCKET).upload(path, buf, { contentType: file.type, upsert: false });
  if (upErr) return { error: `업로드 실패: ${upErr.message}` };

  const { data: signed } = await sb().storage.from(BUCKET).createSignedUrl(path, 3600);
  return { data: { path, name: file.name, url: signed?.signedUrl ?? '' } };
}

/* ── 저장된 이미지 경로 → 서명 URL 맵 (열람 시) ───────────────── */
export async function getHistoryImageUrls(paths: string[]): Promise<Record<string, string>> {
  const auth = await checkApproved();
  if ('error' in auth) return {};
  const out: Record<string, string> = {};
  for (const p of paths) {
    if (!p) continue;
    const { data } = await sb().storage.from(BUCKET).createSignedUrl(p, 3600);
    if (data?.signedUrl) out[p] = data.signedUrl;
  }
  return out;
}

/* ── 생성 (승인된 멤버) ───────────────────────────────────────── */
export async function createProduct(input: ProductInput): Promise<Result<UpcomingProduct>> {
  const auth = await checkApproved();
  if ('error' in auth) return { error: auth.error };
  if (!input.title.trim()) return { error: '제품명을 입력하세요.' };
  // 보안 단계 생성은 시스템 관리자만
  if (SECURE_STATUS.includes(input.status) && auth.role !== '관리자')
    return { error: '해당 단계는 관리자만 등록할 수 있습니다.' };

  const payload = { ...clean(input), company_id: auth.company_id };
  let { data, error } = await sb().from('upcoming_products').insert(payload).select().single();
  if (isMissingOptionalCol(error)) {
    const { history: _h, maker: _m, history_images: _hi, ...rest } = payload;
    ({ data, error } = await sb().from('upcoming_products').insert(rest).select().single());
  }

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

  const patch = clean(input);
  let { data, error } = await sb().from('upcoming_products').update(patch).eq('id', id).select().single();
  if (isMissingOptionalCol(error)) {
    const { history: _h, maker: _m, history_images: _hi, ...rest } = patch;
    ({ data, error } = await sb().from('upcoming_products').update(rest).eq('id', id).select().single());
  }

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
