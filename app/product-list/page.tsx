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
import { toInsuranceCode } from '@/lib/products/insurance-code';
import XLSX from 'xlsx';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function parseProductListBuffer(buf: Buffer): ProductRow[] {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

  // 헤더 행 탐색: NO, 품목명이 있는 행
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, all.length); i++) {
    const row = (all[i] as unknown[]).map(c => String(c).trim());
    if (row.includes('NO') || row.includes('품목명')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const hdr  = (all[headerIdx] as unknown[]).map(c => String(c).trim());
  const iNo   = hdr.findIndex(h => h === 'NO');
  const iCode = hdr.findIndex(h => h === '대표코드');
  const iName = hdr.findIndex(h => h === '품목명');
  const iIngr = hdr.findIndex(h => h === '성분명');
  const iRate = hdr.findIndex(h => h === '수수료율');
  const iDist = hdr.findIndex(h => h === '유통여부');
  const iNote = hdr.findIndex(h => h === '참고사항');

  const rows: ProductRow[] = [];
  for (let r = headerIdx + 1; r < all.length; r++) {
    const row = all[r] as unknown[];
    const name = String(row[iName] ?? '').trim();
    if (!name) continue;
    rows.push({
      no:           iNo   >= 0 ? Number(row[iNo])                : r - headerIdx,
      // 대표코드(13자리) → 보험코드(9자리)로 추출해 저장
      code:         iCode >= 0 ? toInsuranceCode(String(row[iCode] ?? '')) : '',
      name,
      ingredient:   iIngr >= 0 ? String(row[iIngr] ?? '').trim() : '',
      rate:         iRate >= 0 ? Number(row[iRate] ?? 0)          : 0,
      distribution: iDist >= 0 ? String(row[iDist] ?? '').trim() : '',
      note:         iNote >= 0 ? String(row[iNote] ?? '').trim() : '',
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

  let signedUrl: string | null = null;
  let productRows: ProductRow[] = [];
  let updatedAt = '';
  let sourceLabel = '';

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
    sourceLabel = latestDoc.filename as string;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

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
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
            위탁 계약 품목 목록
            {sourceLabel && (
              <span style={{ marginLeft: '0.5rem', color: 'rgba(255,255,255,0.2)' }}>— {sourceLabel}</span>
            )}
          </p>
        </div>

        {productRows.length === 0 ? (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '3rem 1rem',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>📦</p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              등록된 위탁품목리스트가 없습니다.
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
              filename={sourceLabel}
              signedUrl={signedUrl}
              updatedAt={updatedAt}
            />
          </div>
        )}
      </div>
    </>
  );
}
