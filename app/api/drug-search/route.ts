import { NextRequest, NextResponse } from 'next/server';

/**
 * 의약품 검색 API 프록시 — 3단 폴백 구조
 *
 * 1차: DrbEasyDrugInfoService   — 쉬운 의약품 정보 (일반의약품 중심)
 * 2차: DrugPrdtPrmsnInfoService — 의약품 제품허가 정보 (전문·일반 전체)
 * 3차: nedrug.mfds.go.kr        — 식약처 의약품통합정보 (공개 API)
 *
 * 환경변수: DRUG_API_KEY=<data.go.kr 서비스키(디코딩)>
 */

const EASY_DRUG_URL =
  'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';

const PRMSN_INFO_URL =
  'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06';

const NEDRUG_URL =
  'https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetailList';

export interface DrugItem {
  itemSeq:             string;
  itemName:            string;
  entpName:            string;
  itemImage:           string | null;
  ingrName:            string | null;  // 성분명
  bioeqYn:             string | null;  // 생동성 시험 여부 (Y/N) — 허가정보 API
  efcyQesitm:          string | null;
  useMethodQesitm:     string | null;
  atpnWarnQesitm:      string | null;
  atpnQesitm:          string | null;
  intrcQesitm:         string | null;
  seQesitm:            string | null;
  depositMethodQesitm: string | null;
  updateDe:            string | null;
  etcOtcCode:          string | null;  // 전문의약품 / 일반의약품
  className:           string | null;  // 약효분류명
  searchType?:         'itemName' | 'entpName';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query      = (searchParams.get('q') ?? '').trim();
  const pageNo     = searchParams.get('page') ?? '1';
  const searchType = searchParams.get('searchType') ?? 'auto';

  if (!query) return NextResponse.json({ items: [], total: 0 });

  const apiKey = process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'DRUG_API_KEY 환경변수가 설정되지 않았습니다.', items: [], total: 0 },
      { status: 503 },
    );
  }

  try {
    /* ── 명시적 검색 유형 ── */
    if (searchType !== 'auto') {
      const params = searchType === 'entpName'
        ? { entpName: query, pageNo, numOfRows: '12' }
        : { itemName: query, pageNo, numOfRows: '12' };
      const result = await fetchFromEasyDrug(apiKey, params);
      if (result.error) return NextResponse.json({ error: result.error, items: [], total: 0 }, { status: 502 });
      return NextResponse.json({ items: result.items, total: result.total, pageNo: Number(pageNo), searchType, source: 'easyDrug' });
    }

    /* ═══════════════════════════════════════════
       AUTO 모드: 3단 폴백 (nedrug → 허가DB → 쉬운DB)
    ═══════════════════════════════════════════ */

    /* 1차 — nedrug.mfds.go.kr 공개 API */
    const byNedrug = await fetchFromNedrug(query, pageNo);
    console.log(`[drug-search] 1차 nedrug: total=${byNedrug.total} error=${byNedrug.error ?? '-'}`);
    if (byNedrug.total > 0) {
      return NextResponse.json({
        items: byNedrug.items, total: byNedrug.total,
        pageNo: Number(pageNo), searchType: 'itemName', source: 'nedrug',
        searchNote: `식약처 의약품통합정보에서 검색한 결과입니다.`,
      });
    }

    /* 2차 — DrugPrdtPrmsnInfoService (전문·일반 전체 허가 DB) */
    const byPrmsn = await fetchFromPrmsnInfo(apiKey, query, pageNo);
    console.log(`[drug-search] 2차 prmsn: total=${byPrmsn.total} error=${byPrmsn.error ?? '-'}`);
    if (byPrmsn.total > 0) {
      return NextResponse.json({
        items: byPrmsn.items, total: byPrmsn.total,
        pageNo: Number(pageNo), searchType: 'itemName', source: 'prmsn',
        searchNote: `의약품 허가 정보에서 검색한 결과입니다. 상세 복약 안내는 의약품안전나라를 확인하세요.`,
      });
    }

    /* 3차 — DrbEasyDrugInfoService (itemName + entpName 병렬) */
    const [byName, byEntp] = await Promise.all([
      fetchFromEasyDrug(apiKey, { itemName: query, pageNo, numOfRows: '12' }),
      fetchFromEasyDrug(apiKey, { entpName: query, pageNo: '1', numOfRows: '12' }),
    ]);
    console.log(`[drug-search] 3차 easyDrug: name=${byName.total} entp=${byEntp.total} err=${byName.error ?? '-'}`);

    // 인증 실패 등 치명적 오류 → 즉시 반환
    if (byName.error && byName.error.length > 0 && byEntp.total === 0) {
      return NextResponse.json({ error: byName.error, items: [], total: 0 }, { status: 502 });
    }

    if (byName.total > 0) {
      return NextResponse.json({
        items: byName.items, total: byName.total,
        pageNo: Number(pageNo), searchType: 'itemName', source: 'easyDrug',
      });
    }

    if (byEntp.total > 0) {
      return NextResponse.json({
        items: byEntp.items, total: byEntp.total,
        pageNo: 1, searchType: 'entpName', source: 'easyDrug',
        searchNote: `"${query}" 업체명으로 검색한 결과입니다.`,
      });
    }

    /* 전체 0건 */
    console.log(`[drug-search] 전체 0건 — q="${query}"`);
    return NextResponse.json({ items: [], total: 0, pageNo: 1, notInAnyDb: true });

  } catch (e) {
    console.error('[drug-search] unexpected:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.', items: [], total: 0 },
      { status: 500 },
    );
  }
}

