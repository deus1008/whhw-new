import { NextRequest, NextResponse } from 'next/server';

/**
 * 요양기관(병원·의원·약국) 검색 API 프록시
 *
 * 환경변수: MEDICAL_API_KEY=<data.go.kr 서비스키(디코딩)>
 *
 * ※ End Point는 data.go.kr 마이페이지에서 활용신청한 서비스의 URL 확인 필요
 *   현재 설정값: HIRA 건강보험심사평가원 요양기관정보서비스
 */

const HOSP_URL =
  process.env.MEDICAL_BASE_URL ??
  'https://apis.data.go.kr/B551182/MdInsttInfoService01/getMdInsttInfo01';

export interface MedicalItem {
  ykiho:      string;        // 요양기관기호 (고유키)
  yadmNm:     string;        // 요양기관명
  clCd:       string;        // 종별코드
  clCdNm:     string;        // 종별코드명 (병원/의원/약국 등)
  addr:       string;        // 주소
  telno:      string;        // 전화번호
  dgsbjtCdNm: string | null; // 진료과목명
  sidoCdNm:   string | null; // 시도명
  sgguCdNm:   string | null; // 시군구명
  postNo:     string | null; // 우편번호
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query   = (searchParams.get('q') ?? '').trim();
  const type    = searchParams.get('type') ?? 'hospital'; // hospital | pharmacy
  const pageNo  = searchParams.get('page') ?? '1';

  if (!query) return NextResponse.json({ items: [], total: 0 });

  const apiKey = process.env.MEDICAL_API_KEY ?? process.env.DRUG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'MEDICAL_API_KEY 환경변수가 설정되지 않았습니다.', items: [], total: 0 },
      { status: 503 },
    );
  }

  try {
    let url = `${HOSP_URL}?serviceKey=${apiKey}&pageNo=${encodeURIComponent(pageNo)}&numOfRows=12&type=json&yadmNm=${encodeURIComponent(query)}`;

    // 약국 전용: 종별코드 81 고정
    if (type === 'pharmacy') url += '&clCd=81';

    console.log(`[medical-search] ${type} "${query}" p${pageNo} → ${HOSP_URL}`);

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[medical-search] HTTP', res.status, txt.slice(0, 200));
      return NextResponse.json(
        { error: httpMessage(res.status), items: [], total: 0 },
        { status: 502 },
      );
    }

    const json = await res.json();
    const response = json?.response ?? json;
    const header   = response?.header;
    const body     = response?.body;

    if (header?.resultCode && header.resultCode !== '00') {
      if (header.resultCode === '03') {
        return NextResponse.json({ items: [], total: 0 });
      }
      console.error('[medical-search] resultCode', header.resultCode, header.resultMsg);
      return NextResponse.json(
        { error: resultCodeMessage(header.resultCode, header.resultMsg), items: [], total: 0 },
        { status: 502 },
      );
    }

    const rawItems = Array.isArray(body?.items)
      ? body.items
      : Array.isArray(body?.items?.item)
        ? body.items.item
        : body?.items?.item
          ? [body.items.item]
          : [];

    const items: MedicalItem[] = rawItems.map((item: Record<string, unknown>) => ({
      ykiho:      String(item.ykiho    ?? item.YKIHO    ?? ''),
      yadmNm:     String(item.yadmNm   ?? item.YADM_NM  ?? item.YADMNM ?? ''),
      clCd:       String(item.clCd     ?? item.CL_CD    ?? ''),
      clCdNm:     String(item.clCdNm   ?? item.CL_CD_NM ?? ''),
      addr:       String(item.addr     ?? item.ADDR     ?? ''),
      telno:      String(item.telno    ?? item.TELNO    ?? ''),
      dgsbjtCdNm: item.dgsbjtCdNm ?? item.DGSBJ_CD_NM ? String(item.dgsbjtCdNm ?? item.DGSBJ_CD_NM) : null,
      sidoCdNm:   item.sidoCdNm   ?? item.SIDO_CD_NM  ? String(item.sidoCdNm   ?? item.SIDO_CD_NM)  : null,
      sgguCdNm:   item.sgguCdNm   ?? item.SGGU_CD_NM  ? String(item.sgguCdNm   ?? item.SGGU_CD_NM)  : null,
      postNo:     item.postNo     ?? item.POST_NO      ? String(item.postNo     ?? item.POST_NO)      : null,
    }));

    // 병원 탭에서 약국(clCd=81) 결과 제외
    const filtered = type === 'hospital'
      ? items.filter(it => it.clCd !== '81' && it.clCd !== '92')
      : items;

    const total = Number(body?.totalCount ?? filtered.length);
    console.log(`[medical-search] → ${filtered.length}건 / 전체 ${total}건`);

    return NextResponse.json({
      items: filtered,
      total,
      pageNo: Number(pageNo),
      type,
    });

  } catch (e) {
    console.error('[medical-search] unexpected:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '검색 중 오류가 발생했습니다.', items: [], total: 0 },
      { status: 500 },
    );
  }
}

function httpMessage(status: number): string {
  if (status === 401 || status === 403) return '인증 실패 — MEDICAL_API_KEY를 확인해 주세요.';
  if (status === 500) return 'API 서버 오류 (500) — 서비스키 인증 또는 엔드포인트를 확인해 주세요.';
  return `API 오류 (HTTP ${status})`;
}

function resultCodeMessage(code: string, msg?: string): string {
  const map: Record<string, string> = {
    '01': '인증 실패 — 서비스키를 확인해 주세요.',
    '02': '데이터 없음',
    '04': '일일 요청 횟수 초과',
    '22': '서비스키 미등록',
  };
  return map[code] ?? (msg || `API 오류 (${code})`);
}
