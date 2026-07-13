// 제품 마스터(products) 식약처(MFDS) 보강 — 품목일련번호(item_seq)·표준 ATC
// DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06 (item_name 검색) — DRUG_API_KEY로 동작.

const MFDS_URL = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnDtlInq06';

const norm = (s: string) => String(s || '').replace(/[\s.\-/,·()]/g, '').toLowerCase();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function mfdsKey(): string | null {
  return process.env.MFDS_API_KEY ?? process.env.DRUG_API_KEY ?? null;
}

/** 품목명으로 MFDS 조회 → { item_seq, atc_code }. 미매칭 시 null. */
export async function lookupMfds(productName: string): Promise<{ item_seq: string | null; atc_code: string | null } | null> {
  const key = mfdsKey();
  if (!key || !productName) return null;
  // 원본 → 용량 제거 → 괄호 제거 순으로 시도
  const tries = [productName, productName.replace(/\d.*$/, '').trim(), productName.replace(/\(.*$/, '').trim()]
    .filter((v, i, a) => v && a.indexOf(v) === i);
  for (const q of tries) {
    const params = new URLSearchParams({ serviceKey: key, type: 'json', numOfRows: '10', pageNo: '1', item_name: q });
    try {
      const res = await fetch(`${MFDS_URL}?${params}`);
      const text = await res.text();
      if (!text.startsWith('{')) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j: any = JSON.parse(text);
      let items = j?.body?.items ?? [];
      items = Array.isArray(items) ? items : (items ? [items] : []);
      if (!items.length) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ex = items.find((x: any) => norm(x.ITEM_NAME) === norm(productName))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?? items.find((x: any) => norm(x.ITEM_NAME).startsWith(norm(productName)) || norm(productName).startsWith(norm(x.ITEM_NAME)))
        ?? items[0];
      return { item_seq: String(ex.ITEM_SEQ || '') || null, atc_code: String(ex.ATC_CODE || '') || null };
    } catch { /* 다음 시도 */ }
  }
  return null;
}

/**
 * item_seq가 비어 있는 제품을 MFDS로 보강. best-effort(개별 실패 무시).
 * p_limit로 1회 처리량 제한(업로드 타임아웃 회피). 처리 건수 반환.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrichProductsFromMfds(svc: any, companyId: string | null, limit = 400): Promise<number> {
  if (!mfdsKey()) return 0;
  let q = svc.from('products').select('id, product_name').is('item_seq', null).limit(limit);
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
  const { data: prods } = await q;
  if (!prods?.length) return 0;
  let hit = 0;
  for (const p of prods as { id: string; product_name: string }[]) {
    const r = await lookupMfds(p.product_name);
    if (r && (r.item_seq || r.atc_code)) {
      await svc.from('products').update({ item_seq: r.item_seq, atc_code: r.atc_code }).eq('id', p.id);
      hit++;
    }
    await sleep(80);
  }
  return hit;
}
