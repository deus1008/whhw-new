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

  const BASE_PROMPT =
    `당신은 판매대행사업의 AI 어시스턴트입니다.\n` +
    `[답변 원칙]\n` +
    `1. 아래 참고 문서를 최우선으로 활용하여 종합적으로 답변하세요.\n` +
    `2. 참고 문서 내용이 있으면 반드시 문서 내용을 먼저 정리·인용한 후 답변하세요.\n` +
    `3. 여러 문서에 관련 내용이 흩어져 있으면 모두 종합하여 하나의 답변으로 정리하세요.\n` +
    `4. 문서 내용으로 부족한 부분은 일반 지식으로 보완하세요.\n` +
    `5. 문서에 전혀 관련 내용이 없을 때만 "업로드된 문서에는 관련 내용이 없어 일반 지식으로 답변합니다"라고 먼저 안내하세요.\n` +
    `6. 출처 파일명은 괄호로 표기하세요. 예: (CSO동향_26.05.xlsx)\n`;

  let systemPrompt = BASE_PROMPT +
    `\n업로드된 문서에 관련 내용이 없으면 일반 지식으로 친절하게 답변해 주세요.`;

  if (latestUserQuery) {
    try {
      // 유사도 0.03 이상인 청크를 최대 200개 수집 (임의 상한 없음)
      const rawChunks = await searchDocuments(latestUserQuery);

      if (rawChunks.length > 0) {
        // 문서 ID → 메타 정보 매핑 (파일명 + 폴더명)
        const docIds = [...new Set(rawChunks.map(c => c.document_id))];
        const { data: docRows } = await supabase
          .from('documents')
          .select('id, filename, category')
          .in('id', docIds);
        const docMeta = Object.fromEntries(
          (docRows ?? []).map(d => [
            d.id,
            {
              filename: d.filename as string,
              category: d.category as string | null,
            },
          ])
        );

        // ── 전 문서 포함 전략 ──────────────────────────────────────────────
        // rawChunks 는 유사도 내림차순 정렬 (DB 반환 기준)
        //
        // 규칙:
        //  - 모든 문서에서 최소 1개 청크 반드시 포함 (best chunk per doc)
        //  - 유사도 0.25 이상인 문서는 추가 청크 포함 (최대 5개/문서)
        //  → 인위적인 총 개수 상한 없음 — 문서 수에 따라 자연스럽게 확장
        const HIGH_RELEVANCE_THRESHOLD = 0.25;
        const MAX_EXTRA_PER_DOC        = 5;   // 고관련 문서 추가 허용 청크

        const docChunksSeen: Record<string, number> = {};
        const finalChunks = rawChunks.filter(c => {
          const seen    = docChunksSeen[c.document_id] ?? 0;
          const isFirst = seen === 0; // 무조건 첫 청크(최고유사도) 포함
          const isExtra = c.similarity >= HIGH_RELEVANCE_THRESHOLD
                          && seen < MAX_EXTRA_PER_DOC;

          if (isFirst || isExtra) {
            docChunksSeen[c.document_id] = seen + 1;
            return true;
          }
          return false;
        });

        const contextBlocks = finalChunks.map((c, i) => {
          const meta   = docMeta[c.document_id];
          const name   = meta?.filename ?? c.document_id;
          const folder = meta?.category ? ` [폴더: ${meta.category}]` : '';
          const sim    = (c.similarity * 100).toFixed(0);
          return `[${i + 1}] 출처: ${name}${folder} (관련도: ${sim}%)\n${c.content}`;
        });

        systemPrompt =
          BASE_PROMPT +
          `\n=== 참고 문서 (총 ${finalChunks.length}개 청크 / ${docIds.length}개 파일 참조) ===\n` +
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
