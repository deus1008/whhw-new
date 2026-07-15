export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import HomeButton from '@/components/HomeButton';
import LogoutButton from '@/components/LogoutButton';
import CompetitorIntelClient, { type Company, type Source, type Trend } from '@/components/CompetitorIntelClient';

export default async function CompetitorIntelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') redirect('/pending');
  const isAdmin = profileIsAdmin(profile);

  const svc = createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const [{ data: companies }, { data: sources }, { data: trends }] = await Promise.all([
    svc.from('competitor_companies').select('id, name, display_order').eq('active', true).order('display_order'),
    svc.from('media_sources').select('id, name, base_url, display_order').eq('active', true).order('display_order'),
    svc.from('competitor_trends')
      .select('id, company_name, trend_type, title, summary, content, source_name, url, event_date, is_field, supplement, author_id, author_name, crawled, created_at')
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(2000),
  ]);

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="relative z-10 w-full px-4" style={{ maxWidth: '1240px', paddingTop: '2.5rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.3rem, 4vw, 1.9rem)' }}>
          업계동향
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        <CompetitorIntelClient
          companies={(companies ?? []) as Company[]}
          sources={(sources ?? []) as Source[]}
          trends={(trends ?? []) as Trend[]}
          isAdmin={isAdmin}
          currentUserId={user.id}
        />
      </div>
    </>
  );
}
