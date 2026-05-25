import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import Chat from '@/components/Chat';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[dashboard:getUser error]', userError);
  if (!user) redirect('/login');

  // role 조회 (링크 표시 여부 판단)
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single();

  const role      = myProfile?.role as string | undefined;
  const isAdmin   = role === 'admin';
  const canUpload = role === 'admin' || role === 'uploader';

  // 채팅 기록 조회
  const { data: chatHistory, error: historyError } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: true });

  if (historyError) console.error('[dashboard:chat history error]', historyError);

  const initialMessages = (chatHistory ?? []).map((row) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content as string,
  }));

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full px-4" style={{ maxWidth: '760px' }}>
        <p
          className="domain"
          style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: 'clamp(1.6rem, 5vw, 2.4rem)' }}
        >
          WHHW.co.kr
        </p>

        <div className="auth-card" style={{ marginBottom: '1.2rem' }}>
          <h1 className="auth-title">대시보드</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.8rem' }}>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{user!.email}</strong> 로 로그인됨
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
              <Link href="/visits" style={navLinkStyle('#10b981', 'rgba(16,185,129,0.12)', 'rgba(16,185,129,0.28)')}>
                방문기록 →
              </Link>
              {canUpload && (
                <Link href="/documents" style={navLinkStyle('#3b82f6', 'rgba(59,130,246,0.12)', 'rgba(59,130,246,0.28)')}>
                  문서 →
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin" style={navLinkStyle('#a259ff', 'rgba(162,89,255,0.12)', 'rgba(162,89,255,0.28)')}>
                  관리자 →
                </Link>
              )}
              <LogoutButton compact />
            </div>
          </div>
        </div>

        <Chat initialMessages={initialMessages} />
      </div>
    </>
  );
}

function navLinkStyle(color: string, bg: string, border: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '0.35rem 0.9rem',
    borderRadius: '8px',
    background: bg,
    border: `1px solid ${border}`,
    color,
    fontSize: '0.82rem',
    fontWeight: 600,
    textDecoration: 'none',
  };
}
