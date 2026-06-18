import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 0;

export type { CommissionDoc, CommissionFolderGroup } from './types';

export default async function CommissionRatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div style={{ padding: '2rem', color: 'white' }}>
      <h1>수수료율 — 테스트 (인증 OK)</h1>
      <p>user: {user.email}</p>
    </div>
  );
}
