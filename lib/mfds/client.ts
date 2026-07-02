/**
 * 식품의약품안전처(MFDS/식약처) API 클라이언트
 *
 * 공공데이터포털(data.go.kr) API 키 필요:
 *   서비스1: 식품의약품안전처_의약품 허가목록 (DrugPrdtPrmsnInfoService06)
 *   서비스2: 식품의약품안전처_생물학적동등성시험결과 (BioeqDrugService01)
 *   발급: https://www.data.go.kr → 서비스 신청 (1~2일 승인)
 *
 * 환경변수: MFDS_API_KEY
 *
 * 의약품 허가 반환 주요 필드:
 *   ITEM_SEQ       품목일련번호
 *   ITEM_NAME      품목명
 *   ENTP_NAME      업체명
 *   ITEM_INGR_NAME 성분명
 *   PERMIT_KIND_CD 허가종류코드 (1=신약, 2=개량신약, 3=허가이후서류제출, 4=생동성, 5=기타제네릭)
 *   APPROVAL_DATE  허가일자 YYYYMMDD
 *
 * 생동성시험 반환 주요 필드:
 *   BIZR_NM        시험의뢰업체명
 *   PRDUCT_NM      시험약품명 (제네릭)
 *   RFRN_DRUG_NM   대조약품명 (오리지널)
 *   INGR_NM        성분명
 */

const BASE_PERMIT = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService06';
const BASE_BIOEQ  = 'https://apis.data.go.kr/1471000/BioeqDrugService01';

export interface MfdsDrugPermit {
  itemSeq:       string;
  itemName:      string;
  entpName:      string;
  ingrName:      string;
  permitKindCd:  string;   // '1'=신약, '2'=개량신약, '3'=허가이후서류제출, '4'=생동성, '5'=기타
  approvalDate:  string;   // YYYY-MM-DD
}

export interface MfdsBioeqItem {
  entpName:     string;   // 시험의뢰업체
  productName:  string;   // 시험약품명 (제네릭)
  refDrugName:  string;   // 대조약품명 (오리지널)
  ingrName:     string;   // 성분명
  approvalDate: string;
}

function apiKey(): string {
  const k = process.env.MFDS_API_KEY;
  if (!k) throw new Error('MFDS_API_KEY 환경변수가 설정되지 않았습니다.');
  return k;
}

function fmtDate(d: string | undefined): string {
  if (!d || d.length < 8) return d ?? '';
  return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
}

const PERMIT_KIND: Record<string, string> = {
  '1': '신약',
  '2': '개량신약',
  '3': '허가이후서류제출',
  '4': '생동성',
  '5': '제네릭',
};

export function permitKindLabel(cd: string): string {
  return PERMIT_KIND[cd] ?? cd;
}

/**
 * 품목명으로 식약처 의약품 허가 정보 검색
 */
export async function searchMfdsDrugPermit(opts: {
  itemName?: string;
  itemSeq?: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<{ items: MfdsDrugPermit[]; totalCount: number }> {
  const key = apiKey();
  const params = new URLSearchParams({
    serviceKey: key,
    type:       'json',
    numOfRows:  String(opts.numOfRows ?? 100),
    pageNo:     String(opts.pageNo ?? 1),
  });
  if (opts.itemName) params.set('item_name', opts.itemName);
  if (opts.itemSeq)  params.set('item_seq',  opts.itemSeq);

  const url = `${BASE_PERMIT}/getDrugPrdtPrmsnDtlInq06?${params}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`MFDS 허가 API 오류: ${res.status}`);

  const json = await res.json();
  const body = json?.body;
  const rawItems = body?.items ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return {
    items: items.map((r: Record<string, string>) => ({
      itemSeq:      r.ITEM_SEQ      ?? '',
      itemName:     r.ITEM_NAME     ?? '',
      entpName:     r.ENTP_NAME     ?? '',
      ingrName:     r.ITEM_INGR_NAME ?? r.MAIN_INGR ?? '',
      permitKindCd: r.PERMIT_KIND_CD ?? '',
      approvalDate: fmtDate(r.APPROVAL_DATE ?? r.PERMIT_DATE),
    })),
    totalCount: Number(body?.totalCount ?? 0),
  };
}

/**
 * 성분명으로 생동성시험 결과 검색 → 대조약 정보 반환
 */
export async function searchBioeqByIngr(opts: {
  ingrName?: string;
  productName?: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<{ items: MfdsBioeqItem[]; totalCount: number }> {
  const key = apiKey();
  const params = new URLSearchParams({
    serviceKey: key,
    type:       'json',
    numOfRows:  String(opts.numOfRows ?? 100),
    pageNo:     String(opts.pageNo ?? 1),
  });
  if (opts.ingrName)    params.set('ingrName',   opts.ingrName);
  if (opts.productName) params.set('prductNm',   opts.productName);

  const url = `${BASE_BIOEQ}/getBioeqDrugList1?${params}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`MFDS 생동성 API 오류: ${res.status}`);

  const json = await res.json();
  const body = json?.body;
  const rawItems = body?.items ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return {
    items: items.map((r: Record<string, string>) => ({
      entpName:     r.BIZR_NM    ?? r.ENTP_NAME   ?? '',
      productName:  r.PRDUCT_NM  ?? r.ITEM_NAME    ?? '',
      refDrugName:  r.RFRN_DRUG_NM ?? r.REF_DRUG_NAME ?? '',
      ingrName:     r.INGR_NM    ?? '',
      approvalDate: fmtDate(r.APPROVAL_DATE ?? r.TEST_DATE),
    })),
    totalCount: Number(body?.totalCount ?? 0),
  };
}

/**
 * 품목명 목록으로 대조약 정보 일괄 조회
 * Returns map: productName → refDrugName
 */
export async function fetchReferenceDrugMap(
  productNames: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let i = 0; i < productNames.length; i++) {
    try {
      const { items } = await searchBioeqByIngr({ productName: productNames[i], numOfRows: 5 });
      for (const item of items) {
        if (item.productName && item.refDrugName) {
          result.set(item.productName.trim(), item.refDrugName.trim());
        }
      }
    } catch (e) {
      console.warn(`[MFDS] ${productNames[i]} 대조약 조회 실패:`, e);
    }
    onProgress?.(i + 1, productNames.length);
  }
  return result;
}

/**
 * 품목명 목록으로 허가종류 일괄 조회
 * Returns map: itemName → { permitKindCd, approvalDate }
 */
export async function fetchPermitInfoMap(
  itemNames: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, { permitKindCd: string; approvalDate: string }>> {
  const result = new Map<string, { permitKindCd: string; approvalDate: string }>();
  for (let i = 0; i < itemNames.length; i++) {
    try {
      const { items } = await searchMfdsDrugPermit({ itemName: itemNames[i], numOfRows: 5 });
      for (const item of items) {
        if (item.itemName && !result.has(item.itemName.trim())) {
          result.set(item.itemName.trim(), {
            permitKindCd: item.permitKindCd,
            approvalDate: item.approvalDate,
          });
        }
      }
    } catch (e) {
      console.warn(`[MFDS] ${itemNames[i]} 허가 조회 실패:`, e);
    }
    onProgress?.(i + 1, itemNames.length);
  }
  return result;
}
