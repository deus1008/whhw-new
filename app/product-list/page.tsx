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
import { parseProductListBuffer } from '@/lib/products/parse-list';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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

  // 1순위: products 마스터 테이블(보험코드) — 업로드 시 적재됨
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prodQ: any = svc
    .from('products')
    .select('no, insurance_code, product_name, ingredient_name, commission_rate, distribution, note')
    .order('no', { ascending: true });
  prodQ = companyId ? prodQ.eq('company_id', companyId) : prodQ.is('company_id', null);
  const { data: masterRows } = await prodQ;

  if (masterRows && masterRows.length > 0) {
    productRows = (masterRows as Record<string, unknown>[]).map((r, i) => ({
      no:           (r.no as number) ?? i + 1,
      code:         (r.insurance_code as string) ?? '',
      name:         (r.product_name as string) ?? '',
      ingredient:   (r.ingredient_name as string) ?? '',
      rate:         (r.commission_rate as number) ?? 0,
      distribution: (r.distribution as string) ?? '',
      note:         (r.note as string) ?? '',
    }));
  }

  // 문서 메타(다운로드 링크·기준일) + products 미적재 시 라이브 파싱 폴백
  if (latestDoc?.storage_path) {
    const needFallback = productRows.length === 0;
    const [{ data: urlData }, blobRes] = await Promise.all([
      svc.storage.from('documents').createSignedUrl(latestDoc.storage_path as string, 3600),
      needFallback ? svc.storage.from('documents').download(latestDoc.storage_path as string) : Promise.resolve({ data: null }),
    ]);
    signedUrl = urlData?.signedUrl ?? null;
    if (needFallback && blobRes.data) {
      const buf = Buffer.from(await blobRes.data.arrayBuffer());
      productRows = parseProductListBuffer(buf).map(p => ({
        no: p.no, code: p.insurance_code, name: p.product_name,
        ingredient: p.ingredient_name, rate: p.commission_rate,
        distribution: p.distribution, note: p.note,
      }));
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
