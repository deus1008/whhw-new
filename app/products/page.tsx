import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import ProductsClient from '@/components/ProductsClient';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';

export type UpcomingProduct = {
  id:              string;
  title:           string;           // 제품명
  launch_date:     string | null;    // 발매(예정)일 YYYY-MM-DD
  manufacturer:    string | null;    // 제조사/위탁사
  indication:      string | null;    // 계열/적응증
  insurance_price: string | null;    // 보험가
  insurance_code:  string | null;    // 보험코드
  status:          string | null;    // 진행상태
  memo:            string | null;    // 비고 (성분명 등)
  created_at:      string;
  updated_at:      string;
};

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[products:getUser error]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const role = normalizeRole(myProfile.role);
  const isAdmin = role === '관리자' || role === '마케팅총괄' || role === 'PM'; // 편집 권한용
  const isSystemAdmin = role === '관리자'; // 데이터 필터 우회용

  const profileCompanyId = (myProfile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isSystemAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isSystemAdmin);

  // 아주얼라이언스 직원이 위탁사를 선택하지 않은 경우 대시보드로 이동 (선택 모달 안내)
  if (isAllianceUser && !companyId) redirect('/');

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 아주얼라이언스 직원/관리자용 위탁사 목록
  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isSystemAdmin) {
    const { data: companiesData } = await sb
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (companiesData ?? []) as { id: string; name: string }[];
  }

  // 보안 단계(개발검토·개발승인·허가예정)는 시스템 관리자만 열람.
  // 일반 사용자(마케팅총괄·PM 포함)는 발매예정·발매완료만 — 서버에서 차단.
  const PUBLIC_STATUSES = ['발매예정', '발매완료'];

  let productsQ = sb.from('upcoming_products').select('*').order('launch_date', { ascending: true });
  if (companyId) productsQ = productsQ.eq('company_id', companyId);
  if (!isSystemAdmin) productsQ = productsQ.in('status', PUBLIC_STATUSES);
  const { data, error: fetchError } = await productsQ;

  if (fetchError) console.error('[products] fetch error:', fetchError.message);
  const products: UpcomingProduct[] = (data ?? []) as UpcomingProduct[];

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '1200px', padding: '2.5rem 1rem', minHeight: '100vh' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          발매예정품목
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isSystemAdmin) && (
          <AllianceCompanyBar
            companies={allianceCompanies}
            activeCompanyId={companyId}
          />
        )}

        <ProductsClient initialProducts={products} isAdmin={isAdmin} canSeeSecure={isSystemAdmin} userId={user.id} />
      </div>
    </>
  );
}