/* ══════════════════════════════════════════════════════════════
   1차: DrbEasyDrugInfoService
══════════════════════════════════════════════════════════════ */
async function fetchFromEasyDrug(
  apiKey: string,
  params: { itemName?: string; entpName?: string; pageNo: string; numOfRows: string },
): Promise<{ items: DrugItem[]; total: number; error?: string }> {
  let url = `${EASY_DRUG_URL}?serviceKey=${apiKey}&pageNo=${encodeURIComponent(params.pageNo)}&numOfRows=${params.numOfRows}&type=json`;
  if (params.itemName) url += `&itemName=${encodeURIComponent(params.itemName)}`;
  if (params.entpName) url += `&entpName=${encodeURIComponent(params.entpName)}`;

  return fetchDataGoKr(url, (item) => ({
    itemSeq:             String(item.itemSeq ?? ''),
    itemName:            String(item.itemName ?? ''),
    entpName:            String(item.entpName ?? ''),
    itemImage:           item.itemImage           ? String(item.itemImage)           : null,
    ingrName:            null,
    bioeqYn:             null,
    efcyQesitm:          item.efcyQesitm          ? String(item.efcyQesitm)          : null,
    useMethodQesitm:     item.useMethodQesitm     ? String(item.useMethodQesitm)     : null,
    atpnWarnQesitm:      item.atpnWarnQesitm      ? String(item.atpnWarnQesitm)      : null,
    atpnQesitm:          item.atpnQesitm          ? String(item.atpnQesitm)          : null,
    intrcQesitm:         item.intrcQesitm         ? String(item.intrcQesitm)         : null,
    seQesitm:            item.seQesitm            ? String(item.seQesitm)            : null,
    depositMethodQesitm: item.depositMethodQesitm ? String(item.depositMethodQesitm) : null,
    updateDe:            item.updateDe            ? String(item.updateDe)            : null,
    etcOtcCode:          null,
    className:           null,
  }));
}

/* ══════════════════════════════════════════════════════════════
   2차: DrugPrdtPrmsnInfoService07 (의약품 제품허가 정보 v07)
   — getDrugPrdtPrmsnDtlInq06: 상세정보 (전문·일반 전체, item_name 필터)
══════════════════════════════════════════════════════════════ */

/** XML 태그·CDATA 래퍼 제거 후 순수 텍스트 반환 */
function extractXmlText(xml: unknown): string | null {
  if (!xml || typeof xml !== 'string') return null;
  let text = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'); // CDATA unwrap
  text = text.replace(/<[^>]+>/g, ' ');                        // 태그 제거
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  text = text.replace(/\s+/g, ' ').trim();
  return text || null;
}

