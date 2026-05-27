import { NextRequest, NextResponse } from 'next/server';

/**
 * 의약품안전나라 의약품개요정보 API 프록시
 * 공공데이터포털 (data.go.kr) 서비스키 필요:
 *   DRUG_API_KEY=<서비스키(디코딩)> 환경변수 설정
 *
 * API 출처: https://www.data.go.kr/data/15075057/openapi.do
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
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query  = (searchParams.get('q') ?? '').trim();
  const pageNo = searchParams.get('page') ?? '1';

  if (!query) return NextResponse.json({ items: [], total: 0 });

  const apiKey = process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'DRUG_API_KEY 환경변수가 설정되지 않았습니다.', items: [], total: 0 },
      { status: 503 },
    );
  }

  try {
    /**
     * ⚠ serviceKey는 URLSearchParams를 사용하면 이중 인코딩됩니다.
     *   data.go.kr는 인코딩된 키를 그대로 URL에 붙여야 하므로
     *   serviceKey만 직접 문자열로 조립합니다.
     */
    const url =
      `${BASE_URL}` +
      `?serviceKey=${apiKey}` +
      `&pageNo=${encodeURIComponent(pageNo)}` +
      `&numOfRows=12` +
      `&type=json` +
      `&itemName=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });

    // 에러 시 응답 바디까지 읽어 원인 파악
    if (!res.ok) {
      let detail = '';
      try {
        const txt = await res.text();
        // XML 에러 메시지 추출 시도
        const match = txt.match(/<returnReasonCode>([^<]*)<\/returnReasonCode>/) ??
                      txt.match(/<errMsg>([^<]*)<\/errMsg>/) ??
                      txt.match(/"message"\s*:\s*"([^"]+)"/);
        detail = match ? match[1] : txt.slice(0, 200);
      } catch { /* ignore */ }

      const msg = getStatusMessage(res.status, detail);
      console.error('[drug-search] HTTP', res.status, detail);
      return NextResponse.json({ error: msg, items: [], total: 0 }, { status: 502 });
    }

    const json = await res.json();

    // data.go.kr 응답 구조: { response: { header, body } } 또는 { header, body }
    const response = json?.response ?? json;
    const header   = response?.header;
    const body     = response?.body;

    if (header?.resultCode && header.resultCode !== '00') {
      const msg = getResultCodeMessage(header.resultCode, header.resultMsg);
      console.error('[drug-search] resultCode', header.resultCode, header.resultMsg);
      return NextResponse.json({ error: msg, items: [], total: 0 }, { status: 502 });
    }

    const rawItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.items?.item)
        ? body.items.item   // 일부 버전은 { items: { item: [...] } }
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
    return NextResponse.json({ items, total, pageNo: Number(pageNo) });

  } catch (e) {
    console.error('[drug-search] unexpected:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.', items: [], total: 0 },
      { status: 500 },
    );
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
      return `API 접근 거부 (403)${detail ? ` — ${detail}` : ''}. data.go.kr에서 "의약품개요정보" API 활용신청 여부를 확인해 주세요.`;
    case 500: return 'data.go.kr 서버 오류입니다. 잠시 후 다시 시도해 주세요.';
    default:  return `API 오류 (HTTP ${status})${detail ? `: ${detail}` : ''}`;
  }
}

/* ── data.go.kr resultCode별 메시지 ────────────────────────── */
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
