import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * 의약품 상세정보 API — 약가 · 생동 · DMF 통합 조회
 *
 * 약가 조회 순서:
 *   1) drug_prices 테이블 (업로드 파일 기반) — 있으면 우선 사용
 *   2) HIRA dgamtCrtrInfoService1.2 API — 테이블이 비어있거나 없으면 폴백
 *
 * 생동 : MFDS MdcBioEqInfoService01  (serviceKey 소문자)
 * DMF  : MFDS MdcDmfInfoService01    (serviceKey 소문자)
 */

const PRICE_URL = 'https://apis.data.go.kr/B551182/dgamtCrtrInfoService1.2/getDgamtList';
const BIOEQ_URL = 'https://apis.data.go.kr/1471000/MdcBioEqInfoService01/getMdcBioEqList01';
const DMF_URL   = 'https://apis.data.go.kr/1471000/MdcDmfInfoService01/getMdcDmfList01';

/* ── 타입 ── */
export interface PriceItem {
  itmNm:     string;
  mxCprc:    number | null;  // 최고상한금액(원)
  payTpNm:   string | null;  // 급여구분명
  nomNm:     string | null;  // 제형규격명
  unit:      string | null;  // 단위
  adtStaDd:  string | null;  // 시행년월일 YYYYMMDD
  mnfEntpNm: string | null;  // 제조업체명
}

export interface BioEqItem {
  itemName:   string;   // 생동 인정 품목명
  ingrName:   string | null;
  noticeDate: string | null;  // 고시일자 YYYYMMDD
  entpName:   string | null;  // 업체명
}

export interface DmfItem {
  ingrName:   string;
  entpName:   string | null;
  country:    string | null;
  permitDate: string | null;  // 등록일 YYYYMMDD
  dmfNo:      string | null;
}

export interface DrugInfoResponse {
  prices: PriceItem[];
  bioEq:  BioEqItem[];
  dmf:    DmfItem[];
}

/* ── XML 유틸 ── */
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'");
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

/* ── 약가 1순위: 업로드 파일(drug_prices 테이블) ── */
async function fetchPricesFromDB(itemName: string): Promise<PriceItem[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const sb = createSupabaseClient(url, key);
    // 앞부분 한글 최대 6자로 부분일치 검색
    const m      = itemName.match(/^([가-힣A-Za-z]+)/);
    const search = m ? m[1].slice(0, 6) : itemName.slice(0, 6);

    const { data, error } = await sb
      .from('drug_prices')
      .select('*')
      .ilike('item_name', `%${search}%`)
      .order('effective_date', { ascending: false })
      .limit(20);

    if (error) {
      if (error.code !== '42P01') console.warn('[drug-info] DB 약가 오류:', error.message);
      return [];
    }

    return (data ?? []).map((row: Record<string, unknown>) => ({
      itmNm:     String(row.item_name      ?? ''),
      mxCprc:    row.max_price             ? Number(row.max_price)      : null,
      payTpNm:   row.pay_type              ? String(row.pay_type)       : null,
      nomNm:     row.standard              ? String(row.standard)       : null,
      unit:      row.unit                  ? String(row.unit)           : null,
      adtStaDd:  row.effective_date        ? String(row.effective_date) : null,
      mnfEntpNm: row.manufacturer          ? String(row.manufacturer)   : null,
      ingrName:  row.ingredient_name       ? String(row.ingredient_name): null,
    }));
  } catch (e) {
    console.warn('[drug-info] fetchPricesFromDB error:', e);
    return [];
  }
}

/* ── 약가 2순위: HIRA API 폴백 ── */
async function fetchPricesFromAPI(apiKey: string, itemName: string): Promise<PriceItem[]> {
  const url = `${PRICE_URL}?ServiceKey=${encodeURIComponent(apiKey)}&itmNm=${encodeURIComponent(itemName)}&numOfRows=20&pageNo=1`;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) { console.warn('[drug-info] 약가 API HTTP', res.status); return []; }
    const xml = await res.text();
    return parseXmlItems(xml).map(item => ({
      itmNm:     item.itmNm     || '',
      mxCprc:    item.mxCprc    ? Number(item.mxCprc)  : null,
      payTpNm:   item.payTpNm   || null,
      nomNm:     item.nomNm     || null,
      unit:      item.unit      || null,
      adtStaDd:  item.adtStaDd  || null,
      mnfEntpNm: item.mnfEntpNm || null,
    }));
  } catch (e) {
    console.warn('[drug-info] 약가 API fetch error:', e);
    return [];
  }
}

