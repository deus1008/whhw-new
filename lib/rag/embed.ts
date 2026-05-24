import OpenAI from 'openai';

const BATCH_SIZE = 100; // OpenAI 권장 상한

let _client: OpenAI | null = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client      = getClient();
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch    = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    // API는 입력 순서대로 반환을 보장하지 않으므로 index로 정렬
    const sorted = response.data.sort((a, b) => a.index - b.index);
    embeddings.push(...sorted.map(d => d.embedding));
  }

  return embeddings;
}