function prmsnMapper(item: Record<string, unknown>): DrugItem {
  return {
    itemSeq:             String(item.ITEM_SEQ          ?? ''),
    itemName:            String(item.ITEM_NAME         ?? ''),
    entpName:            String(item.ENTP_NAME         ?? ''),
    itemImage:           null,
    ingrName:            item.ITEM_INGR_NAME ? String(item.ITEM_INGR_NAME) : null,
    bioeqYn:             item.BIOEQ_YN       ? String(item.BIOEQ_YN).trim().toUpperCase() : null,
    efcyQesitm:          extractXmlText(item.EE_DOC_DATA),
    useMethodQesitm:     extractXmlText(item.UD_DOC_DATA),
    atpnWarnQesitm:      null,
    atpnQesitm:          extractXmlText(item.NB_DOC_DATA),
    intrcQesitm:         null,
    seQesitm:            null,
    depositMethodQesitm: item.STORAGE_METHOD ? String(item.STORAGE_METHOD) : null,
    updateDe:            item.ITEM_PERMIT_DATE ? String(item.ITEM_PERMIT_DATE) : null,
    etcOtcCode:          item.ETC_OTC_CODE    ? String(item.ETC_OTC_CODE)    : null,
    className:           item.CHART           ? String(item.CHART)           : null,
  };
}

async function fetchFromPrmsnInfo(
  apiKey: string,
  query: string,
  pageNo: string,
): Promise<{ items: DrugItem[]; total: number; error?: string }> {
  // ★ 파라미터명: item_name (언더스코어) — itemName 이면 전체목록 반환됨
  const qs = `serviceKey=${apiKey}&pageNo=${encodeURIComponent(pageNo)}&numOfRows=12&type=json&item_name=${encodeURIComponent(query)}`;
  return fetchDataGoKr(`${PRMSN_INFO_URL}?${qs}`, prmsnMapper);
}

