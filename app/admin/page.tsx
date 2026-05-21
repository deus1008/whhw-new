import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateStatus } from './actions';
import { ADMIN_EMAIL } from '@/lib/constants';
import LogoutButton from '@/components/LogoutButton';

type Status = 'pending' | 'approved' | 'rejected';

type Profile = {
  id: string;
  email: string;
  status: Status;
  created_at: string;
};

const sectionMeta: Record<Status, { label: string; color: string; rgba: string }> = {
  pending:  { label: '승인 대기', color: '#fde68a', rgba: 'rgba(251,191,36,' },
  approved: { label: '승인됨',   color: '#86efac', rgba: 'rgba(34,197,94,'  },
  rejected: { label: '거부됨',   color: '#fca5a5', rgba: 'rgba(239,68,68,'  },
};

/* 버튼 정의: [label, target status, green?] */
const buttonDefs: Record<Status, [string, Status, boolean][]> = {
  pending:  [['승인', 'approved', true],  ['거부', 'rejected', false]],
  approved: [['승인 취소', 'pending', false], ['거부', 'rejected', false]],
  rejected: [['승인', 'approved', true],  ['대기로', 'pending', false]],
};

function ActionButtons({ profile }: { profile: Profile }) {
  if (profile.email === ADMIN_EMAIL) {
    return (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        관리자
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
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
              border: isGreen
                ? '1px solid rgba(34,197,94,0.25)'
                : '1px solid rgba(239,68,68,0.22)',
              background: isGreen
                ? 'rgba(34,197,94,0.12)'
                : 'rgba(239,68,68,0.09)',
              color: isGreen ? '#86efac' : '#fca5a5',
            }}
          >
            {label}
          </button>
        </form>
      ))}
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
      <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.2rem', color, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
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
              display: 'flex', alignItems: 'center', gap: '0.75rem',
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

  if (!user || user.email !== ADMIN_EMAIL) {
    redirect('/dashboard');
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, status, created_at')
    .order('created_at', { ascending: false });

  if (profilesError) {
    console.error('[admin:getProfiles error]', profilesError);
  }

  const all = (profiles ?? []) as Profile[];
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
          WHHW.co.kr
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0 }}>
            관리자 패널 · {ADMIN_EMAIL}
          </p>
          <LogoutButton compact />
        </div>

        <Section title="승인 대기" profiles={pending}  status="pending"  />
        <Section title="승인됨"   profiles={approved} status="approved" />
        <Section title="거부됨"   profiles={rejected} status="rejected" />
      </div>
    </>
  );
}