/* ── 약가 통합 (DB 우선 → API 폴백) ── */
async function fetchPrices(apiKey: string, itemName: string): Promise<PriceItem[]> {
  const dbPrices = await fetchPricesFromDB(itemName);
  if (dbPrices.length > 0) {
    console.log(`[drug-info] 약가 DB 조회: ${dbPrices.length}건`);
    return dbPrices;
  }
  console.log('[drug-info] 약가 DB 없음 → HIRA API 폴백');
  return fetchPricesFromAPI(apiKey, itemName);
}

/* ── 생동성인정품목 (MFDS) ── */
async function fetchBioEq(apiKey: string, itemName: string): Promise<BioEqItem[]> {
  const url = `${BIOEQ_URL}?serviceKey=${encodeURIComponent(apiKey)}&item_name=${encodeURIComponent(itemName)}&numOfRows=20&pageNo=1`;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) { console.warn('[drug-info] 생동 HTTP', res.status); return []; }
    const xml = await res.text();
    return parseXmlItems(xml).map(item => ({
      // 생동 인정 품목명 — 여러 가능한 필드명 시도
      itemName:   item.BIOEQ_PRODT_NM || item.ITEM_NAME || item.item_name || '',
      ingrName:   item.INGR_KOR_NAME  || null,
      noticeDate: item.BIOEQ_PRODT_NOTICE_DATE || null,
      entpName:   item.BIOEQ_ENTP_NM  || item.ENTP_NAME || null,
    }));
  } catch (e) {
    console.warn('[drug-info] 생동 fetch error:', e);
    return [];
  }
}

/* ── 원료 DMF (MFDS) — 성분명별 병렬 검색 ── */
async function fetchDmf(apiKey: string, ingrName: string): Promise<DmfItem[]> {
  // "에제티미브/로수바스타틴칼슘(로수바스타틴으로서)" 형태의 복합 성분 분리
  const ingredients = ingrName
    .split('/')
    .map(s => s.replace(/\([^)]*\)/g, '').trim())  // 괄호 제거
    .filter(Boolean);

  const results = await Promise.allSettled(
    ingredients.map(async (ingr) => {
      const url = `${DMF_URL}?serviceKey=${encodeURIComponent(apiKey)}&ingr_kor_name=${encodeURIComponent(ingr)}&numOfRows=50&pageNo=1`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) { console.warn('[drug-info] DMF HTTP', res.status, ingr); return [] as DmfItem[]; }
      const xml = await res.text();
      return parseXmlItems(xml).map(item => ({
        ingrName:   item.INGR_KOR_NAME || ingr,
        entpName:   item.ENTP_NAME     || null,
        country:    item.MANUF_COUNTRY_CODE_NM || null,
        permitDate: item.DMF_PERMIT_DATE || null,
        dmfNo:      item.DMF_NO         || null,
      }));
    })
  );

  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

/* ── GET 핸들러 ── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemName = (searchParams.get('item') ?? '').trim();
  const ingrName = (searchParams.get('ingr') ?? '').trim();

  if (!itemName) return NextResponse.json({ prices: [], bioEq: [], dmf: [] });

  const apiKey = process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'DRUG_API_KEY 환경변수가 설정되지 않았습니다.', prices: [], bioEq: [], dmf: [] },
      { status: 503 },
    );
  }

  try {
    console.log(`[drug-info] item="${itemName}" ingr="${ingrName}"`);
    const [prices, bioEq, dmf] = await Promise.all([
      fetchPrices(apiKey, itemName),
      fetchBioEq(apiKey, itemName),
      ingrName ? fetchDmf(apiKey, ingrName) : Promise.resolve([] as DmfItem[]),
    ]);

    console.log(`[drug-info] → prices=${prices.length} bioEq=${bioEq.length} dmf=${dmf.length}`);
    return NextResponse.json({ prices, bioEq, dmf } satisfies DrugInfoResponse);

  } catch (e) {
    console.error('[drug-info] error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 중 오류가 발생했습니다.', prices: [], bioEq: [], dmf: [] },
      { status: 502 },
    );
  }
}
