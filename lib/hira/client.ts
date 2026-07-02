/**
 * 건강보험심사평가원(HIRA) API 클라이언트
 *
 * 사용 API:
 *   1) dgamtCrtrInfoService1.2  - 약제급여 기준금액 (약가·급여여부) — XML — DRUG_API_KEY로 이미 사용 중
 *   2) msInfrMedBassInfoService  - 보험의약품정보서비스 (ATC코드·상한가) — JSON — 별도 서비스 승인 필요
 *
 * 환경변수: HIRA_API_KEY 또는 DRUG_API_KEY (공공데이터포털 일반인증키)
 */

const PRICE_URL = 'https://apis.data.go.kr/B551182/dgamtCrtrInfoService1.2/getDgamtList';
const BASE      = 'https://apis.data.go.kr/B551182/msInfrMedBassInfoService';

/* ── 환경변수 ── */
function apiKey(): string {
  const k = process.env.HIRA_API_KEY ?? process.env.DRUG_API_KEY;
  if (!k) throw new Error('HIRA_API_KEY (또는 DRUG_API_KEY) 환경변수가 설정되지 않았습니다.');
  return k;
}

/* ── XML 파서 (dgamtCrtrInfoService1.2용) ── */
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
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

function parsePrice(v: string | number | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,\s원]/g, ''));
  return isNaN(n) || n === 0 ? null : n;
}

/* ── 타입 ── */
export interface HiraPriceItem {
  itmNm:        string;
  maxPrice:     number | null;
  payType:      string | null;
  manufacturer: string | null;
  standard:     string | null;
}

export interface HiraDrugItem {
  itemSeq:   string;
  itemName:  string;
  entpName:  string;
  atcCode:   string;
  atcName:   string;
  mediPayYn: string;
  maxPrice:  number | null;
  ingrName:  string;
}

export interface HiraAtcItem {
  code:   string;
  nameKo: string;
  level:  number;
  parent: string | null;
}

/* ══════════════════════════════════════════════════════════════════
 * 1) dgamtCrtrInfoService1.2  — 약가·급여여부 (XML, DRUG_API_KEY로 동작)
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 제품명으로 약가 조회 (XML 기반, 이미 승인된 API)
 */
export async function searchHiraDrugPrice(itmNm: string): Promise<HiraPriceItem[]> {
  const key = apiKey();
  const url = `${PRICE_URL}?ServiceKey=${encodeURIComponent(key)}&itmNm=${encodeURIComponent(itmNm)}&numOfRows=20&pageNo=1`;

  let xml: string;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  if (!xml.includes('<item>')) return [];

  return parseXmlItems(xml).map(item => ({
    itmNm:        item.itmNm     || '',
    maxPrice:     parsePrice(item.mxCprc),
    payType:      item.payTpNm   || null,
    manufacturer: item.mnfEntpNm || null,
    standard:     item.nomNm     || null,
  }));
}

/* ══════════════════════════════════════════════════════════════════
 * 2) msInfrMedBassInfoService  — ATC코드 (JSON, 별도 서비스 승인 필요)
 * ══════════════════════════════════════════════════════════════════ */

interface RawItem {
  ITEM_SEQ?: string; ITEM_NAME?: string; ENTP_NAME?: string;
  ATC_CODE?: string; ATC_NAME?: string; MEDI_PAY_YN?: string;
  MAX_PRICE?: string | number; MAIN_INGR?: string; INGR_NAME?: string;
}

function normalizeItem(r: RawItem): HiraDrugItem {
  return {
    itemSeq:   r.ITEM_SEQ   ?? '',
    itemName:  r.ITEM_NAME  ?? '',
    entpName:  r.ENTP_NAME  ?? '',
    atcCode:   r.ATC_CODE   ?? '',
    atcName:   r.ATC_NAME   ?? '',
    mediPayYn: r.MEDI_PAY_YN ?? '',
    maxPrice:  parsePrice(r.MAX_PRICE),
    ingrName:  r.MAIN_INGR ?? r.INGR_NAME ?? '',
  };
}

/**
 * 보험의약품정보서비스로 ATC코드·상한가 조회 (JSON, 서비스 미승인 시 빈 배열 반환)
 */
export async function searchHiraDrugs(opts: {
  ingrName?: string; itemName?: string; pageNo?: number; numOfRows?: number;
}): Promise<{ items: HiraDrugItem[]; totalCount: number }> {
  const key = apiKey();
  const params = new URLSearchParams({
    serviceKey: key, type: 'json',
    numOfRows:  String(opts.numOfRows ?? 100),
    pageNo:     String(opts.pageNo ?? 1),
  });
  if (opts.ingrName) params.set('ingrName', opts.ingrName);
  if (opts.itemName) params.set('itemName', opts.itemName);

  const url = `${BASE}/getInfrMedBassInfoList?${params}`;
  let text: string;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return { items: [], totalCount: 0 };
    text = await res.text();
  } catch {
    return { items: [], totalCount: 0 };
  }

  // 서비스 미승인 시 XML/텍스트 에러 반환 → JSON 파싱 실패 → 빈 결과
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { items: [], totalCount: 0 };
  }

  const body = (json as { response?: { body?: { items?: { item?: unknown }; totalCount?: unknown } } })
    ?.response?.body;
  const rawItems = (body?.items?.item ?? []) as RawItem[];
  const totalCount = Number(body?.totalCount ?? 0);

  return {
    items: (Array.isArray(rawItems) ? rawItems : [rawItems]).map(normalizeItem),
    totalCount,
  };
}

/**
 * ATC 코드 계층 조회 (서비스 미승인 시 빈 배열 반환)
 */
export async function fetchHiraAtcList(atcCode?: string): Promise<HiraAtcItem[]> {
  const key = apiKey();
  const params = new URLSearchParams({
    serviceKey: key, type: 'json', numOfRows: '1000', pageNo: '1',
  });
  if (atcCode) params.set('atcCode', atcCode);

  const url = `${BASE}/getInfrMedBassInfoAtcList?${params}`;
  let text: string;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  }

  let json: unknown;
  try { json = JSON.parse(text); } catch { return []; }

  const body = (json as { response?: { body?: { items?: { item?: unknown } } } })?.response?.body;
  const rawItems = body?.items?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items
    .filter((r: { ATC_CODE?: string }) => r.ATC_CODE)
    .map((r: { ATC_CODE?: string; ATC_NAME?: string }) => {
      const code = (r.ATC_CODE ?? '').trim();
      return {
        code,
        nameKo: r.ATC_NAME ?? '',
        level:  code.length <= 1 ? 1 : code.length <= 3 ? 2 : code.length <= 4 ? 3 : code.length <= 5 ? 4 : 5,
        parent: code.length <= 1 ? null
          : code.length <= 3 ? code.slice(0, 1)
          : code.length <= 4 ? code.slice(0, 3)
          : code.length <= 5 ? code.slice(0, 4)
          : code.slice(0, 5),
      };
    });
}
