import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/roles';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import VisitsClient from '@/components/VisitsClient';

export type VisitRecord = {
  id:             string;
  user_id:        string;
  visited_at:     string;
  customer_name:  string;
  customer_type:  'CSO법인' | '딜러';
  contact_name:   string | null;
  purpose:        string | null;
  products:       string | null;
  content:        string;
  next_action:    string | null;
  follow_up_date: string | null;
  created_at:     string;
  user_email?:    string;
  user_name?:     string;
};

export default async function VisitsPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[visits:getUser error]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const role = normalizeRole(myProfile.role);
  const isAdmin = role === '관리자' || role === '사업총괄' || role === '영업관리총괄';

  // 서비스 클라이언트로 RLS 우회 → 모든 사용자가 전체 기록 조회 가능
  const svc = createServiceClient();
  const [{ data: all }, { data: profiles }] = await Promise.all([
    svc
      .from('visit_records')
      .select('*')
      .order('visited_at', { ascending: false }),
    svc
      .from('profiles')
      .select('id, email, full_name'),
  ]);

  const profileMap: Record<string, { email: string; full_name: string | null }> =
    Object.fromEntries(
      (profiles ?? []).map(p => [p.id, { email: p.email as string, full_name: p.full_name as string | null }]),
    );

  const records: VisitRecord[] = (all ?? []).map(r => ({
    ...(r as VisitRecord),
    user_email: profileMap[r.user_id]?.email ?? r.user_id,
    user_name:  profileMap[r.user_id]?.full_name ?? undefined,
  }));

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '900px', padding: '2.5rem 1rem', minHeight: '100vh' }}>
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

        <VisitsClient
          initialRecords={records}
          userId={user.id}
          isAdmin={isAdmin}
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
