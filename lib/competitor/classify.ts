// 크롤한 뉴스를 AI(배치)로 (1) 동향 유형 분류 + (2) 핵심 키워드 요약 — best-effort.
const VALID = new Set(['신제품출시', '정책변경', '이슈사항', '현장동향', '기타']);
const BATCH = 25;

export type Classified = { type: string; summary: string };

export async function classifyTrends(items: { title: string; summary?: string | null }[]): Promise<Classified[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  const out: Classified[] = items.map(() => ({ type: '기타', summary: '' }));
  if (!key || items.length === 0) return out;
  for (let start = 0; start < items.length; start += BATCH) {
    const res = await classifyBatch(key, items.slice(start, start + BATCH));
    for (let j = 0; j < res.length; j++) if (res[j]) out[start + j] = res[j];
  }
  return out;
}

async function classifyBatch(key: string, items: { title: string; summary?: string | null }[]): Promise<Classified[]> {
  const fallback: Classified[] = items.map(() => ({ type: '기타', summary: '' }));
  const list = items
    .map((it, i) => `${i}. ${it.title}${it.summary ? ' | ' + it.summary.slice(0, 220) : ''}`)
    .join('\n');
  const prompt =
    `다음은 제약회사 관련 뉴스 목록입니다. 각 항목에 대해 두 가지를 작성하세요.\n` +
    `(1) 유형: 신제품출시 / 정책변경 / 이슈사항 / 현장동향 / 기타 중 하나\n` +
    `   - 신제품출시=신제품·신약 출시/발매/허가/개발, 정책변경=약가·급여·제도·규제 변화,\n` +
    `     이슈사항=소송·리콜·품절·인사·실적·계약·M&A 등, 현장동향=영업·유통·학술·행사\n` +
    `(2) 요약: 주요 내용을 키워드 중심으로 40자 이내 한 줄 요약(회사·제품·성분·수치·계약 등 핵심만, 서술형 지양)\n\n` +
    `${list}\n\n` +
    `JSON 배열로만 답하세요. 형식: [{"i":0,"type":"신제품출시","summary":"…"}]. 설명 없이 JSON만.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? '';
    const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as { i: number; type: string; summary?: string }[];
    const out = [...fallback];
    for (const o of arr) {
      if (typeof o.i !== 'number' || o.i < 0 || o.i >= out.length) continue;
      out[o.i] = {
        type: VALID.has(o.type) ? o.type : '기타',
        summary: (o.summary ?? '').toString().trim().slice(0, 120),
      };
    }
    return out;
  } catch {
    return fallback;
  }
}
