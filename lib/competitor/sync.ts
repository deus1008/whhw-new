// 경쟁사 뉴스 자동수집 파이프라인: 매체×회사 크롤 → URL 중복제거 → AI 유형분류 → 저장.
import { crawlSite, isCrawlable, type Article } from './crawl';
import { classifyTrends } from './classify';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

export async function runCrawl(svc: Svc): Promise<{ sources: string[]; companies: number; found: number; inserted: number }> {
  const [{ data: companies }, { data: sources }] = await Promise.all([
    svc.from('competitor_companies').select('name').eq('active', true),
    svc.from('media_sources').select('name').eq('active', true),
  ]);
  const coNames = (companies ?? []).map((c: { name: string }) => c.name);
  const crawlSources = (sources ?? []).map((s: { name: string }) => s.name).filter(isCrawlable);

  // 매체 × 회사 크롤 (순차 — 사이트 부하 최소화)
  type Cand = Article & { company: string; source: string };
  const cands: Cand[] = [];
  for (const source of crawlSources) {
    for (const company of coNames) {
      try {
        const arts = await crawlSite(source, company);
        for (const a of arts) cands.push({ ...a, company, source });
      } catch { /* 사이트 오류 스킵 */ }
    }
  }
  if (cands.length === 0) return { sources: crawlSources, companies: coNames.length, found: 0, inserted: 0 };

  // URL 기준 중복제거 (수집분 내)
  const byUrl = new Map<string, Cand>();
  for (const c of cands) if (c.url && !byUrl.has(c.url)) byUrl.set(c.url, c);
  const uniq = [...byUrl.values()];

  // 이미 저장된 URL 제외
  const urls = uniq.map((c) => c.url);
  const existing = new Set<string>();
  for (let i = 0; i < urls.length; i += 200) {
    const { data } = await svc.from('competitor_trends').select('url').in('url', urls.slice(i, i + 200));
    for (const r of data ?? []) if (r.url) existing.add(r.url);
  }
  const fresh = uniq.filter((c) => !existing.has(c.url));
  if (fresh.length === 0) return { sources: crawlSources, companies: coNames.length, found: uniq.length, inserted: 0 };

  // AI 유형 분류(배치)
  const types = await classifyTrends(fresh.map((c) => ({ title: c.title, summary: c.summary })));

  const now = new Date().toISOString();
  const rows = fresh.map((c, i) => ({
    company_name: c.company,
    trend_type:   types[i] ?? '기타',
    title:        c.title,
    summary:      c.summary || null,
    source_name:  c.source,
    url:          c.url,
    event_date:   c.date || null,
    is_field:     false,
    crawled:      true,
    author_name:  '자동수집',
    updated_at:   now,
  }));

  // 기존 URL은 이미 제외됨 → 일반 insert (URL 부분 유니크 인덱스가 만일의 경쟁 중복 방어)
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { data, error } = await svc.from('competitor_trends').insert(chunk).select('id');
    if (!error) inserted += data?.length ?? chunk.length;
  }
  return { sources: crawlSources, companies: coNames.length, found: uniq.length, inserted };
}
