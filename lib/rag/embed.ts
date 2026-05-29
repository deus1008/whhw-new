import OpenAI from 'openai';

/**
 * TPM(분당 토큰) 한도 1,000,000 기준 조정값
 *
 * xlsx 특성상 청크 1개 ≈ 3,000 토큰까지 커질 수 있음.
 * BATCH_SIZE=8 → 배치당 최대 ~24K 토큰, 분당 최대 8배치 → ~192K TPM (한도의 19%)
 * 여러 문서 동시 처리 시에도 여유가 생기도록 설정.
 */
const BATCH_SIZE          = 8;      // 배치 크기 (20 → 8)
const INTER_BATCH_DELAY   = 7_000;  // 배치 간 대기 ms (3s → 7s)
const MAX_RETRIES         = 8;      // 최대 재시도 횟수
const MIN_RETRY_DELAY_MS  = 15_000; // 429 후 최소 대기: 15초

let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/**
 * 429 메시지에서 retry-after(ms)를 파싱.
 * 파싱 성공 시 해당 값 + 3초 여유 반환 (동시 요청 경합 감안).
 * 파싱 실패 시 MIN_RETRY_DELAY_MS 반환.
 */
function parseRetryAfterMs(err: unknown): number {
  if (err instanceof OpenAI.RateLimitError) {
    const match = /try again in (\d+(?:\.\d+)?)(m?s)/i.exec(err.message);
    if (match) {
      const value = parseFloat(match[1]);
      const parsed = match[2].toLowerCase() === 's' ? value * 1000 : value;
      // 파싱값 + 3초 여유, 최소 MIN_RETRY_DELAY_MS
      return Math.max(parsed + 3_000, MIN_RETRY_DELAY_MS);
    }
  }
  return MIN_RETRY_DELAY_MS;
}

async function embedBatchWithRetry(
  client: OpenAI,
  texts: string[],
): Promise<number[][]> {
  let delay = MIN_RETRY_DELAY_MS;

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

      // 429: retry-after 기반 대기 (최소 15초)
      delay = Math.max(parseRetryAfterMs(err), delay);
      console.warn(
        `[embed] 429 TPM 초과 — ${(delay / 1000).toFixed(1)}초 후 재시도 (${attempt}/${MAX_RETRIES})`
      );
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 1.5, 60_000); // 1.5배 증가, 최대 60초
    }
  }
  throw new Error('embedBatchWithRetry: 최대 재시도 횟수 초과');
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client     = getClient();
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch  = texts.slice(i, i + BATCH_SIZE);
    const result = await embedBatchWithRetry(client, batch);
    embeddings.push(...result);

    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, INTER_BATCH_DELAY));
    }
  }

  return embeddings;
}
