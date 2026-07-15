// 크롤한 뉴스 헤드라인의 동향 유형을 AI(배치)로 분류 — best-effort(실패 시 '기타').
const VALID = new Set(['신제품출시', '정책변경', '이슈사항', '현장동향', '기타']);

const BATCH = 40;

export async function classifyTrends(items: { title: string; summary?: string | null }[]): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  const out = items.map(() => '기타');
  if (!key || items.length === 0) return out;
  // 응답 토큰 초과(잘림) 방지 — 배치 분할
  for (let start = 0; start < items.length; start += BATCH) {
    const types = await classifyBatch(key, items.slice(start, start + BATCH));
    for (let j = 0; j < types.length; j++) if (types[j]) out[start + j] = types[j];
  }
  return out;
}

async function classifyBatch(key: string, items: { title: string; summary?: string | null }[]): Promise<string[]> {
  const fallback = items.map(() => '기타');
  const list = items
    .map((it, i) => `${i}. ${it.title}${it.summary ? ' — ' + it.summary.slice(0, 120) : ''}`)
    .join('\n');
  const prompt =
    `다음은 제약회사 관련 뉴스 헤드라인 목록입니다. 각 항목을 아래 5개 유형 중 하나로 분류하세요.\n` +
    `- 신제품출시: 신제품·신약 출시/발매/허가/개발\n` +
    `- 정책변경: 약가·급여·제도·규제 등 정책 변화\n` +
    `- 이슈사항: 소송·리콜·품절·인사·실적·M&A 등 이슈\n` +
    `- 현장동향: 영업·유통·학술·행사 등 현장 활동\n` +
    `- 기타: 위에 해당 없음\n\n${list}\n\n` +
    `JSON 배열로만 답하세요. 형식: [{"i":0,"type":"신제품출시"}, ...]. 설명 없이 JSON만.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? '';
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as { i: number; type: string }[];
    const out = [...fallback];
    for (const o of arr) if (typeof o.i === 'number' && o.i >= 0 && o.i < out.length && VALID.has(o.type)) out[o.i] = o.type;
    return out;
  } catch {
    return fallback;
  }
}
