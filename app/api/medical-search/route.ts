import { NextRequest, NextResponse } from 'next/server';

/**
 * 요양기관 검색 + 주변 약국 API
 *
 * type=hospital  : HIRA hospInfoServicev2/getHospBasisList (XML)
 * type=nearby    : 1741000/pharmacies/info 분산 스캔 후 TM 거리 필터링
 */

const HOSP_URL  = 'https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList';
const PHARM_URL = 'https://apis.data.go.kr/1741000/pharmacies/info';

const PHARM_TOTAL_PAGES = 703;   // 70,267건 ÷ 100
const NEARBY_SCAN_PAGES = 100;   // 10,000건 스캔 (~14.2%)
const NEARBY_BATCH      = 25;    // 배치당 동시 요청 수
const NEARBY_RADIUS_TM  = 1500;  // TM 거리 (m) — 측지계 오차 감안해 1.5km
const NEARBY_MAX        = 12;    // 반환 최대 건수

/* ── 타입 ───────────────────────────────────────────────────── */
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
  xPos:       number | null;   // WGS84 경도 (병원)
  yPos:       number | null;   // WGS84 위도 (병원)
  distanceM:  number | null;   // 거리 m (주변 약국)
}

/* ── TM 좌표 변환 (WGS84 → 한국 중부원점 TM) ──────────────── */
/**
 * GRS80 TM 정투영 (EPSG:5186 근사)
 * 중부원점: 127°E, 38°N, 가산동서 200000, 가산남북 500000
 */
function wgs84ToKoreaTM(lat: number, lon: number): [number, number] {
  const a  = 6378137.0;
  const e2 = 0.00669437999014;
  const k0 = 1.0;
  const lon0 = 127 * Math.PI / 180;
  const lat0 = 38  * Math.PI / 180;
  const FE = 200000, FN = 500000;

  const p = lat * Math.PI / 180;
  const l = lon * Math.PI / 180;
  const e4 = e2 * e2, e6 = e2 * e4;

  const M = (phi: number) =>
    a * ((1 - e2/4 - 3*e4/64 - 5*e6/256) * phi
       - (3*e2/8 + 3*e4/32 + 45*e6/1024) * Math.sin(2*phi)
       + (15*e4/256 + 45*e6/1024)         * Math.sin(4*phi)
       - (35*e6/3072)                     * Math.sin(6*phi));

  const sinP = Math.sin(p), cosP = Math.cos(p), tanP = Math.tan(p);
  const N = a / Math.sqrt(1 - e2 * sinP * sinP);
  const T = tanP * tanP;
  const C = (e2 / (1 - e2)) * cosP * cosP;
  const A = (l - lon0) * cosP;

  const Mp = M(p), M0 = M(lat0);

  const x = FE + k0 * N * (A
    + (1 - T + C)           * (A**3) / 6
    + (5 - 18*T + T*T + 72*C - 58*(e2/(1-e2))) * (A**5) / 120);

  const y = FN + k0 * (Mp - M0 + N * tanP * (
      (A**2) / 2
    + (5 - T + 9*C + 4*C*C)                              * (A**4) / 24
    + (61 - 58*T + T*T + 600*C - 330*(e2/(1-e2)))        * (A**6) / 720));

  return [x, y];
}

/* ── XML 파서 (병원 API) ────────────────────────────────────── */
function decodeXml(s: string): string {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
}

function parseXmlItems(xml: string): Record<string, string>[] {
  const items: Record<string, string>[] = [];
  for (const block of xml.match(/<item>([\s\S]*?)<\/item>/g) ?? []) {
    const obj: Record<string, string> = {};
    for (const f of block.match(/<(\w+)>([^<]*)<\/\1>/g) ?? []) {
      const m = f.match(/<(\w+)>([^<]*)<\/\1>/);
      if (m) obj[m[1]] = decodeXml(m[2]);
    }
    items.push(obj);
  }
  return items;
}

function xmlNumber(xml: string, tag: string): number {
  const m = xml.match(new RegExp(`<${tag}>(\\d+)<\\/${tag}>`));
  return m ? parseInt(m[1], 10) : 0;
}

/* ── 매퍼 ───────────────────────────────────────────────────── */
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
    xPos:       item.XPos ? parseFloat(item.XPos) : null,
    yPos:       item.YPos ? parseFloat(item.YPos) : null,
    distanceM:  null,
  };
}

function pharmMapper(item: Record<string, unknown>, distanceM: number): MedicalItem {
  return {
    ykiho:      String(item.MNG_NO   ?? ''),
    yadmNm:     String(item.BPLC_NM  ?? ''),
    clCd:       '81',
    clCdNm:     '약국',
    addr:       String(item.ROAD_NM_ADDR ?? item.LOTNO_ADDR ?? ''),
    telno:      String(item.TELNO ?? ''),
    dgsbjtCdNm: null,
    sidoCdNm:   null,
    sgguCdNm:   null,
    postNo:     String(item.ROAD_NM_ZIP ?? item.LCTN_ZIP ?? '') || null,
    xPos:       null,
    yPos:       null,
    distanceM,
  };
}

