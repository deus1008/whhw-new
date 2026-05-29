import { NextRequest, NextResponse } from 'next/server';

/**
 * 요양기관(병원·의원) + 약국 검색 API 프록시
 *
 * 환경변수: MEDICAL_API_KEY (또는 DRUG_API_KEY)
 *
 * 병원·의원: HIRA hospInfoServicev2/getHospBasisList  (XML 응답)
 * 약  국: 보건복지부 1741000/pharmacies/info          (JSON 응답, 명칭 필터 미지원 → 분산 스캔)
 */

/* ── 엔드포인트 ─────────────────────────────────────────────── */
const HOSP_URL  = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
const PHARM_URL = 'https://apis.data.go.kr/1741000/pharmacies/info';

/** 약국 API 총 페이지 수 (약 70,267건 ÷ 100) */
const PHARM_TOTAL_PAGES = 703;
/** 한 번 검색에 스캔할 분산 페이지 수 */
const PHARM_SCAN_PAGES  = 20;

/* ── 공통 타입 ──────────────────────────────────────────────── */
export interface MedicalItem {
  ykiho:      string;
  yadmNm:     string;
  clCd:       string;
  clCdNm:     string;
  addr:       string;
  telno:      string;
  dgsbjtCdNm: string | null;
  sidoCdNm:   string | null;
  sgguCdNm:   string | null;
  postNo:     string | null;
}

/* ── XML 파서 (병원 API 응답) ───────────────────────────────── */
function parseXmlItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const obj: Record<string, string> = {};
    const fields = block.match(/<(\w+)>([^<]*)<\/\1>/g) ?? [];
    for (const f of fields) {
      const m = f.match(/<(\w+)>([^<]*)<\/\1>/);
      if (m) obj[m[1]] = decodeXmlEntities(m[2]);
    }
    items.push(obj);
  }
  return items;
}

function extractXmlNumber(xml: string, tag: string): number {
  const m = xml.match(new RegExp(`<${tag}>(\\d+)<\\/${tag}>`));
  return m ? parseInt(m[1], 10) : 0;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/* ── 병원 응답 매퍼 ─────────────────────────────────────────── */
function hospMapper(item: Record<string, string>): MedicalItem {
  return {
    ykiho:      item.ykiho      ?? '',
    yadmNm:     item.yadmNm     ?? '',
    clCd:       item.clCd       ?? '',
    clCdNm:     item.clCdNm     ?? '',
    addr:       item.addr       ?? '',
    telno:      item.telno      ?? '',
    dgsbjtCdNm: item.dgsbjtCdNm ?? null,
    sidoCdNm:   item.sidoCdNm   ?? null,
    sgguCdNm:   item.sgguCdNm   ?? null,
    postNo:     item.postNo     ?? null,
  };
}

/* ── 약국 응답 매퍼 ─────────────────────────────────────────── */
function pharmMapper(item: Record<string, unknown>): MedicalItem {
  const addr = String(item.ROAD_NM_ADDR ?? item.LOTNO_ADDR ?? '');
  const zip  = String(item.ROAD_NM_ZIP  ?? item.LCTN_ZIP   ?? '');
  return {
    ykiho:      String(item.MNG_NO   ?? ''),
    yadmNm:     String(item.BPLC_NM  ?? ''),
    clCd:       '81',
    clCdNm:     '약국',
    addr,
    telno:      String(item.TELNO ?? ''),
    dgsbjtCdNm: null,
    sidoCdNm:   null,
    sgguCdNm:   null,
    postNo:     zip || null,
  };
}

/* ── 병원 검색 (HIRA hospInfoServicev2, XML) ────────────────── */
async function fetchHospitals(
  apiKey: string,
  query:  string,
  pageNo: number,
): Promise<{ items: MedicalItem[]; total: number }> {
  const url =
    `${HOSP_URL}?serviceKey=${apiKey}` +
    `&pageNo=${encodeURIComponent(pageNo)}&numOfRows=12` +
    `&yadmNm=${encodeURIComponent(query)}`;

  console.log(`[medical-search] 병원 "${query}" p${pageNo}`);
  const res = await fetch(url, { next: { revalidate: 60 } });

  if (!res.ok) {
    throw new Error(`병원 API HTTP ${res.status}`);
  }

  const xml   = await res.text();
  const code  = xml.match(/<resultCode>([^<]*)<\/resultCode>/)?.[1] ?? '';
  if (code && code !== '00' && code !== '0') {
    const msg = xml.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1] ?? code;
    throw new Error(`병원 API 오류: ${msg}`);
  }

  const rawItems = parseXmlItems(xml);
  const total    = extractXmlNumber(xml, 'totalCount');
  const items    = rawItems.map(hospMapper);

  console.log(`[medical-search] 병원 → ${items.length}건 / 전체 ${total}건`);
  return { items, total };
}

