// 제품 마스터 ↔ 생동(drug_bioequiv)·DMF(drug_dmf) 자동 매칭
//   생동: 품목명 ↔ drug_bioequiv.item_name
//   DMF : 성분(원료) ↔ drug_dmf.ingredient_name
// 매칭되면 is_bioequiv/has_dmf 를 true 로 설정(미매칭은 미확인=null 유지, 수동 편집으로 보완).

const norm = (s: string) => String(s || '').replace(/[\s.\-/,·()]/g, '').toLowerCase();

// 성분 문자열 → 기본 성분명 배열 (용량·염 제거)
function baseIngredients(s: string): string[] {
  return String(s || '')
    .split(/[,،]/)
    .map(x => x.replace(/\d.*$/, '').replace(/\(.*$/, '')
      .replace(/(염산염|황산염|칼슘|나트륨|수화물|말레산염|숙신산염|푸마르산염|염)$/,'').trim())
    .map(norm)
    .filter(x => x.length >= 2);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageAll(svc: any, table: string, col: string): Promise<string[]> {
  const out: string[] = [];
  let from = 0; const P = 1000;
  while (true) {
    const { data } = await svc.from(table).select(col).range(from, from + P - 1);
    if (!data?.length) break;
    for (const r of data) { const v = (r as Record<string, unknown>)[col]; if (v) out.push(String(v)); }
    if (data.length < P) break; from += P;
  }
  return out;
}

/**
 * 위탁사 제품의 is_bioequiv/has_dmf 자동 설정(true만). 처리 건수 반환.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function matchBioequivDmf(svc: any, companyId: string | null): Promise<{ bio: number; dmf: number }> {
  let pq = svc.from('products').select('id, product_name, ingredient_name, is_bioequiv, has_dmf');
  pq = companyId ? pq.eq('company_id', companyId) : pq.is('company_id', null);
  const { data: prods } = await pq;
  if (!prods?.length) return { bio: 0, dmf: 0 };

  const bioNames = new Set((await pageAll(svc, 'drug_bioequiv', 'item_name')).map(norm));
  const dmfIngr  = new Set((await pageAll(svc, 'drug_dmf', 'ingredient_name')).map(norm));

  let bio = 0, dmf = 0;
  for (const p of prods as { id: string; product_name: string; ingredient_name: string; is_bioequiv: boolean | null; has_dmf: boolean | null }[]) {
    const pn = norm(p.product_name);
    const isBio = !!pn && (bioNames.has(pn) || [...bioNames].some(b => b.includes(pn) || pn.includes(b)));
    const ings = baseIngredients(p.ingredient_name);
    const hasDmf = ings.some(g => dmfIngr.has(g) || [...dmfIngr].some(d => d.includes(g) || g.includes(d)));

    const patch: Record<string, boolean> = {};
    if (isBio && p.is_bioequiv !== true) patch.is_bioequiv = true;
    if (hasDmf && p.has_dmf !== true) patch.has_dmf = true;
    if (Object.keys(patch).length) {
      await svc.from('products').update(patch).eq('id', p.id);
      if (patch.is_bioequiv) bio++;
      if (patch.has_dmf) dmf++;
    }
  }
  return { bio, dmf };
}
