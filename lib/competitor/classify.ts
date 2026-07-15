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
    .map((it, i) => `${i}. [제목] ${it.title}\n   [본문] ${it.summary ? it.summary.slice(0, 500) : '(없음)'}`)
    .join('\n');
  const prompt =
    `다음은 제약회사 관련 뉴스 목록입니다(제목 + 본문발췌). 각 항목에 대해 두 가지를 작성하세요.\n\n` +
    `(1) type — 유형: 신제품출시 / 정책변경 / 이슈사항 / 현장동향 / 기타 중 하나\n` +
    `   신제품출시=신제품·신약 출시/발매/허가/개발, 정책변경=약가·급여·제도·규제 변화,\n` +
    `   이슈사항=소송·리콜·품절·인사·실적·계약·M&A 등, 현장동향=영업·유통·학술·행사\n\n` +
    `(2) summary — 보완설명: **제목에 이미 드러난 내용은 절대 반복하지 마세요.**\n` +
    `   제목만으로는 알 수 없는 세부사항만 60자 이내 키워드 중심으로 작성합니다.\n` +
    `   우선 포함: 구성 성분명·용량, 수치·금액·비율, 일정·기한, 계약/승인 조건·범위,\n` +
    `   적응증·대상, 배경·근거.\n` +
    `   예) 제목이 "A사, B사와 고혈압 복합제 독점 계약"이면\n` +
    `       → summary는 "텔미사르탄·암로디핀·인다파미드 3성분 단일제형, FDA 1차 요법 승인, 국내 임상·허가·상업화 포함"\n` +
    `   본문에 제목 외 추가 정보가 없으면 빈 문자열("")로 두세요.\n\n` +
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
