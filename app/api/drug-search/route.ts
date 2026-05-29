import { NextRequest, NextResponse } from 'next/server';

/**
 * 의약품안전나라 의약품개요정보 API 프록시
 * 공공데이터포털 (data.go.kr) 서비스키 필요:
 *   DRUG_API_KEY=<서비스키(디코딩)> 환경변수 설정
 *
 * API 출처: https://www.data.go.kr/data/15075057/openapi.do
 *
 * ※ 이 API는 "쉬운 의약품 정보" 등재 품목만 검색됩니다.
 *   품목명(itemName) + 업체명(entpName) 병렬 검색으로 커버리지를 확대합니다.
 */
const BASE_URL =
  'https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';

export interface DrugItem {
  itemSeq:             string;
  itemName:            string;
  entpName:            string;
  itemImage:           string | null;
  efcyQesitm:          string | null;
  useMethodQesitm:     string | null;
  atpnWarnQesitm:      string | null;
  atpnQesitm:          string | null;
  intrcQesitm:         string | null;
  seQesitm:            string | null;
  depositMethodQesitm: string | null;
  updateDe:            string | null;
  searchType?:         'itemName' | 'entpName';  // 검색 유형 표시
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query  = (searchParams.get('q') ?? '').trim();
  const pageNo = searchParams.get('page') ?? '1';
  const searchType = searchParams.get('searchType') ?? 'auto'; // auto | itemName | entpName

  if (!query) return NextResponse.json({ items: [], total: 0 });

  const apiKey = process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'DRUG_API_KEY 환경변수가 설정되지 않았습니다.', items: [], total: 0 },
      { status: 503 },
    );
  }

  try {
    // auto 모드: itemName + entpName 병렬 검색 후 합산
    if (searchType === 'auto') {
      const [byName, byEntp] = await Promise.all([
        fetchDrugs(apiKey, { itemName: query, pageNo, numOfRows: '12' }),
        fetchDrugs(apiKey, { entpName: query, pageNo: '1', numOfRows: '12' }),
      ]);

      if (byName.error && byEntp.error) {
        return NextResponse.json({ error: byName.error, items: [], total: 0 }, { status: 502 });
      }

      // 품목명 결과가 있으면 우선 사용
      if (byName.total > 0) {
        return NextResponse.json({ items: byName.items, total: byName.total, pageNo: Number(pageNo), searchType: 'itemName' });
      }

      // 업체명 결과가 있으면 사용
      if (byEntp.total > 0) {
        return NextResponse.json({ items: byEntp.items, total: byEntp.total, pageNo: 1, searchType: 'entpName', searchNote: `"${query}" 업체명으로 검색한 결과입니다.` });
      }

      // 둘 다 0건
      return NextResponse.json({ items: [], total: 0, pageNo: 1, notInEasyDb: true });
    }

    // 명시적 검색 유형
    const params = searchType === 'entpName'
      ? { entpName: query, pageNo, numOfRows: '12' }
      : { itemName: query, pageNo, numOfRows: '12' };

    const result = await fetchDrugs(apiKey, params);
    if (result.error) return NextResponse.json({ error: result.error, items: [], total: 0 }, { status: 502 });
    return NextResponse.json({ items: result.items, total: result.total, pageNo: Number(pageNo), searchType });

  } catch (e) {
    console.error('[drug-search] unexpected:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.', items: [], total: 0 },
      { status: 500 },
    );
  }
}

/* ── 공통 fetch 함수 ─────────────────────────────────────────── */
async function fetchDrugs(
  apiKey: string,
  params: { itemName?: string; entpName?: string; pageNo: string; numOfRows: string },
): Promise<{ items: DrugItem[]; total: number; error?: string }> {
  let url = `${BASE_URL}?serviceKey=${apiKey}&pageNo=${encodeURIComponent(params.pageNo)}&numOfRows=${params.numOfRows}&type=json`;
  if (params.itemName)  url += `&itemName=${encodeURIComponent(params.itemName)}`;
  if (params.entpName)  url += `&entpName=${encodeURIComponent(params.entpName)}`;

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

  const json = await res.json();
  const response = json?.response ?? json;
  const header   = response?.header;
  const body     = response?.body;

  if (header?.resultCode && header.resultCode !== '00') {
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

  const items: DrugItem[] = rawItems.map((item: Record<string, unknown>) => ({
    itemSeq:             String(item.itemSeq ?? ''),
    itemName:            String(item.itemName ?? ''),
    entpName:            String(item.entpName ?? ''),
    itemImage:           item.itemImage           ? String(item.itemImage)           : null,
    efcyQesitm:          item.efcyQesitm          ? String(item.efcyQesitm)          : null,
    useMethodQesitm:     item.useMethodQesitm     ? String(item.useMethodQesitm)     : null,
    atpnWarnQesitm:      item.atpnWarnQesitm      ? String(item.atpnWarnQesitm)      : null,
    atpnQesitm:          item.atpnQesitm          ? String(item.atpnQesitm)          : null,
    intrcQesitm:         item.intrcQesitm         ? String(item.intrcQesitm)         : null,
    seQesitm:            item.seQesitm            ? String(item.seQesitm)            : null,
    depositMethodQesitm: item.depositMethodQesitm ? String(item.depositMethodQesitm) : null,
    updateDe:            item.updateDe            ? String(item.updateDe)            : null,
  }));

  const total = Number(body?.totalCount ?? items.length);
  return { items, total };
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
    case 500: return 'data.go.kr 서버 오류입니다. 잠시 후 다시 시도해 주세요.';
    default:  return `API 오류 (HTTP ${status})${detail ? `: ${detail}` : ''}`;
  }
}

/* ── data.go.kr resultCode별 메시지 ─────────────────────────── */
function getResultCodeMessage(code: string, msg?: string): string {
  const map: Record<string, string> = {
    '01': '어플리케이션 인증 실패 — 서비스키를 확인해 주세요.',
    '02': '데이터 없음',
    '03': '서비스 제공 기간 만료',
    '04': '일일 요청 횟수 초과',
    '05': '서비스 준비 중',
    '10': '잘못된 요청 파라미터',
    '22': '서비스키 미등록',
  };
  return map[code] ?? (msg || `API 오류 (resultCode: ${code})`);
}
