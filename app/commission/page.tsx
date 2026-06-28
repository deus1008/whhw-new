import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';
import CommissionClient from '@/components/CommissionClient';
import { getCommissionRates } from './actions';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function CommissionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin = normalizeRole(profile.role as string) === '관리자';
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser || isAdmin) {
    const { data: companiesData } = await getSvc()
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (companiesData ?? []) as { id: string; name: string }[];
  }

  const { rates, sourceFile } = await getCommissionRates(companyId);

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '1100px', padding: '2rem 1rem', minHeight: '100vh' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          수수료시뮬
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <AllianceCompanyBar companies={allianceCompanies} activeCompanyId={companyId} />
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            💰 수수료 시뮬레이션
          </h1>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            성분명 검색 → 약가 × 처방예상수량 = 처방액 → 수수료율 적용 → 정산액 산출
            {rates.length > 0
              ? <span style={{ marginLeft: '0.6rem', color: '#4ade80' }}>· {sourceFile} 기준</span>
              : <span style={{ marginLeft: '0.6rem', color: '#fbbf24' }}>· 문서관리 &gt; 수수료율(딜러) 폴더에 파일을 업로드/처리하면 수수료율이 자동 적용됩니다</span>
            }
          </p>
        </div>

        <CommissionClient initialRates={rates} sourceFile={sourceFile} />
      </div>
    </>
  );
}
