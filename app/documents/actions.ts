'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';

/** RLS를 우회하는 서비스 롤 클라이언트 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 누락되었습니다.');
  return createSupabaseClient(url, key);
}

async function verifyUploaderOrAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, roles')
    .eq('id', user.id)
    .single();

  if (!profile || !profileIsAdmin(profile)) {
    throw new Error('Unauthorized');
  }

  return { supabase, userId: user.id, isAdmin: true };
}

export async function deleteDocument(formData: FormData) {
  const { supabase, userId, isAdmin } = await verifyUploaderOrAdmin();

  const documentId  = formData.get('documentId')  as string;
  const storagePath = formData.get('storagePath') as string;

  if (!documentId || !storagePath) throw new Error('잘못된 요청입니다.');

  // 문서 소유자 확인 (uploader는 본인 것만)
  const { data: doc, error: fetchErr } = await supabase
    .from('documents')
    .select('id, uploaded_by, filename, category, company_id')
    .eq('id', documentId)
    .single();

  if (fetchErr || !doc) throw new Error('문서를 찾을 수 없습니다.');
  if (!isAdmin && doc.uploaded_by !== userId) {
    throw new Error('삭제 권한이 없습니다.');
  }

  // Storage 삭제
  const { error: storageErr } = await supabase.storage
    .from('documents')
    .remove([storagePath]);

  if (storageErr) {
    console.error('[deleteDocument storage error]', storageErr);
    throw new Error(`Storage 삭제 실패: ${storageErr.message}`);
  }

  // 테이블 레코드 삭제
  const { error: dbErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (dbErr) {
    console.error('[deleteDocument db error]', dbErr);
    throw new Error(`DB 삭제 실패: ${dbErr.message}`);
  }

  // 문서(파일)를 삭제할 때, 그 파일이 적재한 파생 데이터도 함께 정리한다.
  //
  // ★ 원칙: '문서에 없는데 DB에 있는 데이터'를 전부 고아로 간주해 지우지 않는다.
  //   오직 '삭제되는 이 파일'이 적재한 행만(source_file = 파일명) 대상으로 한다.
  //   → 문서 없이 DB에 직접 적재된(source_file=null 등) 데이터는 절대 자동 삭제되지 않는다.
  //
  // 대상: source_file 로 파일에 정확히 귀속되는 카테고리만 포함.
  //   제외 — 거래처현황(회사/전체 스코프), 재고현황(년+월 스코프), 위탁품목리스트(products 마스터),
  //          허가현황(source_document_id 방식·기존행 미태깅) 은 파일 귀속이 아니므로 제외.
  const DERIVED: Record<string, { table: string; company?: boolean }> = {
    '약가':             { table: 'drug_prices' },
    '수수료율':         { table: 'commission_rates' },
    '수수료율(딜러)':   { table: 'commission_rates' },
    '수수료율(제약사)': { table: 'commission_rates' },
    '수수료정산':       { table: 'commission_settlements' },
    'Ubist':            { table: 'ubist_data' },
    '생동품목':         { table: 'drug_bioequiv' },
    '원료DMF':          { table: 'drug_dmf' },
    'EDI':              { table: 'trend_prescriptions', company: true },
  };
  const rule = doc.category ? DERIVED[doc.category as string] : undefined;
  if (rule && doc.filename) {
    const svc = createServiceClient();
    let delQ = svc.from(rule.table).delete().eq('source_file', doc.filename as string);
    // EDI(trend_prescriptions)만 회사 컬럼이 있어 회사 스코프까지 적용(더 정밀). 나머지는 파일명 단독.
    if (rule.company) delQ = doc.company_id ? delQ.eq('company_id', doc.company_id) : delQ.is('company_id', null);
    const { error: rxErr } = await delQ;
    if (rxErr) console.error(`[deleteDocument ${rule.table} cleanup error]`, rxErr);
    // 파생 데이터를 소비하는 페이지 갱신
    for (const p of ['/edi', '/weekly', '/dashboard', '/settlement', '/commission', '/commission-rate',
      '/prescription', '/market-analysis', '/drug-search', '/products']) {
      revalidatePath(p);
    }
  }

  revalidatePath('/documents');
}

/* ── 다운로드 서명 URL 생성 ──────────────────────────────── */
export async function getDownloadUrl(storagePath: string): Promise<{ url?: string; error?: string }> {
  try {
    await verifyUploaderOrAdmin();
    const sb = createServiceClient();
    const { data, error } = await sb.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600); // 1시간 유효
    if (error) return { error: error.message };
    return { url: data.signedUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '다운로드 URL 생성 실패' };
  }
}

/* ── 폴더 이름 변경 ─────────────────────────────────────── */
export async function renameFolder(oldName: string | null, newName: string): Promise<{ error?: string }> {
  try {
    const { userId, isAdmin } = await verifyUploaderOrAdmin();

    const trimmed = newName.trim();
    if (!trimmed) return { error: '폴더 이름을 입력하세요.' };

    // RLS 우회: 서비스 롤 클라이언트 사용 (권한 검증은 위 verifyUploaderOrAdmin에서 완료)
    const supabase = createServiceClient();

    let dbError: { message: string } | null = null;

    if (isAdmin) {
      // 관리자: 해당 폴더의 모든 문서 변경
      if (oldName === null) {
        const { error } = await supabase
          .from('documents')
          .update({ category: trimmed })
          .is('category', null);
        dbError = error;
      } else {
        const { error } = await supabase
          .from('documents')
          .update({ category: trimmed })
          .eq('category', oldName);
        dbError = error;
      }
    } else {
      // uploader: 본인 문서만
      if (oldName === null) {
        const { error } = await supabase
          .from('documents')
          .update({ category: trimmed })
          .is('category', null)
          .eq('uploaded_by', userId);
        dbError = error;
      } else {
        const { error } = await supabase
          .from('documents')
          .update({ category: trimmed })
          .eq('category', oldName)
          .eq('uploaded_by', userId);
        dbError = error;
      }
    }

    if (dbError) {
      console.error('[renameFolder dbError]', dbError);
      return { error: `변경 실패: ${dbError.message}` };
    }

    revalidatePath('/documents');
    return {};
  } catch (e) {
    console.error('[renameFolder error]', e);
    return { error: '저장 중 오류가 발생했습니다.' };
  }
}
