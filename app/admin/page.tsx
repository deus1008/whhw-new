export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateStatus, updateRoles, updateName } from './actions';
import { ADMIN_EMAIL } from '@/lib/constants';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import { ALL_ROLES, ROLE_META, getRoles, normalizeRole, type UserRole } from '@/lib/roles';

type Status = 'pending' | 'approved' | 'rejected';
type Role   = UserRole;

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  status: Status;
  role: Role;
  roles: Role[] | null;
  created_at: string;
};

const sectionMeta: Record<Status, { label: string; color: string; rgba: string }> = {
  pending:  { label: '승인 대기', color: '#fde68a', rgba: 'rgba(251,191,36,' },
  approved: { label: '승인됨',   color: '#86efac', rgba: 'rgba(34,197,94,'  },
  rejected: { label: '거부됨',   color: '#fca5a5', rgba: 'rgba(239,68,68,'  },
};

const buttonDefs: Record<Status, [string, Status, boolean][]> = {
  pending:  [['승인', 'approved', true],  ['거부', 'rejected', false]],
  approved: [['승인 취소', 'pending', false], ['거부', 'rejected', false]],
  rejected: [['승인', 'approved', true],  ['대기로', 'pending', false]],
};

/** 역할 정렬 우선순위 (숫자가 낮을수록 상단) */
const ROLE_SORT: Record<string, number> = Object.fromEntries(
  ALL_ROLES.map((r, i) => [r, i])
);

function primaryRoleIndex(p: Profile): number {
  const roles = getRoles(p).map(r => normalizeRole(r));
  if (roles.length === 0) return 999;
  return Math.min(...roles.map(r => ROLE_SORT[r] ?? 99));
}

function sortByRole(profiles: Profile[]): Profile[] {
  return [...profiles].sort((a, b) => primaryRoleIndex(a) - primaryRoleIndex(b));
}

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLE_META[role];
  if (!meta) return null;
  const { label, color, bg, border } = meta;
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
  const effectiveRoles = getRoles(profile).map(r => normalizeRole(r) as UserRole);
  const isAdmin = effectiveRoles.includes('관리자');

  if (isAdmin) {
    return (
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        관리자 (고정)
      </span>
    );
  }

  const editableRoles = ALL_ROLES.filter(r => r !== '관리자');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {/* 상태 변경 버튼 */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {buttonDefs[profile.status].map(([label, target, isGreen]) => (
          <form key={target} action={updateStatus}>
            <input type="hidden" name="userId" value={profile.id} />
            <input type="hidden" name="status" value={target} />
            <button type="submit" style={{
              padding: '0.38rem 0.9rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              border: isGreen ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.25)',
              background: isGreen ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.09)',
              color: isGreen ? '#86efac' : '#fca5a5',
            }}>
              {label}
            </button>
          </form>
        ))}
      </div>

      {/* 역할 변경 — 체크박스 다중 선택 */}
      <form action={updateRoles} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <input type="hidden" name="userId" value={profile.id} />
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.6rem',
          padding: '0.5rem 0.7rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
        }}>
          {editableRoles.map(r => {
            const meta = ROLE_META[r];
            return (
              <label key={r} style={{
                display: 'flex', alignItems: 'center', gap: '0.28rem',
                fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
                color: effectiveRoles.includes(r) ? meta.color : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}>
                <input
                  type="checkbox"
                  name="roles"
                  value={r}
                  defaultChecked={effectiveRoles.includes(r)}
                  style={{ accentColor: meta.color, width: '13px', height: '13px', cursor: 'pointer' }}
                />
                {r}
              </label>
            );
          })}
        </div>
        <button type="submit" style={{
          alignSelf: 'flex-end',
          padding: '0.32rem 0.8rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
          cursor: 'pointer', border: '1px solid rgba(99,102,241,0.35)',
          background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
        }}>
          역할 저장
        </button>
      </form>
    </div>
  );
}

function Section({ title, profiles, status }: { title: string; profiles: Profile[]; status: Status }) {
  const { color, rgba } = sectionMeta[status];
  const sorted = sortByRole(profiles);
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

      {sorted.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{emptyMessages[status]}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sorted.map(p => {
            const effectiveRoles = getRoles(p).map(r => normalizeRole(r) as UserRole);
            return (
              <div key={p.id} style={{
                display: 'flex', flexDirection: 'column', gap: '0.5rem',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
              }}>
                {/* 이메일 + 가입일 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.82rem', wordBreak: 'break-all', color: 'var(--text-secondary)', flex: 1 }}>
                    {p.email}
                  </span>
                  <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {new Date(p.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>

                {/* 이름 입력 폼 */}
                <form action={updateName} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="hidden" name="userId" value={p.id} />
                  <input
                    type="text"
                    name="full_name"
                    defaultValue={p.full_name ?? ''}
                    placeholder="이름 입력..."
                    style={{
                      flex: 1, minWidth: 0,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '6px',
                      padding: '0.3rem 0.65rem',
                      fontSize: '0.85rem', fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                    }}
                  />
                  <button type="submit" style={{
                    padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
                  }}>저장</button>
                </form>

                {/* 역할 배지 */}
                {effectiveRoles.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {effectiveRoles.map(r => <RoleBadge key={r} role={r} />)}
                  </div>
                )}

                {/* 상태/역할 버튼 */}
                <ActionButtons profile={p} />
              </div>
            );
          })}
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

  // 관리자 확인 — role 컬럼만 조회 (대시보드와 동일한 방식)
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const isAdminUser = normalizeRole(myProfile.role as string) === '관리자';

  if (!isAdminUser) {
    redirect('/dashboard');
  }

  // 전체 프로필 조회 — roles 배열 컬럼도 시도 (마이그레이션 후 존재)
  let all: Profile[];
  const { data: profilesWithRoles, error: rolesErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, status, role, roles, created_at')
    .order('created_at', { ascending: false });

  if (rolesErr) {
    // roles/full_name 컬럼 미존재(마이그레이션 미실행) — 기본 컬럼만 fallback
    const { data: basicProfiles, error: basicErr } = await supabase
      .from('profiles')
      .select('id, email, status, role, created_at')
      .order('created_at', { ascending: false });
    if (basicErr) console.error('[admin:getProfiles error]', basicErr);
    all = (basicProfiles ?? []).map(p => ({ ...p, full_name: null, roles: null })) as Profile[];
  } else {
    all = (profilesWithRoles ?? []) as Profile[];
  }

  const pending  = all.filter(p => p.status === 'pending');
  const approved = all.filter(p => p.status === 'approved');
  const rejected = all.filter(p => p.status === 'rejected');

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full" style={{ maxWidth: '600px', padding: '2rem 1rem', minHeight: '100vh' }}>
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

        <Section title="승인 대기" profiles={pending}  status="pending"  />
        <Section title="승인됨"   profiles={approved} status="approved" />
        <Section title="거부됨"   profiles={rejected} status="rejected" />
      </div>
    </>
  );
}
