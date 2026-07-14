// 제품 마스터 ↔ 공식 참조데이터 자동 매칭/보강 (미확인·미입력만 채움; 파일·수동값 보존)
//   생동:     item_seq(정확) 또는 품목명 ↔ drug_bioequiv
//   DMF:      성분(원료)     ↔ drug_dmf
//   대조약:   item_seq(정확) 또는 품목명 ↔ drug_reference
//   허가:     item_seq 또는 insurance_code(=EDI_CODE) ↔ drug_permit
//             → 허가일자/허가번호/품목기준코드 + 상세(제조원·포장·위탁) 보강

import { fetchPermitDetail } from '@/lib/mfds/reference-api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

const norm = (s: string) => String(s || '').replace(/[\s.\-/,·()]/g, '').toLowerCase();

function baseIngredients(s: string): string[] {
  return String(s || '')
    .split(/[,،]/)
    .map((x) => x.replace(/\d.*$/, '').replace(/\(.*$/, '')
      .replace(/(염산염|황산염|칼슘|나트륨|수화물|말레산염|숙신산염|푸마르산염|염)$/, '').trim())
    .map(norm)
    .filter((x) => x.length >= 2);
}

async function pageRows(svc: Svc, table: string, cols: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let from = 0; const P = 1000;
  while (true) {
    const { data } = await svc.from(table).select(cols).range(from, from + P - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < P) break; from += P;
  }
  return out;
}

type Product = {
  id: string; product_name: string; ingredient_name: string; insurance_code: string;
  item_seq: string | null;
  is_bioequiv: boolean | null; has_dmf: boolean | null; is_reference_drug: boolean | null;
  permit_no: string | null; permit_date: string | null; std_code: string | null;
  maker: string | null; package_unit: string | null; is_consignment: boolean | null;
};

export type MatchResult = { bio: number; dmf: number; ref: number; permit: number; detail: number };

/**
 * 마스터 제품 보강. maxDetail: 허가 상세 API 호출 상한(제조원/포장/위탁).
 */
export async function matchProductsReference(
  svc: Svc, companyId: string | null, maxDetail = 400,
): Promise<MatchResult> {
  let pq = svc.from('products').select(
    'id, product_name, ingredient_name, insurance_code, item_seq, is_bioequiv, has_dmf, is_reference_drug, permit_no, permit_date, std_code, maker, package_unit, is_consignment',
  );
  pq = companyId ? pq.eq('company_id', companyId) : pq.is('company_id', null);
  const { data: prods } = await pq;
  if (!prods?.length) return { bio: 0, dmf: 0, ref: 0, permit: 0, detail: 0 };
  const products = prods as Product[];

  // 참조 세트 로드
  const bioRows = await pageRows(svc, 'drug_bioequiv', 'item_seq, item_name');
  const refRows = await pageRows(svc, 'drug_reference', 'item_seq, item_name');
  const dmfRows = await pageRows(svc, 'drug_dmf', 'ingredient_name');
  const bioSeq = new Set(bioRows.map((r) => r.item_seq).filter(Boolean).map(String));
  const refSeq = new Set(refRows.map((r) => r.item_seq).filter(Boolean).map(String));
  const bioNames = new Set(bioRows.map((r) => norm(String(r.item_name || ''))).filter(Boolean));
  const refNames = new Set(refRows.map((r) => norm(String(r.item_name || ''))).filter(Boolean));
  // DMF 성분: 염/용량 제거한 기본성분명으로 정규화(양쪽 동일 기준) → 정확일치
  const dmfIngr = new Set<string>();
  for (const r of dmfRows) for (const b of baseIngredients(String(r.ingredient_name || ''))) dmfIngr.add(b);

  // 허가 매칭: item_seq 또는 insurance_code(EDI) 로 drug_permit 조회
  const seqs = [...new Set(products.map((p) => p.item_seq).filter(Boolean).map(String))];
  const permitBySeq = new Map<string, Record<string, unknown>>();
  const permitByEdi = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < seqs.length; i += 200) {
    const { data } = await svc.from('drug_permit')
      .select('item_seq, permit_no, permit_date, std_code, edi_code, maker, package_unit, is_consignment')
      .in('item_seq', seqs.slice(i, i + 200));
    for (const r of (data ?? [])) permitBySeq.set(String(r.item_seq), r);
  }
  // item_seq 없는 제품 → insurance_code 로 edi_code(콤마복수) 부분매칭
  const noSeq = products.filter((p) => !p.item_seq && p.insurance_code);
  for (const p of noSeq) {
    if (permitByEdi.has(p.insurance_code)) continue;
    const { data } = await svc.from('drug_permit')
      .select('item_seq, permit_no, permit_date, std_code, edi_code, maker, package_unit, is_consignment')
      .ilike('edi_code', `%${p.insurance_code}%`).limit(1);
    if (data?.[0]) permitByEdi.set(p.insurance_code, data[0]);
  }

  const res: MatchResult = { bio: 0, dmf: 0, ref: 0, permit: 0, detail: 0 };
  let detailBudget = maxDetail;

  for (const p of products) {
    const patch: Record<string, unknown> = {};
    const pn = norm(p.product_name);
    const seq = p.item_seq ? String(p.item_seq) : '';

    // 생동 — item_seq(권위) 우선, 없으면 품목명 정확일치
    if (p.is_bioequiv == null) {
      const hit = (seq && bioSeq.has(seq)) || (!!pn && bioNames.has(pn));
      if (hit) { patch.is_bioequiv = true; res.bio++; }
    }
    // DMF — 기본성분명 정확일치
    if (p.has_dmf == null) {
      const ings = baseIngredients(p.ingredient_name);
      if (ings.some((g) => dmfIngr.has(g))) { patch.has_dmf = true; res.dmf++; }
    }
    // 대조약 — item_seq(권위) 우선, 없으면 품목명 정확일치
    if (p.is_reference_drug == null) {
      const hit = (seq && refSeq.has(seq)) || (!!pn && refNames.has(pn));
      if (hit) { patch.is_reference_drug = true; res.ref++; }
    }

    // 허가 (목록 필드)
    const permit = (seq && permitBySeq.get(seq)) || permitByEdi.get(p.insurance_code);
    if (permit) {
      if (!p.permit_no && permit.permit_no) patch.permit_no = permit.permit_no;
      if (!p.permit_date && permit.permit_date) patch.permit_date = permit.permit_date;
      if (!p.std_code && permit.std_code) patch.std_code = permit.std_code;
      if (permit.permit_no || permit.permit_date) res.permit++;

      // 상세(제조원/포장/위탁) — permit 캐시에 없고 예산 내면 API 조회
      const detailSeq = String(permit.item_seq || seq);
      const needDetail = (!p.maker || p.is_consignment == null || !p.package_unit);
      if (needDetail && detailSeq && detailBudget > 0) {
        let d: Awaited<ReturnType<typeof fetchPermitDetail>> = null;
        if (permit.maker != null || permit.package_unit != null || permit.is_consignment != null) {
          d = { maker: permit.maker as string, package_unit: permit.package_unit as string, is_consignment: permit.is_consignment as boolean, etc_otc: null, storage_method: null, valid_term: null, atc_code: null, cancel_name: null };
        } else {
          d = await fetchPermitDetail(detailSeq);
          detailBudget--;
          if (d) {
            await svc.from('drug_permit').update({
              maker: d.maker, package_unit: d.package_unit, is_consignment: d.is_consignment,
              etc_otc: d.etc_otc, storage_method: d.storage_method, valid_term: d.valid_term,
              atc_code: d.atc_code, cancel_name: d.cancel_name, detail_fetched_at: new Date().toISOString(),
            }).eq('item_seq', detailSeq);
          }
        }
        if (d) {
          if (!p.maker && d.maker) patch.maker = d.maker;
          if (!p.package_unit && d.package_unit) patch.package_unit = d.package_unit;
          if (p.is_consignment == null && d.is_consignment != null) patch.is_consignment = d.is_consignment;
          if (patch.maker || patch.package_unit || patch.is_consignment != null) res.detail++;
        }
      }
    }

    if (Object.keys(patch).length) await svc.from('products').update(patch).eq('id', p.id);
  }
  return res;
}
