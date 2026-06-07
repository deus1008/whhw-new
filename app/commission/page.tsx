import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import CommissionClient from '@/components/CommissionClient';
import { getCommissionRates } from './actions';

export default async function CommissionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  const { rates, sourceFile } = await getCommissionRates();

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '1100px', padding: '2rem 1rem', minHeight: '100vh' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem,4vw,1.8rem)' }}>
          판매대행사업
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <Link href="/dashboard" style={navLink}>← 대시보드</Link>
          <LogoutButton compact />
        </div>

        {/* 헤더 */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            💰 수수료 시뮬레이션
          </h1>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            성분명 검색 → 약가 × 처방예상수량 = 처방액 → 수수료율 적용 → 정산액 산출
            {rates.length > 0
              ? <span style={{ marginLeft: '0.6rem', color: '#4ade80' }}>· {sourceFile} 기준</span>
              : <span style={{ marginLeft: '0.6rem', color: '#fbbf24' }}>· 문서관리 &gt; 수수료율 폴더에 파일을 업로드하면 수수료율이 자동 적용됩니다</span>
            }
          </p>
        </div>

        <CommissionClient initialRates={rates} sourceFile={sourceFile} />
      </div>
    </>
  );
}

const navLink: React.CSSProperties = {
  padding: '0.35rem 0.9rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none',
};
