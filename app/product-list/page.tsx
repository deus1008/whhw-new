export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import ProductListClient from '@/components/ProductListClient';
import type { ProductRow } from '@/components/ProductListClient';
import XLSX from 'xlsx';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function col(row: unknown[], i: number): string {
  return String((row as unknown[])[i] ?? '').trim();
}

function parseProductListBuffer(buf: Buffer): ProductRow[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  // 헤더 행 탐색: 비어있지 않은 셀이 5개 이상인 첫 번째 행
  let headerIdx = -1;
  for (let i = 0; i < Math.min(30, all.length); i++) {
    if ((all[i] as unknown[]).filter(c => String(c).trim() !== '').length >= 5) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const hdr = (all[headerIdx] as unknown[]).map(c =>
    String(c).replace(/\r\n|\n|\r/g, ' ').trim(),
  );

  const idx = (name: string) => hdr.findIndex(h => h === name || h.startsWith(name));

  const i제조사   = idx('제조사');
  const i품목그룹 = idx('품목그룹');
  const i품목명   = idx('품목명');
  const i내부품목 = idx('내부품목명');
  const i대표코드 = idx('대표코드');
  const i보험코드 = idx('보험(청구)코드');
  const i규격     = idx('규격');
  const i급여     = idx('급여');
  const i약가     = idx('약가');
  const i성분명   = idx('성분명');
  const i사용     = idx('사용');
  const i비고     = idx('비고');

  const rows: ProductRow[] = [];
  for (let r = headerIdx + 1; r < all.length; r++) {
    const row = all[r] as unknown[];
    const 품목명 = col(row, i품목명);
    if (!품목명) continue; // 빈 행 스킵
    rows.push({
      제조사:      col(row, i제조사),
      품목그룹:    col(row, i품목그룹),
      품목명,
      성분명:      i성분명 >= 0 ? col(row, i성분명) : '',
      보험코드:    i보험코드 >= 0 ? col(row, i보험코드) : '',
      규격:        i규격 >= 0 ? col(row, i규격) : '',
      급여:        i급여 >= 0 ? col(row, i급여) : '',
      약가:        i약가 >= 0 ? col(row, i약가) : '',
      사용:        i사용 >= 0 ? col(row, i사용) : '1',
      비고:        i비고 >= 0 ? col(row, i비고) : '',
      _내부품목명: i내부품목 >= 0 ? col(row, i내부품목) : '',
      _대표코드:   i대표코드 >= 0 ? col(row, i대표코드) : '',
    });
  }
  return rows;
}

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

  // 가장 최근 위탁품목리스트 문서 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docQ: any = svc
    .from('documents')
    .select('id, filename, file_type, storage_path, created_at')
    .eq('category', '위탁품목리스트')
    .order('created_at', { ascending: false })
    .limit(1);
  if (companyId) docQ = docQ.eq('company_id', companyId);
  const { data: rawDoc } = await docQ;
  const latestDoc = (rawDoc ?? [])[0] as Record<string, unknown> | undefined;

  // signed URL + 파일 파싱
  let signedUrl: string | null = null;
  let productRows: ProductRow[] = [];
  let updatedAt = '';

  if (latestDoc?.storage_path) {
    const [{ data: urlData }, { data: blob }] = await Promise.all([
      svc.storage.from('documents').createSignedUrl(latestDoc.storage_path as string, 3600),
      svc.storage.from('documents').download(latestDoc.storage_path as string),
    ]);
    signedUrl = urlData?.signedUrl ?? null;
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      productRows = parseProductListBuffer(buf);
    }
    updatedAt = new Date(latestDoc.created_at as string).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '1000px', paddingTop: '2.5rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}
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
          padding: '1.25rem 1.5rem',
          marginBottom: '1rem',
        }}>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            📦 위탁품목리스트
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {companyName ? `${companyName} 위탁 품목 목록` : '위탁제약사별 품목 목록'}
          </p>
        </div>

        {/* 검색 + 테이블 */}
        {!latestDoc ? (
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
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px',
            padding: '1rem 1.25rem',
          }}>
            <ProductListClient
              rows={productRows}
              filename={latestDoc.filename as string}
              signedUrl={signedUrl}
              updatedAt={updatedAt}
            />
          </div>
        )}
      </div>
    </>
  );
}
