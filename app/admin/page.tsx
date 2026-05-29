import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateStatus, updateRole } from './actions';
import { ADMIN_EMAIL } from '@/lib/constants';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import DrugPriceUpload from '@/components/DrugPriceUpload';

type Status = 'pending' | 'approved' | 'rejected';
type Role   = 'admin' | 'uploader' | 'member';

type Profile = {
  id: string;
  email: string;
  status: Status;
  role: Role;
  created_at: string;
};

const sectionMeta: Record<Status, { label: string; color: string; rgba: string }> = {
  pending:  { label: '승인 대기', color: '#fde68a', rgba: 'rgba(251,191,36,' },
  approved: { label: '승인됨',   color: '#86efac', rgba: 'rgba(34,197,94,'  },
  rejected: { label: '거부됨',   color: '#fca5a5', rgba: 'rgba(239,68,68,'  },
};

const roleMeta: Record<Role, { label: string; color: string; bg: string; border: string }> = {
  admin:    { label: '관리자',  color: '#c084fc', bg: 'rgba(162,89,255,0.13)', border: 'rgba(162,89,255,0.28)' },
  uploader: { label: '업로더',  color: '#93c5fd', bg: 'rgba(59,130,246,0.13)', border: 'rgba(59,130,246,0.28)' },
  member:   { label: '멤버',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)' },
};

const buttonDefs: Record<Status, [string, Status, boolean][]> = {
  pending:  [['승인', 'approved', true],  ['거부', 'rejected', false]],
  approved: [['승인 취소', 'pending', false], ['거부', 'rejected', false]],
  rejected: [['승인', 'approved', true],  ['대기로', 'pending', false]],
};

function RoleBadge({ role }: { role: Role }) {
  const { label, color, bg, border } = roleMeta[role];
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: '100px',
      fontSize: '0.7rem',
      fontWeight: 600,
      letterSpacing: '0.03em',
      color,
      background: bg,
      border: `1px solid ${border}`,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function ActionButtons({ profile }: { profile: Profile }) {
  // admin 역할 행: 상태/역할 변경 버튼 없음
  if (profile.role === 'admin') {
    return (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', flexShrink: 0 }}>
        관리자 (고정)
      </span>
    );
  }

  const nextRole: Role = profile.role === 'uploader' ? 'member' : 'uploader';
  const roleLabel = profile.role === 'uploader' ? '업로더 해제' : '업로더로 지정';

  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flexShrink: 0 }}>
      {/* 상태 변경 */}
      {buttonDefs[profile.status].map(([label, target, isGreen]) => (
        <form key={target} action={updateStatus}>
          <input type="hidden" name="userId" value={profile.id} />
          <input type="hidden" name="status" value={target} />
          <button
            type="submit"
            style={{
              padding: '0.35rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: isGreen ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.22)',
              background: isGreen ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.09)',
              color: isGreen ? '#86efac' : '#fca5a5',
            }}
          >
            {label}
          </button>
        </form>
      ))}

      {/* 역할 변경 */}
      <form action={updateRole}>
        <input type="hidden" name="userId" value={profile.id} />
        <input type="hidden" name="role" value={nextRole} />
        <button
          type="submit"
          style={{
            padding: '0.35rem 0.8rem',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid rgba(59,130,246,0.25)',
            background: 'rgba(59,130,246,0.1)',
            color: '#93c5fd',
          }}
        >
          {roleLabel}
        </button>
      </form>
    </div>
  );
}

function Section({ title, profiles, status }: { title: string; profiles: Profile[]; status: Status }) {
  const { color, rgba } = sectionMeta[status];
  const emptyMessages: Record<Status, string> = {
    pending:  '대기 중인 사용자가 없습니다.',
    approved: '승인된 사용자가 없습니다.',
    rejected: '거부된 사용자가 없습니다.',
  };

  return (
    <div className="auth-card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{
        fontSize: '1rem', fontWeight: 700, marginBottom: '1.2rem',
        color, letterSpacing: '0.02em',
        display: 'flex', alignItems: 'center', gap: '0.6rem',
      }}>
        {title}
        <span style={{
          background: `${rgba}0.13)`,
          border: `1px solid ${rgba}0.28)`,
          borderRadius: '100px',
          padding: '2px 10px',
          fontSize: '0.73rem',
          fontWeight: 600,
          color,
        }}>
          {profiles.length}
        </span>
      </h2>

      {profiles.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{emptyMessages[status]}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {profiles.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              flexWrap: 'wrap',
            }}>
              <span style={{ flex: 1, fontSize: '0.88rem', wordBreak: 'break-all', color: 'var(--text-primary)', minWidth: '140px' }}>
                {p.email}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {new Date(p.created_at).toLocaleDateString('ko-KR')}
              </span>
              <RoleBadge role={p.role} />
              <ActionButtons profile={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    console.error('[admin:getUser error]', userError);
  }

  if (!user) redirect('/login');

  // role 기반 관리자 확인
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.role !== 'admin') {
    redirect('/dashboard');
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, status, role, created_at')
    .order('created_at', { ascending: false });

  if (profilesError) {
    console.error('[admin:getProfiles error]', profilesError);
  }

  const all      = (profiles ?? []) as Profile[];
  const pending  = all.filter(p => p.status === 'pending');
  const approved = all.filter(p => p.status === 'approved');
  const rejected = all.filter(p => p.status === 'rejected');

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '720px', padding: '2.5rem 1rem', minHeight: '100vh' }}>
        <p
          className="domain"
          style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}
        >
          판매대행사업
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0 }}>
            관리자 패널 · {ADMIN_EMAIL}
          </p>
          <Link
            href="/documents"
            style={{
              padding: '0.3rem 0.8rem', borderRadius: '7px',
              background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.28)',
              color: '#93c5fd', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none',
            }}
          >
            문서 →
          </Link>
          <LogoutButton compact />
        </div>

        <DrugPriceUpload />

        <Section title="승인 대기" profiles={pending}  status="pending"  />
        <Section title="승인됨"   profiles={approved} status="approved" />
        <Section title="거부됨"   profiles={rejected} status="rejected" />
      </div>
    </>
  );
}
