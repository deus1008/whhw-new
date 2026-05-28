import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import ProductsClient from '@/components/ProductsClient';

export type DateEntry = { date: string; note: string };

export type UpcomingProduct = {
  id:             string;
  user_id:        string;
  ingredient:     string;           // 성분명 (필수)
  product_name:   string | null;    // 품목명
  approval_dates: DateEntry[];      // 허가(예정)일 이력
  launch_dates:   DateEntry[];      // 발매(예정)일 이력
  product_type:   string;           // 자사 / 위탁
  contractor:     string | null;    // 위탁사
  indication:     string | null;    // 적응증/효능효과
  expected_price: string | null;    // (예상)약가
  status:         string | null;    // 진행상태
  memo:           string | null;
  is_priority:    boolean;
  created_at:     string;
  updated_at:     string;
};

export default async function ProductsPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[products:getUser error]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const isAdmin = myProfile.role === 'admin';

  const { data } = await supabase
    .from('upcoming_products')
    .select('*')
    .order('created_at', { ascending: true });

  const products: UpcomingProduct[] = (data ?? []) as UpcomingProduct[];

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '1200px', padding: '2.5rem 1rem', minHeight: '100vh' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          판매대행사업
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <Link href="/dashboard" style={navLink}>← 대시보드</Link>
          {isAdmin && <Link href="/admin" style={navLink}>관리자 →</Link>}
          <LogoutButton compact />
        </div>

        <ProductsClient initialProducts={products} isAdmin={isAdmin} userId={user.id} />
      </div>
    </>
  );
}

const navLink: React.CSSProperties = {
  padding: '0.35rem 0.9rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none',
};
