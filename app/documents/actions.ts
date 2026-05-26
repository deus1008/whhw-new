'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

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
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'uploader')) {
    throw new Error('Unauthorized');
  }

  return { supabase, userId: user.id, role: profile.role as string };
}

export async function deleteDocument(formData: FormData) {
  const { supabase, userId, role } = await verifyUploaderOrAdmin();

  const documentId  = formData.get('documentId')  as string;
  const storagePath = formData.get('storagePath') as string;

  if (!documentId || !storagePath) throw new Error('잘못된 요청입니다.');

  // 문서 소유자 확인 (uploader는 본인 것만)
  const { data: doc, error: fetchErr } = await supabase
    .from('documents')
    .select('id, uploaded_by')
    .eq('id', documentId)
    .single();

  if (fetchErr || !doc) throw new Error('문서를 찾을 수 없습니다.');
  if (role === 'uploader' && doc.uploaded_by !== userId) {
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

  revalidatePath('/documents');
}

/* ── 폴더 이름 변경 ─────────────────────────────────────── */
export async function renameFolder(oldName: string | null, newName: string): Promise<{ error?: string }> {
  try {
    const { userId, role } = await verifyUploaderOrAdmin();

    const trimmed = newName.trim();
    if (!trimmed) return { error: '폴더 이름을 입력하세요.' };

    // RLS 우회: 서비스 롤 클라이언트 사용 (권한 검증은 위 verifyUploaderOrAdmin에서 완료)
    const supabase = createServiceClient();

    let dbError: { message: string } | null = null;

    if (role === 'admin') {
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
