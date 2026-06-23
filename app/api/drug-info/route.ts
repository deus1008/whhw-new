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
  ingrName:  string | null;  // 성분명·용량 (주성분명)
}

export interface BioEqItem {
  itemName:         string;         // 생동 인정 품목명
  ingrName:         string | null;
  noticeDate:       string | null;  // 고시일자 YYYYMMDD
  entpName:         string | null;  // 업체명
  crossRecognized?: boolean;        // 동일계열 타 용량 기준 인정 여부
}

export interface DmfItem {
  ingrName:    string;
  entpName:    string | null;   // 국내 등록업체
  mnfctrName:  string | null;   // 실제 제조업체명
  mnfctrPlace: string | null;   // 제조소 주소
  country:     string | null;   // 제조국
  permitDate:  string | null;   // 등록일 YYYY-MM-DD
  dmfNo:       string | null;   // DMF 허가번호 (DMF_PERMIT_NO)
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

/* ── DB 행 → PriceItem 변환 ── */
function mapDbRows(rows: Record<string, unknown>[]): PriceItem[] {
  return rows.map(row => ({
    itmNm:     String(row.item_name      ?? ''),
    mxCprc:    row.max_price             ? Number(row.max_price)      : null,
    payTpNm:   row.pay_type              ? String(row.pay_type)       : null,
    nomNm:     row.standard              ? String(row.standard)       : null,
    unit:      row.unit                  ? String(row.unit)           : null,
    adtStaDd:  row.effective_date        ? String(row.effective_date) : null,
    mnfEntpNm: row.manufacturer          ? String(row.manufacturer)   : null,
    ingrName:  row.ingredient_name       ? String(row.ingredient_name): null,
  }));
}

/* ── 약가 1순위: 업로드 파일(drug_prices 테이블) ── */
async function fetchPricesFromDB(itemName: string): Promise<PriceItem[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const sb = createSupabaseClient(url, key);

    // ① 전체 제품명 정밀 검색
    //   "글리젠타듀오정2.5/500밀리그램" → 해당 용량만 매칭, 1000mg/850mg 오염 없음
    const { data: exact, error: e1 } = await sb
      .from('drug_prices')
      .select('*')
      .ilike('item_name', `%${itemName}%`)
      .order('effective_date', { ascending: false })
      .limit(20);

    if (e1?.code === '42P01') return [];
    if (e1) console.warn('[drug-info] DB 약가 오류①:', e1.message);
    if (exact && exact.length > 0) {
      console.log(`[drug-info] DB ① 정밀: ${exact.length}건 ("${itemName}")`);
      return mapDbRows(exact as Record<string, unknown>[]);
    }

    // ② 괄호 앞 기본명으로 재검색
    //   API명 "글리젠타정5밀리그램(리나글립틴)" vs DB명 "글리젠타정5밀리그램(리나글립틴)_(5mg/1정)"
    //   → "글리젠타정5밀리그램" 으로 검색해 수용
    const baseName = itemName.replace(/\s*[(\（（].*$/, '').trim();
    if (baseName.length >= 4 && baseName !== itemName) {
      const { data: base, error: e2 } = await sb
        .from('drug_prices')
        .select('*')
        .ilike('item_name', `%${baseName}%`)
        .order('effective_date', { ascending: false })
        .limit(20);

      if (e2) console.warn('[drug-info] DB 약가 오류②:', e2.message);
      if (base && base.length > 0) {
        console.log(`[drug-info] DB ② 기본명: ${base.length}건 ("${baseName}")`);
        return mapDbRows(base as Record<string, unknown>[]);
      }
    }

    // ③ DB에 없음 → 빈 배열 반환, HIRA API가 처리
    //   ※ 6자 광역 폴백 제거: 동일계열 다른 용량 제품의 약가가 잘못 표시되는 문제 방지
    console.log(`[drug-info] DB 조회 없음 → HIRA API 폴백 ("${itemName}")`);
    return [];
  } catch (e) {
    console.warn('[drug-info] fetchPricesFromDB error:', e);
    return [];
  }
}

/* ── 약가 2순위: HIRA API 폴백 ── */
async function fetchPricesFromAPI(apiKey: string, itemName: string): Promise<PriceItem[]> {
  const url = `${PRICE_URL}?ServiceKey=${encodeURIComponent(apiKey)}&itmNm=${encodeURIComponent(itemName)}&numOfRows=20&pageNo=1`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
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
      ingrName:  null,
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

/* ── 동일계열 기본명 추출 ── */
// "글리젠타듀오정2.5/500밀리그램(리나글립틴/…)" → "글리젠타듀오정"
// "글리젠타서방정5밀리그램" → "글리젠타서방정" (자연스럽게 구분됨)
function extractBaseDrugName(itemName: string): string {
  const clean = itemName.replace(/\s*[(\（（].*$/, '').trim();  // 괄호 제거
  const m = clean.match(/^([^\d]+)/);                           // 첫 숫자 앞까지
  return m ? m[1].trim() : clean;
}

/* ── 생동성인정품목 1순위: DB (drug_bioequiv 테이블) ── */
async function fetchBioEqFromDB(itemName: string): Promise<BioEqItem[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const sb = createSupabaseClient(url, key);

    const { data, error } = await sb
      .from('drug_bioequiv')
      .select('item_name, company_name, ingredient_name, notice_date')
      .ilike('item_name', `%${itemName}%`)
      .order('notice_date', { ascending: false })
      .limit(30);

    if (error?.code === '42P01') return [];
    if (error) { console.warn('[drug-info] DB 생동 오류:', error.message); return []; }

    if (data && data.length > 0) {
      console.log(`[drug-info] DB 생동 직접 검색: ${data.length}건 ("${itemName}")`);
      return (data as Record<string, unknown>[]).map(r => ({
        itemName:        String(r.item_name ?? ''),
        ingrName:        r.ingredient_name ? String(r.ingredient_name) : null,
        noticeDate:      r.notice_date     ? String(r.notice_date)     : null,
        entpName:        r.company_name    ? String(r.company_name)    : null,
        crossRecognized: false,
      }));
    }

    // 기본명(숫자 이전)으로 재검색
    const baseOnly = itemName.replace(/\s*[(\（（].*$/, '').trim().replace(/[\d.\/]+.*$/, '').trim();
    if (baseOnly.length >= 3 && baseOnly !== itemName) {
      const { data: baseData, error: e2 } = await sb
        .from('drug_bioequiv')
        .select('item_name, company_name, ingredient_name, notice_date')
        .ilike('item_name', `%${baseOnly}%`)
        .order('notice_date', { ascending: false })
        .limit(30);

      if (e2) console.warn('[drug-info] DB 생동 기본명 오류:', e2.message);
      if (baseData && baseData.length > 0) {
        console.log(`[drug-info] DB 생동 기본명 검색: ${baseData.length}건 ("${baseOnly}")`);
        return (baseData as Record<string, unknown>[]).map(r => ({
          itemName:        String(r.item_name ?? ''),
          ingrName:        r.ingredient_name ? String(r.ingredient_name) : null,
          noticeDate:      r.notice_date     ? String(r.notice_date)     : null,
          entpName:        r.company_name    ? String(r.company_name)    : null,
          crossRecognized: true,
        }));
      }
    }

    return [];
  } catch (e) {
    console.warn('[drug-info] fetchBioEqFromDB error:', e);
    return [];
  }
}

/* ── 성분명 문자열 → DMF 검색 키워드 배열 ── */
// "ezetimibe 10mg, rosuvastatin calcium (as rosuvastatin 10mg)"
//   → ["ezetimibe", "rosuvastatin calcium"]
// "에제티미브/로수바스타틴칼슘(로수바스타틴으로서)"
//   → ["에제티미브", "로수바스타틴칼슘"]
function extractDmfKeywords(raw: string): string[] {
  return raw
    .replace(/\([^)]*\)/g, '')          // (as rosuvastatin 10mg) 등 괄호+내용 제거
    .split(/[,\/]/)                      // 쉼표·슬래시 분리
    .map(s => s.replace(/\s+\d[\s\S]*$/, '').trim())  // " 10mg" 이후 용량 제거
    .filter(s => s.length >= 3);
}

/* ── 원료DMF 1순위: DB (drug_dmf 테이블) ── */
async function fetchDmfFromDB(ingrName: string): Promise<DmfItem[]> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const ingredients = extractDmfKeywords(ingrName);

  try {
    const sb = createSupabaseClient(url, key);
    const results: DmfItem[] = [];

    for (const ingr of ingredients) {
      const { data, error } = await sb
        .from('drug_dmf')
        .select('ingredient_name, company_name, manufacturer_name, manufacturer_address, country, registration_date, dmf_number')
        .ilike('ingredient_name', `%${ingr}%`)
        .order('registration_date', { ascending: false })
        .limit(50);

      if (error?.code === '42P01') return [];
      if (error) { console.warn('[drug-info] DB DMF 오류:', error.message); continue; }

      if (data && data.length > 0) {
        console.log(`[drug-info] DB DMF: ${data.length}건 ("${ingr}")`);
        results.push(...(data as Record<string, unknown>[]).map(r => ({
          ingrName:    String(r.ingredient_name ?? ingr),
          entpName:    r.company_name         ? String(r.company_name)         : null,
          mnfctrName:  r.manufacturer_name    ? String(r.manufacturer_name)    : null,
          mnfctrPlace: r.manufacturer_address ? String(r.manufacturer_address) : null,
          country:     r.country              ? String(r.country)              : null,
          permitDate:  r.registration_date    ? String(r.registration_date)    : null,
          dmfNo:       r.dmf_number           ? String(r.dmf_number)           : null,
        })));
      }
    }

    return results;
  } catch (e) {
    console.warn('[drug-info] fetchDmfFromDB error:', e);
    return [];
  }
}

/* ── 생동성인정품목 (MFDS) ── */
async function fetchBioEq(apiKey: string, itemName: string): Promise<BioEqItem[]> {
  async function doFetch(name: string): Promise<Omit<BioEqItem, 'crossRecognized'>[]> {
    const url = `${BIOEQ_URL}?serviceKey=${encodeURIComponent(apiKey)}&item_name=${encodeURIComponent(name)}&numOfRows=20&pageNo=1`;
    try {
      const res = await fetch(url, { next: { revalidate: 86400 } });
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

  // ① 제품명 직접 검색
  const direct = await doFetch(itemName);
  if (direct.length > 0) return direct.map(b => ({ ...b, crossRecognized: false }));

  // ② 동일계열 기본명으로 재검색 (숫자·용량 이전 문자열)
  //    글리젠타듀오정2.5/500mg → 글리젠타듀오정 → 2.5/1000mg 등 다른 용량도 포함
  //    서방정/정 등 제형이 다르면 기본명이 달라 자동 구분됨
  const baseName = extractBaseDrugName(itemName);
  if (baseName !== itemName && baseName.length >= 3) {
    const cross = await doFetch(baseName);
    if (cross.length > 0) {
      console.log(`[drug-info] 생동 계열 인정: "${itemName}" → 기본명 "${baseName}" (${cross.length}건)`);
      return cross.map(b => ({ ...b, crossRecognized: true }));
    }
  }

  return [];
}

/* ── 원료 DMF (MFDS) — 성분명별 병렬 검색 ── */
async function fetchDmf(apiKey: string, ingrName: string): Promise<DmfItem[]> {
  const ingredients = extractDmfKeywords(ingrName);

  const results = await Promise.allSettled(
    ingredients.map(async (ingr) => {
      const url = `${DMF_URL}?serviceKey=${encodeURIComponent(apiKey)}&ingr_kor_name=${encodeURIComponent(ingr)}&numOfRows=50&pageNo=1`;
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (!res.ok) { console.warn('[drug-info] DMF HTTP', res.status, ingr); return [] as DmfItem[]; }
      const xml = await res.text();
      return parseXmlItems(xml).map(item => ({
        ingrName:    item.INGR_KOR_NAME          || ingr,
        entpName:    item.ENTP_NAME              || null,
        mnfctrName:  item.MNFCTR_NAME            || null,
        mnfctrPlace: item.MNFCTR_PLACE           || null,
        country:     item.MANUF_COUNTRY_CODE_NM  || null,
        permitDate:  item.DMF_PERMIT_DATE        || null,
        dmfNo:       item.DMF_PERMIT_NO          || null,  // 실제 필드명 DMF_PERMIT_NO
      }));
    })
  );

  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

/* ── 용량 정렬용 숫자 추출 (단위 정규화: g > mg > mcg 스케일) ── */
function extractDosageValue(ingrName: string | null | undefined): number {
  if (!ingrName) return -1;
  // "아토르바스타틴칼슘 10mg", "chloral hydrate 9.5g(0.1g/mL)", "에제티미브 10mg/로수바스타틴 5mg" 등
  const match = ingrName.match(/(\d+(?:\.\d+)?)\s*(g|mg|mcg|μg|ug|ml|mL|L|IU|만IU)/i);
  if (!match) {
    // 단위 없이 숫자만 있는 경우 (예: "10")
    const num = ingrName.match(/(\d+(?:\.\d+)?)/);
    return num ? parseFloat(num[1]) : -1;
  }
  const value = parseFloat(match[1]);
  const unit  = match[2].toLowerCase();
  switch (unit) {
    case 'g':   return value * 1_000_000;
    case 'mg':  return value * 1_000;
    case 'mcg':
    case 'μg':
    case 'ug':  return value;
    default:    return value * 1_000; // mL, IU 등은 mg 스케일로 취급
  }
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
    // 생동·DMF: DB 우선 → DB에 없으면 MFDS API 폴백
    async function resolveBioEq(): Promise<BioEqItem[]> {
      const db = await fetchBioEqFromDB(itemName);
      if (db.length > 0) { console.log(`[drug-info] 생동 DB: ${db.length}건`); return db; }
      console.log('[drug-info] 생동 DB 없음 → MFDS API 폴백');
      return fetchBioEq(apiKey!, itemName);
    }
    // prices · bioEq 먼저 — prices의 ingredient를 DMF 폴백 소스로 활용
    const [prices, bioEq] = await Promise.all([
      fetchPrices(apiKey, itemName),
      resolveBioEq(),
    ]);

    // ingr 파라미터 없으면 prices[0].ingrName을 사용 (easyDrug 소스 대응)
    const effectiveIngr = ingrName || prices.find(p => p.ingrName)?.ingrName || '';
    async function resolveDmf(): Promise<DmfItem[]> {
      if (!effectiveIngr) return [];
      const db = await fetchDmfFromDB(effectiveIngr);
      if (db.length > 0) { console.log(`[drug-info] DMF DB: ${db.length}건`); return db; }
      console.log('[drug-info] DMF DB 없음 → MFDS API 폴백');
      return fetchDmf(apiKey!, effectiveIngr);
    }

    const dmf = await resolveDmf();

    // 약가 용량 높은 순 정렬 (ingrName에서 숫자+단위 추출 후 정규화)
    prices.sort((a, b) => extractDosageValue(b.ingrName) - extractDosageValue(a.ingrName));

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