/* ══════════════════════════════════════════════════════════════
   3차: nedrug.mfds.go.kr 공개 API
   — JSON 응답이 있을 경우만 사용 (HTML 반환 시 graceful fallback)
══════════════════════════════════════════════════════════════ */
async function fetchFromNedrug(
  query: string,
  pageNo: string,
): Promise<{ items: DrugItem[]; total: number; error?: string }> {
  try {
    const url = `${NEDRUG_URL}?pageNo=${encodeURIComponent(pageNo)}&limit=12&totalPages=&itemName=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.log(`[drug-search] nedrug HTTP ${res.status}`);
      return { items: [], total: 0, error: `nedrug HTTP ${res.status}` };
    }

    const contentType = res.headers.get('content-type') ?? '';
    console.log(`[drug-search] nedrug content-type: ${contentType}`);

    if (!contentType.includes('json')) {
      // HTML 응답 — JSON API가 아님
      return { items: [], total: 0, error: 'nedrug: HTML response (not a JSON API)' };
    }

    const json = await res.json();
    const list  = Array.isArray(json?.list) ? json.list : [];
    const total = Number(json?.totalCount ?? list.length);

    const items: DrugItem[] = list.map((item: Record<string, unknown>) => ({
      itemSeq:             String(item.ITEM_SEQ   ?? item.itemSeq   ?? ''),
      itemName:            String(item.ITEM_NAME  ?? item.itemName  ?? ''),
      entpName:            String(item.ENTP_NAME  ?? item.entpName  ?? ''),
      itemImage:           (item.BIG_PRDT_IMG_URL ?? item.itemImage) ? String(item.BIG_PRDT_IMG_URL ?? item.itemImage) : null,
      ingrName:            (item.INGR_NAME ?? item.ITEM_INGR_NAME)  ? String(item.INGR_NAME ?? item.ITEM_INGR_NAME)  : null,
      bioeqYn:             item.BIOEQ_YN ? String(item.BIOEQ_YN).trim().toUpperCase() : null,
      efcyQesitm:          null,
      useMethodQesitm:     null,
      atpnWarnQesitm:      null,
      atpnQesitm:          null,
      intrcQesitm:         null,
      seQesitm:            null,
      depositMethodQesitm: null,
      updateDe:            (item.ITEM_PERMIT_DATE ?? item.permitDate) ? String(item.ITEM_PERMIT_DATE ?? item.permitDate) : null,
      etcOtcCode:          (item.ETC_OTC_CODE ?? item.etcOtcCode)    ? String(item.ETC_OTC_CODE ?? item.etcOtcCode)    : null,
      className:           (item.CLASS_NAME    ?? item.className)    ? String(item.CLASS_NAME   ?? item.className)    : null,
    }));

    return { items, total };
  } catch (e) {
    console.error('[drug-search] nedrug fetch failed:', e);
    return { items: [], total: 0, error: 'nedrug fetch failed' };
  }
}

/* ══════════════════════════════════════════════════════════════
   공통: data.go.kr JSON 응답 파싱
══════════════════════════════════════════════════════════════ */
async function fetchDataGoKr(
  url: string,
  mapper: (item: Record<string, unknown>) => DrugItem,
): Promise<{ items: DrugItem[]; total: number; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      let detail = '';
      try {
        const txt = await res.text();
        const match = txt.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/) ??
                      txt.match(/<errMsg>([^<]*)<\/errMsg>/) ??
                      txt.match(/"message"\s*:\s*"([^"]+)"/);
        detail = match ? match[1] : txt.slice(0, 200);
      } catch { /* ignore */ }
      console.error('[drug-search] HTTP', res.status, detail);
      return { items: [], total: 0, error: getStatusMessage(res.status, detail) };
    }

    const json     = await res.json();
    const response = json?.response ?? json;
    const header   = response?.header;
    const body     = response?.body;

    if (header?.resultCode && header.resultCode !== '00') {
      // 02 = 데이터 없음 → 오류 아님, 그냥 0건
      if (header.resultCode === '02') return { items: [], total: 0 };
      console.error('[drug-search] resultCode', header.resultCode, header.resultMsg);
      return { items: [], total: 0, error: getResultCodeMessage(header.resultCode, header.resultMsg) };
    }

    const rawItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.items?.item)
        ? body.items.item
        : body?.items?.item
          ? [body.items.item]
          : [];

    const items = rawItems.map(mapper);
    const total = Number(body?.totalCount ?? items.length);
    return { items, total };

  } catch (e) {
    console.error('[drug-search] fetchDataGoKr error:', e);
    return { items: [], total: 0, error: 'fetch failed' };
  }
}

/* ── HTTP 상태 코드별 사용자 메시지 ─────────────────────────── */
function getStatusMessage(status: number, detail: string): string {
  switch (status) {
    case 401: return '인증 실패 — 서비스키를 확인해 주세요.';
    case 403:
      if (detail.includes('SERVICE_ACCESS_DENIED_ERROR'))
        return '서비스 접근이 거부되었습니다. data.go.kr에서 해당 API를 신청(활용신청)했는지 확인해 주세요.';
      if (detail.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR'))
        return '일일 요청 횟수를 초과했습니다.';
      return `API 접근 거부 (403)${detail ? ` — ${detail}` : ''}`;
    case 500: return '';   // 빈 문자열 → 오류 아님으로 처리 (미인증 서비스 → 0건 폴백)
    default:  return `API 오류 (HTTP ${status})${detail ? `: ${detail}` : ''}`;
  }
}

/* ── data.go.kr resultCode별 메시지 ─────────────────────────── */
function getResultCodeMessage(code: string, msg?: string): string {
  const map: Record<string, string> = {
    '01': '어플리케이션 인증 실패 — 서비스키를 확인해 주세요.',
    '02': '',   // 데이터 없음 → 오류 아님
    '03': '서비스 제공 기간 만료',
    '04': '일일 요청 횟수 초과',
    '05': '서비스 준비 중',
    '10': '잘못된 요청 파라미터',
    '22': '서비스키 미등록',
  };
  return map[code] ?? (msg || `API 오류 (resultCode: ${code})`);
}
