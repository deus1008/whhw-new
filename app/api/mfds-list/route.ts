import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 식약처(data.go.kr) 목록 조회 — 회수·판매중지 / 행정처분.
// 두 서비스 모두 활용신청 승인 완료(2026-07-14). 인증키는 DRUG_API_KEY 공용.
// 서비스가 이름 필터를 일관되게 지원하지 않아, 전량(페이징) 수집 후 서버측에서
// 키워드 필터링한다. 상류 응답은 1시간 캐시하여 반복 검색 시 호출을 아낀다.
const ENDPOINTS: Record<string, string> = {
  recall: 'https://apis.data.go.kr/1471000/MdcinRtrvlSleStpgeInfoService04/getMdcinRtrvlSleStpgelList03',
  admin:  'https://apis.data.go.kr/1471000/MdcinExaathrService04/getMdcinExaathrList04',
};

const PAGE_SIZE = 500;   // 700 이상은 서비스가 빈 응답을 반환
const MAX_PAGES = 8;     // 안전 상한(최대 4000행)

function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function fmtDate(s: string): string {
  const d = s.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : s;
}

function normalize(type: string, raw: Record<string, unknown>) {
  if (type === 'recall') {
    return {
      product: pick(raw, ['PRDUCT', 'PRDLST_NM', 'ITEM_NAME']),
      company: pick(raw, ['ENTRPS', 'ENTP_NAME', 'BSSH_NM']),
      reason:  pick(raw, ['RTRVL_RESN', 'RETRIEVE_REASON']),
      date:    fmtDate(pick(raw, ['RECALL_COMMAND_DATE', 'RTRVL_CMMND_DT', 'PBLNT_DT'])),
    };
  }
  // admin (행정처분)
  return {
    company: pick(raw, ['ENTP_NAME', 'ENTRPS']),
    product: pick(raw, ['ITEM_NAME', 'PRDUCT']),
    action:  pick(raw, ['ADM_DISPS_NAME', 'DSPS_CN']),
    reason:  pick(raw, ['EXPOSE_CONT', 'BEF_APPLY_LAW', 'VILT_CN']),
    date:    fmtDate(pick(raw, ['LAST_SETTLE_DATE', 'DSPS_DT'])),
  };
}

// body.items 는 [{item:{...}}, ...] 형태(원소마다 item 한 번 더 래핑)로 오거나
// 표준 {item:[...]} 형태로 올 수 있어 둘 다 방어적으로 평탄화한다.
function extract(json: unknown): Record<string, unknown>[] {
  const body = (json as { body?: { items?: unknown } })?.body;
  let c: unknown = body?.items;
  if (c == null) return [];
  if (!Array.isArray(c) && typeof c === 'object' && 'item' in (c as object)) {
    c = (c as { item: unknown }).item;
  }
  const arr = Array.isArray(c) ? c : [c];
  return arr.map((e) => {
    if (e && typeof e === 'object' && 'item' in e && typeof (e as { item: unknown }).item === 'object') {
      return (e as { item: Record<string, unknown> }).item;
    }
    return e as Record<string, unknown>;
  });
}

async function fetchAll(url: string, key: string): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ serviceKey: key, type: 'json', numOfRows: String(PAGE_SIZE), pageNo: String(page) });
    const res = await fetch(`${url}?${params}`, { next: { revalidate: 3600 } });
    const text = await res.text();
    if (!text.trim().startsWith('{')) return page === 1 ? null : rows;
    const json = JSON.parse(text);
    const items = extract(json);
    rows.push(...items);
    const total = Number((json?.body?.totalCount as number) ?? 0);
    if (items.length === 0 || rows.length >= total) break;
  }
  return rows;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'recall';
  const q    = (searchParams.get('q') ?? '').trim().toLowerCase();
  const url  = ENDPOINTS[type];
  if (!url) return NextResponse.json({ items: [], error: '알 수 없는 조회 유형' }, { status: 400 });

  const key = process.env.MFDS_API_KEY ?? process.env.DRUG_API_KEY;
  if (!key) return NextResponse.json({ items: [], notAvailable: true, message: 'DRUG_API_KEY 미설정' });

  try {
    const raw = await fetchAll(url, key);
    if (raw == null) {
      return NextResponse.json({ items: [], notAvailable: true, message: '식약처 API 응답 오류이거나 승인 반영 대기 중입니다. 잠시 후 다시 시도해 주세요.' });
    }
    let items = raw.map((r) => normalize(type, r));
    if (q) {
      const tokens = q.split(/[\s,+]+/).filter(Boolean);
      items = items.filter((r) => {
        const hay = Object.values(r).join(' ').toLowerCase();
        return tokens.some((t) => hay.includes(t));
      });
    }
    return NextResponse.json({ items, total: items.length });
  } catch {
    return NextResponse.json({ items: [], notAvailable: true, message: '식약처 API 조회에 실패했습니다.' });
  }
}
