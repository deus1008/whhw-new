/**
 * 허가현황 문서 → 발매예정품목 자동 추출
 * Claude AI를 이용해 문서 텍스트에서 의약품 제품 정보를 구조화합니다.
 */
import Anthropic from '@anthropic-ai/sdk';

export type ExtractedProduct = {
  ingredient:      string;         // 성분명 (memo 컬럼)
  title:           string;         // 제품명
  manufacturer:    string | null;  // 회사명
  launch_date:     string | null;  // YYYY-MM-DD
  indication:      string | null;  // 계열/적응증
  status:          string;         // 발매예정 | 발매완료
  insurance_code:  string | null;  // 보험코드
  insurance_price: string | null;  // 보험가
};

const SYSTEM_PROMPT = `당신은 의약품 허가현황 문서에서 제품 정보를 추출하는 전문가입니다.
문서에서 의약품 제품 목록을 파악하고, 요청된 JSON 형식으로 정확히 반환하세요.
JSON 배열 외에 어떤 텍스트도 포함하지 마세요.`;

const USER_PROMPT = (text: string) => `아래 의약품 허가현황 문서에서 모든 의약품 제품 정보를 추출하세요.

**추출 규칙:**
- ingredient: 주성분명 (성분명·함량 포함)
- title: 제품명 (품목명)
- manufacturer: 제조사/허가사 회사명 (자사 아주약품 제품 제외, 타사만 추출)
- launch_date: 허가일 또는 발매예정일을 "YYYY-MM-DD" 형식으로 (없으면 null)
- indication: 효능효과 또는 약효분류 (계열)
- status: 이미 출시되었으면 "발매완료", 예정이면 "발매예정"
- insurance_code: 보험코드/품목코드 (없으면 null)
- insurance_price: 보험약가/상한금액 (없으면 null)

**출력 형식:** JSON 배열만 반환
\`\`\`json
[
  {
    "ingredient": "성분명 함량",
    "title": "제품명",
    "manufacturer": "회사명",
    "launch_date": "YYYY-MM-DD",
    "indication": "계열",
    "status": "발매예정",
    "insurance_code": null,
    "insurance_price": null
  }
]
\`\`\`

**문서 내용:**
${text}`;

export async function extractProductsFromText(
  text: string,
): Promise<ExtractedProduct[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[extract-products] ANTHROPIC_API_KEY 미설정');
    return [];
  }

  const client = new Anthropic({ apiKey });

  // 너무 긴 텍스트는 앞쪽 60,000자만 사용 (토큰 절약)
  const trimmed = text.length > 60000 ? text.slice(0, 60000) + '\n...(이하 생략)' : text;

  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-7',
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: USER_PROMPT(trimmed) }],
    });

    const block = message.content[0];
    if (block.type !== 'text') return [];

    const raw = block.text.trim();

    // JSON 배열 파싱 (마크다운 코드블록 제거 포함)
    const jsonStr = raw
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return (parsed as ExtractedProduct[]).filter(
      p => typeof p.ingredient === 'string' && typeof p.title === 'string' && p.title.trim(),
    );
  } catch (e) {
    console.error('[extract-products] 추출 오류:', e);
    return [];
  }
}
