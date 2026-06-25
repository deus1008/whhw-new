export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import DocumentsClient from '@/components/DocumentsClient';

type DocStatus = 'processing' | 'running' | 'ready' | 'error';

export type Document = {
  id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  category: string | null;
  uploaded_by: string;
  status: DocStatus;
  error_message: string | null;
  created_at: string;
  summary: string | null;
};

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[documents:getUser error]', userError);
  if (!user) redirect('/login');

  // 관리자 확인 — role 컬럼만 조회 (대시보드와 동일한 방식)
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const isAdmin = normalizeRole(myProfile.role as string) === '관리자';

  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, filename, file_type, storage_path, category, uploaded_by, status, error_message, created_at, summary')
    .neq('file_type', 'summary')   // 경쟁사 동향 요약 항목은 문서관리에 표시 안 함
    .order('created_at', { ascending: false });

  if (docsError) console.error('[documents:getDocs error]', docsError);

  const docsWithChunks: Document[] = (docs ?? []) as Document[];

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '860px', padding: '2.5rem 1rem', minHeight: '100vh' }}>
        <p
          className="domain"
          style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}
        >
          문서관리
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        <DocumentsClient
          initialDocuments={docsWithChunks}
          userId={user.id}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}

