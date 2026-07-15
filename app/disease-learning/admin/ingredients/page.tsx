export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import IngredientReviewClient from '@/components/IngredientReviewClient';

export default async function IngredientReviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');
  if (!profileIsAdmin(profile)) redirect('/disease-learning');

  const svc = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: rows } = await svc
    .from('ingredient_info')
    .select('ingredient_name, description, drug_class, grounded, permit_samples, reviewed')
    .order('ingredient_name');

  // 질환군/중분류를 붙여 어느 메뉴에서 쓰이는 성분인지 보이게 한다
  const { data: dd } = await svc
    .from('disease_drugs').select('ingredient_name, disease_group, sub_category').limit(20000);
  const ctx = new Map<string, string>();
  for (const r of dd ?? []) {
    const k = String(r.ingredient_name ?? '').trim();
    if (!k || ctx.has(k)) continue;
    ctx.set(k, [r.disease_group, r.sub_category].filter(Boolean).join(' › '));
  }

  const items = (rows ?? []).map(r => ({
    ingredient: String(r.ingredient_name),
    description: String(r.description ?? ''),
    drugClass: (r.drug_class as string | null) ?? '',
    grounded: Boolean(r.grounded),
    permitSamples: Number(r.permit_samples ?? 0),
    reviewed: Boolean(r.reviewed),
    context: ctx.get(String(r.ingredient_name)) ?? '',
  }));

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '1100px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.2rem, 4vw, 1.8rem)' }}>
          성분 설명 검수
        </p>
        <div className="page-nav">
          <HomeButton />
          <Link href="/disease-learning" style={{
            padding: '0.4rem 0.9rem', borderRadius: '8px', textDecoration: 'none',
            background: 'rgba(147,197,253,0.12)', border: '1px solid rgba(147,197,253,0.28)',
            color: '#93c5fd', fontSize: '0.82rem', fontWeight: 600,
          }}>질환학습</Link>
          <LogoutButton compact />
        </div>

        <IngredientReviewClient items={items} />
      </div>
    </>
  );
}
