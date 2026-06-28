import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import ProductsClient from '@/components/ProductsClient';

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
  const isAdmin = role === '관리자' || role === '마케팅총괄' || role === 'PM';
  const companyId = (myProfile.company_id as string) ?? null;

  // 서비스 롤 클라이언트로 RLS 우회 (발매예정 목록은 승인 멤버 전체 공개)
  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  let productsQ = sb.from('upcoming_products').select('*').order('launch_date', { ascending: true });
  if (companyId) productsQ = productsQ.eq('company_id', companyId);
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

        <ProductsClient initialProducts={products} isAdmin={isAdmin} userId={user.id} />
      </div>
    </>
  );
}

