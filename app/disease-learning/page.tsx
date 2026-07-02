import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';

import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import DiseaseLearningClient from '@/components/DiseaseLearningClient';

export const dynamic = 'force-dynamic';

export default async function DiseaseLearningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, company_id')
    .eq('id', user.id)
    .single();
  if (!profile || profile.status !== 'approved') redirect('/pending');

  const isAdmin = profileIsAdmin(profile);

  const svc = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 질환군 목록 (서버 사이드)
  const { data: rawGroups } = await svc
    .from('disease_drugs')
    .select('disease_group, sub_category')
    .not('disease_group', 'is', null)
    .order('disease_group')
    .order('sub_category');

  const treeMap = new Map<string, Set<string>>();
  for (const r of rawGroups ?? []) {
    const g = (r.disease_group as string).trim();
    const s = (r.sub_category as string | null)?.trim() ?? '';
    if (!treeMap.has(g)) treeMap.set(g, new Set());
    if (s) treeMap.get(g)!.add(s);
  }

  const groups = Array.from(treeMap.entries()).map(([group, subs]) => ({
    group,
    subs: Array.from(subs).sort(),
  }));

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '1100px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          질환학습
        </p>
        <div className="page-nav">
          <HomeButton />
          <Link href="/drug-search" style={nl('#6ee7b7', 'rgba(52,211,153,0.12)', 'rgba(52,211,153,0.28)')}>약품검색</Link>
          <Link href="/market-analysis" style={nl('#f9a8d4', 'rgba(236,72,153,0.12)', 'rgba(236,72,153,0.28)')}>시장분석</Link>
          {isAdmin && (
            <Link href="/disease-learning/admin" style={nl('#fde68a', 'rgba(251,191,36,0.12)', 'rgba(251,191,36,0.28)')}>데이터관리</Link>
          )}
          <LogoutButton compact />
        </div>

        {groups.length === 0 ? (
          <div style={{
            marginTop: '3rem', padding: '3rem 2rem', textAlign: 'center',
            background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
            border: '1px dashed rgba(255,255,255,0.12)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📋</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
              질환 데이터가 없습니다.
            </p>
            {isAdmin ? (
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem' }}>
                <Link href="/disease-learning/admin" style={{ color: '#fbbf24', textDecoration: 'none' }}>
                  데이터관리 → 질환DB 임포트
                </Link>
                를 먼저 실행해주세요.
              </p>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem' }}>
                관리자에게 데이터 임포트를 요청해주세요.
              </p>
            )}
          </div>
        ) : (
          <DiseaseLearningClient groups={groups} />
        )}
      </div>
    </>
  );
}

function nl(color: string, bg: string, border: string): React.CSSProperties {
  return {
    padding: '0.4rem 0.9rem', borderRadius: '8px', textDecoration: 'none',
    background: bg, border: `1px solid ${border}`,
    color, fontSize: '0.82rem', fontWeight: 600,
  };
}
