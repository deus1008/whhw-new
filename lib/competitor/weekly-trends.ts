// /weekly · /dashboard 의 'CSO 제약사 동향' 섹션 데이터.
// 문서관리 '경쟁사동향' 폴더 파싱 방식을 대체 — 업계동향(/competitor-intel)의
// competitor_trends 를 업체별 최신 기사로 집계한다.
import type { CsoTrendCompany } from '@/components/DashboardClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

const PER_COMPANY = 4;   // 업체별 표시할 최신 기사 수

export async function fetchCsoTrends(svc: Svc): Promise<CsoTrendCompany[]> {
  const [{ data: companies }, { data: trends }] = await Promise.all([
    svc.from('competitor_companies').select('name, display_order').eq('active', true).order('display_order'),
    svc.from('competitor_trends')
      .select('id, company_name, title, summary, trend_type, event_date, url, created_at')
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1500),
  ]);

  const rows = (trends ?? []) as Record<string, unknown>[];
  return ((companies ?? []) as { name: string }[]).map((c) => {
    const mine = rows.filter((t) => t.company_name === c.name);
    return {
      company: c.name,
      total: mine.length,
      items: mine.slice(0, PER_COMPANY).map((t) => ({
        id:      String(t.id),
        title:   String(t.title ?? ''),
        summary: (t.summary as string | null) ?? null,
        date:    (t.event_date as string | null) ?? (t.created_at as string | undefined)?.slice(0, 10) ?? null,
        type:    String(t.trend_type ?? '기타'),
        url:     (t.url as string | null) ?? null,
      })),
    };
  });
}
