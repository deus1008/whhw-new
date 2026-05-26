import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { embedTexts } from './embed';

const DEFAULT_SIMILARITY_THRESHOLD =
  Number(process.env.RAG_SIMILARITY_THRESHOLD ?? 0.03); // 매우 낮게 설정 → 모든 업로드 문서 포함
const DEFAULT_MATCH_COUNT =
  Number(process.env.RAG_MATCH_COUNT ?? 200); // 충분히 크게 → 문서당 여러 청크 수집 가능

export type SearchResult = {
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 누락되었습니다.');
  return createSupabaseClient(url, key);
}

export async function searchDocuments(
  query: string,
  matchCount = DEFAULT_MATCH_COUNT,
  similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
): Promise<SearchResult[]> {
  const supabase = createServiceClient();

  const [queryEmbedding] = await embedTexts([query]);
  if (!queryEmbedding || queryEmbedding.length !== 1536) {
    throw new Error(`임베딩 길이 이상: ${queryEmbedding?.length} (기대값: 1536)`);
  }

  const embeddingJson =
    '[' + queryEmbedding.map(n => String(parseFloat(n.toFixed(9)))).join(',') + ']';

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding:      embeddingJson,
    match_count:          matchCount,
    similarity_threshold: similarityThreshold,
  });

  if (error) throw new Error(`벡터 검색 실패: ${error.message}`);
  return (data ?? []) as SearchResult[];
}
