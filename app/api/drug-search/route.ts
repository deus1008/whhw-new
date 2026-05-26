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
  itemSeq:           string;
  itemName:          string;
  entpName:          string;
  itemImage:         string | null;
  efcyQesitm:        string | null;  // 효능효과
  useMethodQesitm:   string | null;  // 용법용량
  atpnWarnQesitm:    string | null;  // 주의사항 경고
  atpnQesitm:        string | null;  // 주의사항
  intrcQesitm:       string | null;  // 상호작용
  seQesitm:          string | null;  // 부작용
  depositMethodQesitm: string | null; // 보관방법
  updateDe:          string | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query    = (searchParams.get('q') ?? '').trim();
  const pageNo   = searchParams.get('page') ?? '1';

  if (!query) return NextResponse.json({ items: [], total: 0 });

  const apiKey = process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'DRUG_API_KEY 환경변수가 설정되지 않았습니다.', items: [], total: 0 },
      { status: 503 },
    );
  }

  try {
    const url = new URL(BASE_URL);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('pageNo',     pageNo);
    url.searchParams.set('numOfRows',  '12');
    url.searchParams.set('type',       'json');
    url.searchParams.set('itemName',   query);

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },   // 5분 캐시
    });

    if (!res.ok) {
      throw new Error(`API HTTP ${res.status}`);
    }

    const json = await res.json();
    const body = json?.body;

    // API 에러 코드 처리
    const header = json?.header ?? json?.response?.header;
    if (header?.resultCode && header.resultCode !== '00') {
      throw new Error(header.resultMsg ?? 'API 오류');
    }

    const items: DrugItem[] = (body?.items ?? []).map((item: Record<string, unknown>) => ({
      itemSeq:            String(item.itemSeq ?? ''),
      itemName:           String(item.itemName ?? ''),
      entpName:           String(item.entpName ?? ''),
      itemImage:          item.itemImage ? String(item.itemImage) : null,
      efcyQesitm:         item.efcyQesitm        ? String(item.efcyQesitm) : null,
      useMethodQesitm:    item.useMethodQesitm   ? String(item.useMethodQesitm) : null,
      atpnWarnQesitm:     item.atpnWarnQesitm    ? String(item.atpnWarnQesitm) : null,
      atpnQesitm:         item.atpnQesitm        ? String(item.atpnQesitm) : null,
      intrcQesitm:        item.intrcQesitm       ? String(item.intrcQesitm) : null,
      seQesitm:           item.seQesitm          ? String(item.seQesitm) : null,
      depositMethodQesitm: item.depositMethodQesitm ? String(item.depositMethodQesitm) : null,
      updateDe:           item.updateDe          ? String(item.updateDe) : null,
    }));

    const total = Number(body?.totalCount ?? items.length);
    return NextResponse.json({ items, total, pageNo: Number(pageNo) });
  } catch (e) {
    console.error('[drug-search]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.', items: [], total: 0 },
      { status: 500 },
    );
  }
}
