import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import DocumentsClient from '@/components/DocumentsClient';

type DocStatus = 'processing' | 'ready' | 'error';

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
  chunk_count: number; // document_chunks 테이블 실제 청크 수
};

export default async function DocumentsPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[documents:getUser error]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = myProfile?.role as string | undefined;
  if (!role || (role !== 'admin' && role !== 'uploader')) {
    redirect('/dashboard');
  }

  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, filename, file_type, storage_path, category, uploaded_by, status, error_message, created_at')
    .order('created_at', { ascending: false });

  if (docsError) console.error('[documents:getDocs error]', docsError);

  // 문서별 실제 청크 수 조회 (DB에 학습 데이터가 실제로 있는지 확인)
  const docIds = (docs ?? []).map(d => d.id);
  const chunkCountMap: Record<string, number> = {};
  if (docIds.length > 0) {
    const { data: chunkRows } = await supabase
      .from('document_chunks')
      .select('document_id')
      .in('document_id', docIds);
    for (const row of (chunkRows ?? [])) {
      const id = row.document_id as string;
      chunkCountMap[id] = (chunkCountMap[id] ?? 0) + 1;
    }
  }

  const docsWithChunks: Document[] = (docs ?? []).map(d => ({
    ...(d as Omit<Document, 'chunk_count'>),
    chunk_count: chunkCountMap[d.id] ?? 0,
  }));

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
          판매대행사업
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <Link href="/dashboard" style={navLinkStyle}>← 대시보드</Link>
          {role === 'admin' && (
            <Link href="/admin" style={navLinkStyle}>관리자 →</Link>
          )}
          <LogoutButton compact />
        </div>

        <DocumentsClient
          initialDocuments={docsWithChunks}
          userId={user.id}
        />
      </div>
    </>
  );
}

const navLinkStyle: React.CSSProperties = {
  padding: '0.35rem 0.9rem',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  color: 'var(--text-muted)',
  fontSize: '0.8rem',
  fontWeight: 500,
  textDecoration: 'none',
};