/* ── 병원 검색 ───────────────────────────────────────────────── */
async function fetchHospitals(
  apiKey: string, query: string, pageNo: number,
): Promise<{ items: MedicalItem[]; total: number }> {
  const url =
    `${HOSP_URL}?serviceKey=${apiKey}` +
    `&pageNo=${pageNo}&numOfRows=12&yadmNm=${encodeURIComponent(query)}`;

  console.log(`[medical-search] 병원 "${query}" p${pageNo}`);
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`병원 API HTTP ${res.status}`);

  const xml  = await res.text();
  const code = xml.match(/<resultCode>([^<]*)<\/resultCode>/)?.[1] ?? '';
  if (code && code !== '00' && code !== '0') {
    const msg = xml.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1] ?? code;
    throw new Error(`병원 API 오류: ${msg}`);
  }

  const total = xmlNumber(xml, 'totalCount');
  const items = parseXmlItems(xml).map(hospMapper);
  console.log(`[medical-search] 병원 → ${items.length}건 / 전체 ${total}건`);
  return { items, total };
}

/* ── 주변 약국 검색 ─────────────────────────────────────────── */
async function fetchNearbyPharmacies(
  apiKey: string, lat: number, lon: number,
): Promise<MedicalItem[]> {
  const [tmX, tmY] = wgs84ToKoreaTM(lat, lon);
  console.log(`[medical-search] 주변약국 lat=${lat} lon=${lon} → TM(${tmX.toFixed(0)}, ${tmY.toFixed(0)})`);

  const step  = Math.floor(PHARM_TOTAL_PAGES / NEARBY_SCAN_PAGES);
  const pages = Array.from({ length: NEARBY_SCAN_PAGES }, (_, i) => 1 + i * step);

  const found: { item: Record<string, unknown>; dist: number }[] = [];

  // 배치별 병렬 요청
  for (let i = 0; i < pages.length; i += NEARBY_BATCH) {
    const batch = pages.slice(i, i + NEARBY_BATCH);
    const results = await Promise.allSettled(
      batch.map(p =>
        fetch(`${PHARM_URL}?serviceKey=${apiKey}&pageNo=${p}&numOfRows=100&type=json`,
          { next: { revalidate: 300 } })
          .then(r => r.json())
          .then((json: unknown) => {
            const raw = (json as { response?: { body?: { items?: { item?: unknown } } } })
              ?.response?.body?.items?.item;
            return Array.isArray(raw) ? raw : (raw ? [raw] : []);
          })
          .catch(() => [] as unknown[]),
      ),
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const raw of r.value as Record<string, unknown>[]) {
        const px = parseFloat(String(raw.CRD_INFO_X ?? '0'));
        const py = parseFloat(String(raw.CRD_INFO_Y ?? '0'));
        if (!px || !py) continue;
        const dist = Math.sqrt((px - tmX) ** 2 + (py - tmY) ** 2);
        if (dist <= NEARBY_RADIUS_TM) {
          found.push({ item: raw, dist: Math.round(dist) });
        }
      }
    }
  }

  found.sort((a, b) => a.dist - b.dist);
  console.log(`[medical-search] 주변약국 → ${found.length}건 (${NEARBY_SCAN_PAGES * 100}건 스캔)`);

  return found.slice(0, NEARBY_MAX).map(({ item, dist }) => pharmMapper(item, dist));
}

/* ── GET 핸들러 ─────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type   = searchParams.get('type') ?? 'hospital';
  const query  = (searchParams.get('q') ?? '').trim();
  const pageNo = parseInt(searchParams.get('page') ?? '1', 10) || 1;
  const lat    = parseFloat(searchParams.get('lat') ?? '0');
  const lon    = parseFloat(searchParams.get('lon') ?? '0');

  if (type !== 'nearby' && !query)
    return NextResponse.json({ items: [], total: 0 });

  if (type === 'nearby' && (!lat || !lon))
    return NextResponse.json({ error: '좌표가 필요합니다.', items: [] }, { status: 400 });

  const apiKey = process.env.MEDICAL_API_KEY ?? process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'MEDICAL_API_KEY 환경변수가 설정되지 않았습니다.', items: [], total: 0 },
      { status: 503 },
    );
  }

  try {
    if (type === 'nearby') {
      const items = await fetchNearbyPharmacies(apiKey, lat, lon);
      return NextResponse.json({ items, total: items.length, type });
    }

    // type === 'hospital'
    const { items, total } = await fetchHospitals(apiKey, query, pageNo);
    return NextResponse.json({ items, total, pageNo, type });

  } catch (e) {
    const msg = e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.';
    console.error('[medical-search] error:', msg);
    return NextResponse.json({ error: msg, items: [], total: 0 }, { status: 502 });
  }
}
