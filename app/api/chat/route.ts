import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { searchDocuments } from '@/lib/rag/search';

export const dynamic = 'force-dynamic';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[api/chat GET error]', error);
    return Response.json(
      { error: `메시지 조회 실패: ${error.message}` },
      { status: 500 }
    );
  }

  return Response.json({ messages: data ?? [] });
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  let messages: Message[];
  try {
    const body = await request.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('messages 배열이 필요합니다.');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '잘못된 요청 형식입니다.';
    return Response.json({ error: msg }, { status: 400 });
  }

  // 사용자 메시지 저장 (마지막 항목)
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role === 'user') {
    const { error: saveErr } = await supabase
      .from('chat_messages')
      .insert({ user_id: user.id, role: 'user', content: lastMsg.content });
    if (saveErr) console.error('[api/chat save user msg error]', saveErr);
  }

  // RAG: 최신 사용자 메시지로 관련 문서 검색
  const latestUserQuery = messages.filter(m => m.role === 'user').at(-1)?.content ?? '';
  let systemPrompt =
    '당신은 WHHW.co.kr의 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변해 주세요.';

  if (latestUserQuery) {
    try {
      const chunks = await searchDocuments(latestUserQuery);

      if (chunks.length > 0) {
        // 문서 ID → 파일명 매핑
        const docIds = [...new Set(chunks.map(c => c.document_id))];
        const { data: docRows } = await supabase
          .from('documents')
          .select('id, filename')
          .in('id', docIds);
        const filenameMap = Object.fromEntries(
          (docRows ?? []).map(d => [d.id, d.filename as string])
        );

        const contextBlocks = chunks.map((c, i) => {
          const name = filenameMap[c.document_id] ?? c.document_id;
          return `[${i + 1}] 출처: ${name}\n${c.content}`;
        });

        systemPrompt =
          `당신은 WHHW.co.kr의 AI 어시스턴트입니다.\n` +
          `아래 참고 문서를 바탕으로 사용자의 질문에 답하세요.\n` +
          `문서에 관련 내용이 없으면, 일반 지식으로 답변하되 ` +
          `"업로드된 문서에서는 관련 내용을 찾지 못했습니다"라고 먼저 안내해 주세요.\n\n` +
          `=== 참고 문서 ===\n` +
          contextBlocks.join('\n\n');
      }
    } catch (err) {
      console.error('[api/chat RAG error]', err);
      // RAG 실패해도 일반 답변으로 계속
    }
  }

  const anthropicClient = new Anthropic({ apiKey });
  const userId = user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = '';
      try {
        const anthropicStream = await anthropicClient.messages.stream({
          model: 'claude-opus-4-7',
          max_tokens: 4096,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            fullText += chunk.delta.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
            );
          }
        }

        if (fullText) {
          const { error: saveErr } = await supabase
            .from('chat_messages')
            .insert({ user_id: userId, role: 'assistant', content: fullText });
          if (saveErr) console.error('[api/chat save assistant msg error]', saveErr);
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        console.error('[api/chat stream error]', err);
        const msg =
          err instanceof Anthropic.APIError
            ? `Anthropic API 오류 (${err.status}): ${err.message}`
            : err instanceof Error
            ? err.message
            : '알 수 없는 오류가 발생했습니다.';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
