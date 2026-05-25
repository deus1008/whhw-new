import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import Chat from '@/components/Chat';

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) console.error('[chat:getUser error]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  // 채팅 기록 조회
  const { data: chatHistory, error: historyError } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (historyError) console.error('[chat:history error]', historyError);

  const initialMessages = (chatHistory ?? []).map(row => ({
    role:    row.role    as 'user' | 'assistant',
    content: row.content as string,
  }));

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full px-4" style={{ maxWidth: '760px', paddingTop: '2rem', paddingBottom: '2rem' }}>
        <p
          className="domain"
          style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}
        >
          판매대행사업
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '0.7rem', marginBottom: '1.6rem', flexWrap: 'wrap',
        }}>
          <HomeButton />
          <Link href="/dashboard" style={navLink}>← 대시보드</Link>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {user.email}
          </span>
          <LogoutButton compact />
        </div>

        <Chat initialMessages={initialMessages} />
      </div>
    </>
  );
}

const navLink: React.CSSProperties = {
  padding: '0.35rem 0.9rem', borderRadius: '8px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none',
};
