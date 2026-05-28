import OpenAI from 'openai';

const BATCH_SIZE          = 20;    // TPM 한도 분산: 100 → 20 (배치당 ~13K 토큰)
const INTER_BATCH_DELAY   = 3_000; // 배치 간 대기(ms): TPM 과부하 방지
const MAX_RETRIES         = 6;

let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

// 429 응답 헤더 또는 메시지에서 retry-after(ms)를 파싱, 없으면 baseMs 반환
function parseRetryAfterMs(err: unknown, baseMs: number): number {
  if (err instanceof OpenAI.RateLimitError) {
    // "Please try again in 536ms" 패턴
    const match = /try again in (\d+(?:\.\d+)?)(m?s)/i.exec(err.message);
    if (match) {
      const value = parseFloat(match[1]);
      return match[2].toLowerCase() === 's' ? value * 1000 : value;
    }
  }
  return baseMs;
}

async function embedBatchWithRetry(
  client: OpenAI,
  texts: string[],
): Promise<number[][]> {
  let delay = 1000;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      return response.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    } catch (err) {
      const isRateLimit = err instanceof OpenAI.RateLimitError;
      if (!isRateLimit || attempt === MAX_RETRIES) throw err;

      delay = Math.max(parseRetryAfterMs(err, delay), delay);
      console.warn(
        `  [embed] 429 속도 제한 — ${delay}ms 후 재시도 (${attempt}/${MAX_RETRIES})`
      );
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 60_000); // 최대 60초
    }
  }
  throw new Error('embedBatchWithRetry: 도달할 수 없는 코드');
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client      = getClient();
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch  = texts.slice(i, i + BATCH_SIZE);
    const result = await embedBatchWithRetry(client, batch);
    embeddings.push(...result);

    // 배치 간 대기: 연속 요청으로 인한 TPM(분당 토큰) 한도 초과 방지
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, INTER_BATCH_DELAY));
    }
  }

  return embeddings;
}
