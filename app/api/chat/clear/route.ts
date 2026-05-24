import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error('[api/chat/clear DELETE error]', error);
    return Response.json(
      { error: `삭제 실패: ${error.message}` },
      { status: 500 }
    );
  }

  return new Response(null, { status: 204 });
}
