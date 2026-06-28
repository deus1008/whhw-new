export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
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

      {/* 상태 액션 버튼 — 현재 status에 따라 조건부 렌더링 */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {/* pending: 승인 + 거부 */}
        {profile.status === 'pending' && (
          <form action={updateStatus}>
            <input type="hidden" name="userId" value={profile.id} />
            <input type="hidden" name="status" value="approved" />
            <button type="submit" style={{
              padding: '0.38rem 0.9rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.12)', color: '#86efac',
            }}>
              승인
            </button>
          </form>
        )}
        {/* approved: 승인 취소 */}
        {profile.status === 'approved' && (
          <form action={updateStatus}>
            <input type="hidden" name="userId" value={profile.id} />
            <input type="hidden" name="status" value="pending" />
            <button type="submit" style={{
              padding: '0.38rem 0.9rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.09)', color: '#fca5a5',
            }}>
              승인 취소
            </button>
          </form>
        )}
        {/* rejected: 대기로 복원 */}
        {profile.status === 'rejected' && (
          <form action={updateStatus}>
            <input type="hidden" name="userId" value={profile.id} />
            <input type="hidden" name="status" value="pending" />
            <button type="submit" style={{
              padding: '0.38rem 0.9rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.09)', color: '#fde68a',
            }}>
              대기로
            </button>
          </form>
        )}
        {/* 거부 — rejected 아닐 때만 */}
        {profile.status !== 'rejected' && (
          <form action={updateStatus}>
            <input type="hidden" name="userId" value={profile.id} />
            <input type="hidden" name="status" value="rejected" />
            <button type="submit" style={{
              padding: '0.38rem 0.9rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.09)', color: '#fca5a5',
            }}>
              거부
            </button>
          </form>
        )}
      </div>
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

  /* ── 활동 통계 데이터 ── */
  const adminSvc = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const now           = new Date();
  const todayStart    = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 86_400_000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [authResp, visitResp, docResp, scheduleResp, contractResp] = await Promise.all([
    adminSvc.auth.admin.listUsers({ perPage: 1000 }),
    adminSvc.from('visit_records').select('user_id').gte('visited_at', thirtyDaysAgo),
    adminSvc.from('documents').select('uploaded_by').gte('created_at', thirtyDaysAgo),
    adminSvc.from('marketing_schedules').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    adminSvc.from('new_contracts').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
  ]);

  const authUsers     = authResp.data?.users ?? [];
  const lastSignInMap = new Map(authUsers.map(u => [u.id, u.last_sign_in_at as string | null]));

  const visitMap = new Map<string, number>();
  for (const v of visitResp.data ?? []) visitMap.set(v.user_id, (visitMap.get(v.user_id) ?? 0) + 1);

  const docMap = new Map<string, number>();
  for (const d of docResp.data ?? []) if (d.uploaded_by) docMap.set(d.uploaded_by, (docMap.get(d.uploaded_by) ?? 0) + 1);

  const loggedInToday  = authUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at >= todayStart).length;
  const loggedIn7Days  = authUsers.filter(u => u.last_sign_in_at && u.last_sign_in_at >= sevenDaysAgo).length;
  const totalVisits30d = visitResp.data?.length ?? 0;
  const totalDocs30d   = docResp.data?.length ?? 0;

  /* ── 페이지별 활동량 (상위 3) ── */
  const pageStats = [
    { label: '방문관리',    path: '/visits',   count: visitResp.data?.length ?? 0,    color: '#fde68a' },
    { label: '마케팅 일정', path: '/calendar', count: scheduleResp.count ?? 0,         color: '#86efac' },
    { label: '문서관리',    path: '/documents', count: docResp.data?.length ?? 0,      color: '#93c5fd' },
    { label: '계약관리',    path: '/contracts', count: contractResp.count ?? 0,         color: '#c4b5fd' },
  ].sort((a, b) => b.count - a.count).slice(0, 3);
  const maxPageCount = pageStats[0]?.count || 1;

  const approvedSorted = [...approved].sort((a, b) => {
    const aS = lastSignInMap.get(a.id) ?? '';
    const bS = lastSignInMap.get(b.id) ?? '';
    return bS.localeCompare(aS);
  });

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
          관리자
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {/* 관리 도구 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
        }}>
          <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 0.65rem' }}>관리 도구</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/admin/customer-aliases" style={{
              padding: '0.48rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
              background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
              color: '#fde68a', textDecoration: 'none',
            }}>🔗 거래처 별칭 매핑</Link>
          </div>
        </div>

        {/* ── 사용자 활동 통계 ── */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
        }}>
          <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 0.85rem' }}>
            사용자 활동 통계
          </p>

          {/* 요약 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
            {([
              { label: '승인된 사용자',  value: approved.length, color: '#86efac' },
              { label: '오늘 로그인',    value: loggedInToday,   color: '#4ade80' },
              { label: '7일 내 로그인',  value: loggedIn7Days,   color: '#93c5fd' },
              { label: '30일 방문 입력', value: totalVisits30d,  color: '#fde68a' },
              { label: '30일 문서 업로드', value: totalDocs30d,  color: '#c4b5fd' },
              { label: '대기 중',        value: pending.length,  color: '#fb923c' },
            ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px', padding: '0.65rem 0.85rem',
              }}>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* 페이지별 활동 TOP 3 */}
          <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0.85rem 0 0.55rem' }}>
            페이지별 활동 (최근 30일 · 상위 3)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1rem' }}>
            {pageStats.map(({ label, count, color }, rank) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: 14, textAlign: 'right', flexShrink: 0 }}>{rank + 1}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, width: 80, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(count / maxPageCount * 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: '0.73rem', fontWeight: 700, color, width: 40, textAlign: 'right', flexShrink: 0 }}>{count.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* 사용자별 활동 테이블 */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
                  {(['이름', '마지막 로그인', '방문(30일)', '문서(30일)'] as const).map((h, i) => (
                    <th key={h} style={{
                      padding: '0.4rem 0.55rem', fontSize: '0.68rem', fontWeight: 600,
                      color: 'var(--text-muted)', textAlign: i === 0 ? 'left' : 'right',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {approvedSorted.map((p, ni) => {
                  const lastSignIn  = lastSignInMap.get(p.id);
                  const signInDate  = lastSignIn ? new Date(lastSignIn) : null;
                  const isToday     = signInDate && signInDate.toISOString() >= todayStart;
                  const isThisWeek  = signInDate && signInDate.toISOString() >= sevenDaysAgo;
                  const visits      = visitMap.get(p.id) ?? 0;
                  const docs        = docMap.get(p.id) ?? 0;
                  const signInLabel = signInDate
                    ? isToday
                      ? `오늘 ${signInDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                      : signInDate.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
                    : '—';
                  return (
                    <tr key={p.id} style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: ni % 2 ? 'rgba(255,255,255,0.01)' : undefined,
                    }}>
                      <td style={{ padding: '0.45rem 0.55rem', fontWeight: 600, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.full_name ?? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{p.email.split('@')[0]}</span>}
                      </td>
                      <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.73rem',
                        color: isToday ? '#4ade80' : isThisWeek ? '#93c5fd' : 'var(--text-muted)' }}>
                        {signInLabel}
                      </td>
                      <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right', fontWeight: visits > 0 ? 700 : undefined,
                        color: visits > 0 ? '#fde68a' : 'var(--text-muted)' }}>
                        {visits > 0 ? visits : '—'}
                      </td>
                      <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right', fontWeight: docs > 0 ? 700 : undefined,
                        color: docs > 0 ? '#c4b5fd' : 'var(--text-muted)' }}>
                        {docs > 0 ? docs : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Section title="승인 대기" profiles={pending}  status="pending"  />
        <Section title="승인됨"   profiles={approved} status="approved" />
        <Section title="거부됨"   profiles={rejected} status="rejected" />
      </div>
    </>
  );
}
