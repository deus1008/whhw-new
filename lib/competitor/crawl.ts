// CSO 경쟁사 뉴스 크롤러.
// 주력: GNEWS 계열 CMS(약사공론·의학신문·메디파나·약국신문)는 articleList.html 에
//       POST 검색이 회사명으로 정확히 필터됨 → 파서 1개로 커버(약국신문은 euc-kr).
// 데일리팜/약업신문은 구조가 달라 best-effort(실패 시 스킵).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export type Article = { title: string; url: string; date: string | null; summary: string | null };

// 매체명 → 크롤 설정 (GNEWS CMS · POST 검색이 회사명으로 정확 필터되는 매체)
//   약국신문(euc-kr POST 인코딩)·데일리팜(봇차단)·약업신문(구조상이)은 현재 수동 입력.
export const CRAWL_SITES: Record<string, { host: string; type: 'cms'; charset?: string }> = {
  '약사공론': { host: 'https://www.kpanews.co.kr', type: 'cms' },
  '의학신문': { host: 'https://www.bosa.co.kr',    type: 'cms' },
  '메디파나': { host: 'https://www.medipana.com',  type: 'cms' },
};

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;|&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function fetchText(url: string, opts: { method?: string; body?: string; charset?: string; headers?: Record<string, string> } = {}): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...(opts.headers ?? {}) },
    body: opts.body,
    redirect: 'follow',
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = opts.charset ? new TextDecoder(opts.charset).decode(buf) : buf.toString('utf8');
  return { status: res.status, text };
}

// GNEWS CMS 검색결과 파싱: articleView.html?idxno=N 기준
function parseCms(html: string, host: string): Article[] {
  const out: Article[] = [];
  const seen = new Set<string>();
  const re = /href=["']([^"']*articleView\.html\?idxno=(\d+)[^"']*)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const idx = m[2];
    const title = stripTags(m[3]);
    if (title.length < 5 || seen.has(idx)) continue;   // 이미지 링크(제목 빈값)·중복 스킵
    seen.add(idx);
    let url = m[1].replace(/&amp;/g, '&');
    if (!url.startsWith('http')) url = host.replace(/\/$/, '') + url;
    const win = html.slice(m.index, m.index + 1400);
    const dm = win.match(/(20\d{2})[-.](\d{1,2})[-.](\d{1,2})/);
    const date = dm ? `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}` : null;
    const sm = win.match(/class=["'][^"']*(?:summary|lead|read)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div|span)>/i);
    const summary = sm ? stripTags(sm[1]).slice(0, 400) || null : null;
    out.push({ title, url, date, summary });
  }
  return out;
}

/** 한 매체에서 특정 회사 뉴스 검색 → 회사명이 제목/요약에 포함된 기사만 반환. */
export async function crawlSite(sourceName: string, company: string): Promise<Article[]> {
  const cfg = CRAWL_SITES[sourceName];
  if (!cfg) return [];
  const url = `${cfg.host}/news/articleList.html`;
  const body = new URLSearchParams({ sc_word: company, sc_area: 'A', view_type: 'sm' }).toString();
  const { status, text } = await fetchText(url, {
    method: 'POST', body, charset: cfg.charset,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url },
  });
  if (status !== 200) return [];
  return parseCms(text, cfg.host).filter(a => `${a.title} ${a.summary ?? ''}`.includes(company));
}

/** 크롤 가능한 매체명 여부 */
export function isCrawlable(sourceName: string): boolean {
  return !!CRAWL_SITES[sourceName];
}
