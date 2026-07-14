// 식약처(data.go.kr) 공식 API 클라이언트 — 참조데이터 적재용
//   생동성인정품목 / DMF현황 / 대조약 / 제품허가(목록·상세)
// 응답은 XML. 각 <item> 안의 leaf 태그만 있는 평탄 구조라 정규식 파싱으로 충분.

const KEY = () => process.env.MFDS_API_KEY ?? process.env.DRUG_API_KEY ?? '';

export const REF_ENDPOINTS = {
  bioeq:     'https://apis.data.go.kr/1471000/MdcBioEqInfoService01/getMdcBioEqList01',
  dmf:       'https://apis.data.go.kr/1471000/MdcDmfInfoService01/getMdcDmfList01',
  reference: 'https://apis.data.go.kr/1471000/MdcCompDrugInfoService04/getMdcCompDrugList04',
  permit:    'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07',
} as const;

const PERMIT_DETAIL = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06';

export type RefDataset = keyof typeof REF_ENDPOINTS;

// <item>…</item> 블록마다 leaf 태그를 뽑아 객체 배열로. CDATA/빈값 방어.
export function parseItems(xml: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const obj: Record<string, string> = {};
    const tagRe = /<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(m[1]))) {
      const v = (t[2] ?? t[3] ?? '').trim();
      if (v) obj[t[1]] = v;
    }
    out.push(obj);
  }
  return out;
}

export function totalCount(xml: string): number {
  const m = xml.match(/<totalCount>(\d+)<\/totalCount>/);
  return m ? Number(m[1]) : 0;
}

// 전체 페이지 순회 수집. pageSize 700+ 은 일부 서비스가 빈 응답을 반환 → 500 고정.
export async function fetchAllItems(
  baseUrl: string,
  extra: Record<string, string> = {},
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<Record<string, string>[]> {
  const pageSize = opts.pageSize ?? 500;
  const maxPages = opts.maxPages ?? 300;
  const all: Record<string, string>[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      serviceKey: KEY(), type: 'xml', numOfRows: String(pageSize), pageNo: String(page), ...extra,
    });
    const res = await fetch(`${baseUrl}?${params}`);
    const xml = await res.text();
    const items = parseItems(xml);
    all.push(...items);
    const total = totalCount(xml);
    if (items.length === 0 || (total > 0 && all.length >= total)) break;
  }
  return all;
}

const SRC = (d: RefDataset) => `API:${d}`;
const norm = (s: string) => String(s || '').replace(/[\s.\-/,·()]/g, '').toLowerCase();

// ── dataset → DB row 매핑 ──────────────────────────────
export async function fetchBioeqRows() {
  const items = await fetchAllItems(REF_ENDPOINTS.bioeq);
  return items.map((r) => ({
    item_seq:        r.ITEM_SEQ ?? null,
    item_name:       r.ITEM_NAME ?? '',
    company_name:    r.ENTP_NAME ?? null,
    ingredient_name: r.INGR_KOR_NAME ?? null,
    ingredient_qty:  r.INGR_QTY ?? null,
    dosage_form:     r.SHAPE_CODE_NAME ?? null,
    notice_date:     r.BIOEQ_PRODT_NOTICE_DATE ?? null,
    source_file:     SRC('bioeq'),
  })).filter((r) => r.item_name);
}

export async function fetchDmfRows() {
  const items = await fetchAllItems(REF_ENDPOINTS.dmf);
  return items.map((r) => ({
    dmf_number:           r.DMF_PERMIT_NO ?? null,
    ingredient_name:      r.INGR_KOR_NAME ?? '',
    company_name:         r.ENTP_NAME ?? null,
    manufacturer_name:    r.MNFCTR_NAME ?? null,
    manufacturer_address: r.MNFCTR_PLACE ?? null,
    country:              r.MANUF_COUNTRY_CODE_NM ?? null,
    registration_date:    r.DMF_PERMIT_DATE ?? null,
    source_file:          SRC('dmf'),
  })).filter((r) => r.ingredient_name);
}

export async function fetchReferenceRows() {
  const items = await fetchAllItems(REF_ENDPOINTS.reference);
  return items.map((r) => ({
    item_seq:        r.ITEM_SEQ ?? null,
    item_name:       r.ITEM_NAME ?? '',
    company_name:    r.ENTP_NAME ?? null,
    ingredient_name: r.INGR_NAME ?? null,
    dosage_form:     r.SHAPE_CODE_NAME ?? null,
    notice_date:     r.BIOEQ_NOTICE_DATE ?? null,
    source_file:     SRC('reference'),
  })).filter((r) => r.item_name);
}

export async function fetchPermitRows() {
  const items = await fetchAllItems(REF_ENDPOINTS.permit);
  // ITEM_SEQ 중복 방지(최근값 우선) — PK 충돌 예방
  const bySeq = new Map<string, Record<string, unknown>>();
  for (const r of items) {
    const seq = r.ITEM_SEQ;
    if (!seq) continue;
    bySeq.set(seq, {
      item_seq:        seq,
      item_name:       r.ITEM_NAME ?? null,
      company_name:    r.ENTP_NAME ?? null,
      permit_date:     r.ITEM_PERMIT_DATE ?? null,
      permit_no:       r.PRDUCT_PRMISN_NO ?? null,
      std_code:        r.PRDLST_STDR_CODE ?? null,
      edi_code:        r.EDI_CODE ?? null,
      ingredient_name: r.ITEM_INGR_NAME ?? null,
      induty:          r.INDUTY ?? null,
      product_type:    r.PRDUCT_TYPE ?? null,
      permit_kind:     r.PERMIT_KIND_CODE ?? null,
      cancel_name:     r.CANCEL_NAME ?? null,
      source_file:     SRC('permit'),
    });
  }
  return [...bySeq.values()];
}

// 허가 상세 — 제조원/위탁/포장/저장/유효기간/ATC. item_seq 단건.
export async function fetchPermitDetail(itemSeq: string): Promise<{
  etc_otc: string | null; maker: string | null; is_consignment: boolean | null;
  package_unit: string | null; storage_method: string | null; valid_term: string | null;
  atc_code: string | null; cancel_name: string | null;
} | null> {
  const params = new URLSearchParams({
    serviceKey: KEY(), type: 'xml', numOfRows: '1', pageNo: '1', item_seq: itemSeq,
  });
  const res = await fetch(`${PERMIT_DETAIL}?${params}`);
  const items = parseItems(await res.text());
  const r = items[0];
  if (!r) return null;
  // 위탁제조사(복수 콤마) 중복 정리
  const cnsgn = [...new Set((r.CNSGN_MANUF ?? '').split(',').map((s) => s.trim()).filter(Boolean))].join(', ');
  const entp  = r.ENTP_NAME ?? '';
  // 위탁제조사가 있고 허가업체와 다르면 위탁생산, 없으면 자사생산(false)
  const isCons = cnsgn ? norm(cnsgn) !== norm(entp) : false;
  return {
    etc_otc:        r.ETC_OTC_CODE ?? null,
    maker:          cnsgn || entp || null,
    is_consignment: isCons,
    package_unit:   r.PACK_UNIT ?? null,
    storage_method: r.STORAGE_METHOD ?? null,
    valid_term:     r.VALID_TERM ?? null,
    atc_code:       r.ATC_CODE ?? null,
    cancel_name:    r.CANCEL_NAME ?? null,
  };
}
