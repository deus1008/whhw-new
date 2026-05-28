import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import ProductsClient from '@/components/ProductsClient';

export type UpcomingProduct = {
  id:            string;
  user_id:       string;
  year_label:    string;     // 예) 26년, 27년
  launch_timing: string;     // 예) 6월, 2분기
  product_name:  string;     // 제품명
  category:      string | null;   // 계열
  ingredient:    string | null;   // 성분명
  is_priority:   boolean;         // 우선관리 표시
  memo:          string | null;
  created_at:    string;
  updated_at:    string;
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
    .order('year_label', { ascending: true })
    .order('launch_timing', { ascending: true });

  const products: UpcomingProduct[] = (data ?? []) as UpcomingProduct[];

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '1000px', padding: '2.5rem 1rem', minHeight: '100vh' }}>
        <p
          className="domain"
          style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}
        >
          판매대행사업
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <Link href="/dashboard" style={navLink}>← 대시보드</Link>
          {isAdmin && <Link href="/admin" style={navLink}>관리자 →</Link>}
          <LogoutButton compact />
        </div>

        <ProductsClient
          initialProducts={products}
          isAdmin={isAdmin}
          userId={user.id}
        />
      </div>
    </>
  );
}

const navLink: React.CSSProperties = {
  padding: '0.35rem 0.9rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none',
};