/* ── 약국 검색 (분산 스캔 후 클라이언트 필터) ────────────────── */
async function fetchPharmacies(
  apiKey: string,
  query:  string,
  pageNo: number,
): Promise<{ items: MedicalItem[]; total: number; scanned: number }> {
  // 20개 페이지를 전체 703 페이지에 골고루 분산
  const step  = Math.floor(PHARM_TOTAL_PAGES / PHARM_SCAN_PAGES);
  const pages = Array.from({ length: PHARM_SCAN_PAGES }, (_, i) => 1 + i * step);

  console.log(`[medical-search] 약국 "${query}" 분산스캔 ${PHARM_SCAN_PAGES}페이지`);

  const results = await Promise.allSettled(
    pages.map(p =>
      fetch(
        `${PHARM_URL}?serviceKey=${apiKey}&pageNo=${p}&numOfRows=100&type=json`,
        { next: { revalidate: 300 } },
      )
        .then(r => r.json())
        .then((json: unknown) => {
          const body  = (json as { response?: { body?: { items?: { item?: unknown } } } })
            ?.response?.body;
          const raw   = body?.items?.item;
          const arr   = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          return (arr as Record<string, unknown>[]).filter(
            it => String(it.BPLC_NM ?? '').includes(query),
          );
        }),
    ),
  );

  const all: MedicalItem[] = results
    .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .map(pharmMapper);

  // 가나다 정렬
  all.sort((a, b) => a.yadmNm.localeCompare(b.yadmNm, 'ko'));

  const perPage = 12;
  const start   = (pageNo - 1) * perPage;
  const items   = all.slice(start, start + perPage);
  const total   = all.length;
  const scanned = PHARM_SCAN_PAGES * 100;

  console.log(`[medical-search] 약국 → ${total}건 매칭 (${scanned}건 스캔)`);
  return { items, total, scanned };
}

/* ── GET 핸들러 ─────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query  = (searchParams.get('q')    ?? '').trim();
  const type   = (searchParams.get('type') ?? 'hospital') as 'hospital' | 'pharmacy';
  const pageNo = parseInt(searchParams.get('page') ?? '1', 10) || 1;

  if (!query) return NextResponse.json({ items: [], total: 0 });

  const apiKey = process.env.MEDICAL_API_KEY ?? process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'MEDICAL_API_KEY 환경변수가 설정되지 않았습니다.', items: [], total: 0 },
      { status: 503 },
    );
  }

  try {
    if (type === 'pharmacy') {
      const { items, total, scanned } = await fetchPharmacies(apiKey, query, pageNo);
      return NextResponse.json({ items, total, pageNo, type, scanned });
    } else {
      const { items, total } = await fetchHospitals(apiKey, query, pageNo);
      return NextResponse.json({ items, total, pageNo, type });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.';
    console.error('[medical-search] error:', msg);
    return NextResponse.json(
      { error: msg, items: [], total: 0 },
      { status: 502 },
    );
  }
}
