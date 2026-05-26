const TARGET_CHARS  = 1500; // ≈ 375 토큰 (4자/토큰 기준)
const OVERLAP_CHARS = 200;
const MIN_CHARS     = 80;   // 이보다 짧으면 청크로 저장하지 않음

export function chunkText(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return [];

  const chunks: string[] = [];
  let buffer = '';

  const paragraphs = normalized.split(/\n\n+/);

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const candidate = buffer ? `${buffer}\n\n${trimmed}` : trimmed;

    if (candidate.length <= TARGET_CHARS) {
      buffer = candidate;
      continue;
    }

    // 현재 버퍼를 저장
    if (buffer.length >= MIN_CHARS) {
      chunks.push(buffer);
    }

    // 다음 버퍼: 이전 끝 overlap + 새 단락
    const tail   = buffer.slice(-OVERLAP_CHARS);
    const starter = tail ? `${tail}\n\n${trimmed}` : trimmed;

    // 단락 자체가 TARGET을 초과하면 문장 단위로 분할
    if (trimmed.length > TARGET_CHARS) {
      const sentenceChunks = splitLongText(trimmed);
      for (let i = 0; i < sentenceChunks.length; i++) {
        if (sentenceChunks[i].length >= MIN_CHARS) {
          chunks.push(sentenceChunks[i]);
        }
      }
      // 마지막 문장 청크의 끝부분을 버퍼로
      const last = sentenceChunks.at(-1) ?? '';
      buffer = last.slice(-OVERLAP_CHARS);
    } else {
      buffer = starter.length <= TARGET_CHARS ? starter : trimmed;
    }
  }

  if (buffer.length >= MIN_CHARS) {
    chunks.push(buffer);
  }

  // 청크가 없지만 텍스트가 있으면(짧은 문서 등) 전체를 단일 청크로 보장
  if (chunks.length === 0 && normalized.length > 0) {
    chunks.push(normalized);
  }

  return chunks;
}

function splitLongText(text: string): string[] {
  // 문장 경계: 마침표/물음표/느낌표 + 공백, 줄바꿈
  const sentences = text.split(/(?<=[.!?。?!]\s)|(?<=\n)/);
  const chunks: string[] = [];
  let buffer = '';

  for (const sent of sentences) {
    const candidate = buffer + sent;
    if (candidate.length <= TARGET_CHARS) {
      buffer = candidate;
    } else {
      if (buffer.length >= MIN_CHARS) chunks.push(buffer.trim());
      buffer = buffer.slice(-OVERLAP_CHARS) + sent;
    }
  }

  if (buffer.trim().length >= MIN_CHARS) chunks.push(buffer.trim());

  return chunks;
}
