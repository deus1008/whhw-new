'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
