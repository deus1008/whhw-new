export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { setSecurityAccess } from './actions';
import { SECURITY_META } from '@/app/meetings/types';

function svc() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  roles: string[] | null;
  status: string;
};

const LEVELS = ['내부', '기밀'] as const;

export default async function SecurityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('status, role, roles').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved' || !profileIsAdmin(profile)) redirect('/admin');

  const [{ data: profiles }, { data: accessList }] = await Promise.all([
    svc().from('profiles').select('id, email, full_name, role, roles, status').eq('status', 'approved').order('full_name'),
    svc().from('task_security_access').select('user_id, level'),
  ]);

  const accessMap = new Map<string, Set<string>>();
  for (const a of (accessList ?? [])) {
    if (!accessMap.has(a.user_id)) accessMap.set(a.user_id, new Set());
    accessMap.get(a.user_id)!.add(a.level);
  }

  const nonAdmins = (profiles ?? [] as Profile[]).filter(p => !profileIsAdmin(p));

  return (
    <>
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <div className="relative z-10 w-full px-4"
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '3rem', alignSelf: 'flex-start' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.8rem', flexWrap: 'wrap' }}>
          
          <a href="/admin" style={{ fontSize: '0.78rem', color: '#475569', textDecoration: 'none', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid #e5e9f0', background: '#f1f5f9' }}>
            ← 관리자
          </a>
          
        </div>

        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.4rem' }}>Task 보안등급 관리</h1>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1.75rem' }}>
          사용자별로 열람 가능한 보안등급을 설정합니다. 관리자는 모든 등급을 열람할 수 있습니다.
        </p>

        {/* 보안등급 안내 */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
          {(['공개', ...LEVELS] as const).map(sl => {
            const m = SECURITY_META[sl];
            return (
              <div key={sl} style={{ padding: '0.6rem 1rem', borderRadius: '10px', background: m.bg, border: `1px solid ${m.border}` }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: m.color }}>{sl}</span>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '0.15rem 0 0' }}>{m.desc}</p>
              </div>
            );
          })}
        </div>

        {/* 사용자 테이블 */}
        <div className="auth-card" style={{ padding: '0', overflow: 'hidden' }}>
          {/* 헤더 행 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 0, borderBottom: '1px solid #e5e9f0', padding: '0.65rem 1.25rem', background: '#f1f4f9' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>사용자</span>
            {LEVELS.map(lv => {
              const m = SECURITY_META[lv];
              return (
                <span key={lv} style={{ fontSize: '0.72rem', fontWeight: 700, color: m.color, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{lv}</span>
              );
            })}
          </div>

          {nonAdmins.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>승인된 일반 사용자가 없습니다.</div>
          )}

          {nonAdmins.map((p, idx) => {
            const userLevels = accessMap.get(p.id) ?? new Set<string>();
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 0, borderBottom: idx < nonAdmins.length - 1 ? '1px solid #eaeef4' : 'none', padding: '0.75rem 1.25rem', alignItems: 'center', transition: 'background 0.1s' }}>
                {/* 이름/이메일 */}
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>{p.full_name ?? '—'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.1rem' }}>{p.email}</div>
                </div>

                {/* 등급 체크박스 */}
                {LEVELS.map(lv => {
                  const checked = userLevels.has(lv);
                  const m = SECURITY_META[lv];
                  return (
                    <div key={lv} style={{ display: 'flex', justifyContent: 'center' }}>
                      <form action={setSecurityAccess}>
                        <input type="hidden" name="userId"  value={p.id} />
                        <input type="hidden" name="level"   value={lv} />
                        <input type="hidden" name="granted" value={checked ? '0' : '1'} />
                        <button type="submit"
                          style={{ width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1,
                            background: checked ? m.bg : '#f1f5f9',
                            border: checked ? `1px solid ${m.border}` : '1px solid #d7dce5',
                            color: checked ? m.color : '#cbd5e1',
                          }}
                          title={checked ? `${lv} 권한 해제` : `${lv} 권한 부여`}
                        >
                          {checked ? '✓' : ''}
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p style={{ marginTop: '1rem', fontSize: '0.72rem', color: '#94a3b8' }}>
          * 기밀 권한이 있는 사용자는 내부 등급도 자동으로 열람할 수 있습니다.
        </p>
      </div>
    </>
  );
}
