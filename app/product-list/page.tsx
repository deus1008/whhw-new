export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type DocRow = {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
  signedUrl: string | null;
};

const FILE_ICON: Record<string, string> = {
  pdf:  '📄',
  xlsx: '📊', xls: '📊', xlsb: '📊', xlsm: '📊',
  docx: '📝', doc: '📝',
  pptx: '📋', ppt: '📋',
};

export default async function ProductListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, status, company_id').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin = normalizeRole(profile.role as string) === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  const svc = getSvc();

  // 위탁사 전환바용 회사 목록
  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isAdmin) {
    const { data } = await svc
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (data ?? []) as { id: string; name: string }[];
  }

  // 현재 위탁사 이름
  const companyName = companyId
    ? (allianceCompanies.find(c => c.id === companyId)?.name
      ?? (await svc.from('client_companies').select('name').eq('id', companyId).single())
           .data?.name as string | undefined)
    : null;

  // 위탁품목리스트 문서 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docQ: any = svc
    .from('documents')
    .select('id, filename, file_type, storage_path, created_at')
    .eq('category', '위탁품목리스트')
    .order('created_at', { ascending: false });
  if (companyId) { docQ = docQ.eq('company_id', companyId); }
  const { data: rawDocs } = await docQ;

  // signed URL 생성 (1시간 유효)
  const docs: DocRow[] = await Promise.all(
    (rawDocs ?? []).map(async (r: Record<string, unknown>) => {
      const { data: urlData } = await svc.storage
        .from('documents')
        .createSignedUrl(r.storage_path as string, 3600);
      return {
        id:         r.id         as string,
        filename:   r.filename   as string,
        file_type:  r.file_type  as string,
        created_at: r.created_at as string,
        signedUrl:  urlData?.signedUrl ?? null,
      };
    })
  );

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '820px', paddingTop: '2.5rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}
      >
        {/* 상단 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {/* 위탁사 전환바 */}
        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        {/* 헤더 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '1.5rem 1.75rem',
          marginBottom: '1rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                📦 위탁품목리스트
              </h1>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {companyName ? `${companyName} 위탁 품목 목록` : '위탁제약사별 품목 목록'}
              </p>
            </div>
            <span style={{
              fontSize: '0.72rem', fontWeight: 600,
              color: 'rgba(165,180,252,0.6)',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '20px',
              padding: '0.2rem 0.65rem',
              whiteSpace: 'nowrap',
            }}>
              총 {docs.length}건
            </span>
          </div>
        </div>

        {/* 문서 목록 */}
        {docs.length === 0 ? (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '3rem 1rem',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>📦</p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {companyName ? `${companyName}의 위탁품목리스트가 없습니다.` : '등록된 위탁품목리스트가 없습니다.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {docs.map((doc, i) => {
              const icon = FILE_ICON[doc.file_type] ?? '📎';
              const date = new Date(doc.created_at).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric',
              });
              return (
                <div key={doc.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.9rem 1.1rem',
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px',
                  gap: '0.8rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{
                        fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        margin: 0,
                      }}>
                        {doc.filename}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {date} · {doc.file_type.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  {doc.signedUrl ? (
                    <a
                      href={doc.signedUrl}
                      download={doc.filename}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        padding: '0.42rem 1rem', borderRadius: '8px',
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.35)',
                        color: '#a5b4fc', fontSize: '0.78rem', fontWeight: 600,
                        textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      ⬇ 다운로드
                    </a>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>URL 오류</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
