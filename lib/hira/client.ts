/**
 * 건강보험심사평가원(HIRA) 약제급여목록 API 클라이언트
 *
 * 공공데이터포털(data.go.kr) API 키 필요:
 *   서비스명: 건강보험심사평가원_보험의약품정보서비스
 *   발급: https://www.data.go.kr → 회원가입 → 서비스 신청 → 1~2일 승인
 *
 * 환경변수: HIRA_API_KEY (공공데이터포털에서 발급받은 일반인증키, URL 인코딩 불필요)
 *
 * 주요 반환 필드:
 *   ITEM_SEQ      품목일련번호 (식약처 연계 키)
 *   ITEM_NAME     품목명
 *   ENTP_NAME     업체명
 *   MAIN_INGR_ENG 주성분(영문)
 *   ATC_CODE      ATC 코드
 *   ATC_NAME      ATC 한글명
 *   MEDI_PAY_YN   급여여부 (Y/N)
 *   MAX_PRICE     상한가 (원)
 */

const BASE = 'https://apis.data.go.kr/B551182/msInfrMedBassInfoService';

export interface HiraDrugItem {
  itemSeq:    string;
  itemName:   string;
  entpName:   string;
  atcCode:    string;
  atcName:    string;
  mediPayYn:  string;  // Y=급여, N=비급여
  maxPrice:   number | null;
  ingrName:   string;
}

export interface HiraAtcItem {
  code:    string;
  nameKo:  string;
  level:   number;
  parent:  string | null;
}

interface RawItem {
  ITEM_SEQ?: string;
  ITEM_NAME?: string;
  ENTP_NAME?: string;
  ATC_CODE?: string;
  ATC_NAME?: string;
  MEDI_PAY_YN?: string;
  MAX_PRICE?: string | number;
  MAIN_INGR?: string;
  INGR_NAME?: string;
}

function apiKey(): string {
  const k = process.env.HIRA_API_KEY;
  if (!k) throw new Error('HIRA_API_KEY 환경변수가 설정되지 않았습니다.');
  return k;
}

function parsePrice(v: string | number | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[,\s원]/g, ''));
  return isNaN(n) ? null : n;
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
 * 성분명 또는 품목명으로 HIRA 약제급여목록 검색
 * pageNo 1-based, numOfRows 최대 100
 */
export async function searchHiraDrugs(opts: {
  ingrName?: string;
  itemName?: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<{ items: HiraDrugItem[]; totalCount: number }> {
  const key = apiKey();
  const params = new URLSearchParams({
    serviceKey: key,
    type:       'json',
    numOfRows:  String(opts.numOfRows ?? 100),
    pageNo:     String(opts.pageNo ?? 1),
  });
  if (opts.ingrName) params.set('ingrName', opts.ingrName);
  if (opts.itemName) params.set('itemName', opts.itemName);

  const url = `${BASE}/getInfrMedBassInfoList?${params}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`HIRA API 오류: ${res.status}`);

  const json = await res.json();
  const body = json?.response?.body;
  const items = (body?.items?.item ?? []) as RawItem[];
  const totalCount = Number(body?.totalCount ?? 0);

  return {
    items: (Array.isArray(items) ? items : [items]).map(normalizeItem),
    totalCount,
  };
}

/**
 * 품목명 목록으로 HIRA 정보 일괄 조회 (청크 단위 처리)
 */
export async function fetchHiraByItemNames(
  names: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<HiraDrugItem[]> {
  const results: HiraDrugItem[] = [];
  for (let i = 0; i < names.length; i++) {
    try {
      const { items } = await searchHiraDrugs({ itemName: names[i], numOfRows: 10 });
      results.push(...items);
    } catch (e) {
      console.warn(`[HIRA] ${names[i]} 조회 실패:`, e);
    }
    onProgress?.(i + 1, names.length);
  }
  return results;
}

/**
 * ATC 코드 계층 조회 (level 1~5)
 * HIRA API에서 전체 ATC 목록 반환
 */
export async function fetchHiraAtcList(atcCode?: string): Promise<HiraAtcItem[]> {
  const key = apiKey();
  const params = new URLSearchParams({
    serviceKey: key,
    type:       'json',
    numOfRows:  '1000',
    pageNo:     '1',
  });
  if (atcCode) params.set('atcCode', atcCode);

  const url = `${BASE}/getInfrMedBassInfoAtcList?${params}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`HIRA ATC API 오류: ${res.status}`);

  const json = await res.json();
  const body = json?.response?.body;
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
