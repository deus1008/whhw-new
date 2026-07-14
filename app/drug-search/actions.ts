'use server';

import { createClient as createSvc } from '@supabase/supabase-js';

export type DrugRow = {
  itemCode:       string;
  productName:    string;
  ingredientName: string;
  form:           string;   // 제형 (정제/캡슐제 등)
  manufacturer:   string;   // 판매회사
  payType:        string;   // 전문/일반
  maxPrice:       number | null;
  isBioequiv:     boolean;  // 생동 여부
  isCombo:        boolean;  // 복합제 여부
};

function svc() {
  return createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
const norm = (s: string) => String(s || '').replace(/[\s.\-/,·()]/g, '').toLowerCase();

// unit → 제형 라벨
function formLabel(unit: string): string {
  const u = String(unit || '').trim();
  if (!u) return '기타';
  if (u === '정') return '정제';
  if (u === '캡슐') return '캡슐제';
  if (/(mL|ml|밀리리터)/.test(u)) return '액제';
  if (u.endsWith('제')) return u;
  return u;
}

/** 약가표(drug_prices) 성분/제품명 검색 + 생동(drug_bioequiv) 조인 */
export async function searchDrugPrices(query: string): Promise<{ rows: DrugRow[]; total: number }> {
  const q = query.trim();
  if (!q) return { rows: [], total: 0 };
  const like = `%${q}%`;
  const s = svc();

  // 성분명·제품명 각각 조회 후 병합(or 필터 인젝션 회피)
  const [byIngr, byName] = await Promise.all([
    s.from('drug_prices').select('item_code,item_name,ingredient_name,unit,manufacturer,pay_type,max_price').ilike('ingredient_name', like).limit(1500),
    s.from('drug_prices').select('item_code,item_name,ingredient_name,unit,manufacturer,pay_type,max_price').ilike('item_name', like).limit(1500),
  ]);
  const seen = new Set<string>();
  const raw: Record<string, unknown>[] = [];
  for (const r of [...(byIngr.data ?? []), ...(byName.data ?? [])]) {
    const key = `${r.item_code}|${r.item_name}`;
    if (seen.has(key)) continue; seen.add(key); raw.push(r);
  }
  if (raw.length === 0) return { rows: [], total: 0 };

  // 생동 매칭:
  //  1순위 — products 마스터(보험코드=item_code) is_bioequiv (자사 권위값)
  //  2순위 — drug_bioequiv 품목명 정규화 매칭
  const codes = [...new Set(raw.map(r => String(r.item_code ?? '')).filter(Boolean))];
  const prodBio: Record<string, boolean> = {};
  for (let i = 0; i < codes.length; i += 200) {
    const { data } = await s.from('products').select('insurance_code, is_bioequiv').in('insurance_code', codes.slice(i, i + 200)).not('is_bioequiv', 'is', null);
    for (const r of data ?? []) if (r.insurance_code) prodBio[String(r.insurance_code)] = r.is_bioequiv === true;
  }
  const [bi, bn] = await Promise.all([
    s.from('drug_bioequiv').select('item_name').ilike('ingredient_name', like).limit(2000),
    s.from('drug_bioequiv').select('item_name').ilike('item_name', like).limit(2000),
  ]);
  const bioSet = new Set<string>();
  for (const r of [...(bi.data ?? []), ...(bn.data ?? [])]) if (r.item_name) bioSet.add(norm(String(r.item_name)));

  const rows: DrugRow[] = raw.map(r => {
    const productName = String(r.item_name ?? '');
    const ingredientName = String(r.ingredient_name ?? '');
    const code = String(r.item_code ?? '');
    const pn = norm(productName);
    const isBio = code in prodBio
      ? prodBio[code]                                                       // 자사 권위값
      : (!!pn && (bioSet.has(pn) || [...bioSet].some(b => b.includes(pn) || pn.includes(b))));
    return {
      itemCode:       code,
      productName,
      ingredientName,
      form:           formLabel(String(r.unit ?? '')),
      manufacturer:   String(r.manufacturer ?? ''),
      payType:        String(r.pay_type ?? ''),
      maxPrice:       r.max_price != null ? Number(r.max_price) : null,
      isBioequiv:     isBio,
      isCombo:        ingredientName.includes('/'),
    };
  });
  rows.sort((a, b) => a.productName.localeCompare(b.productName, 'ko'));
  return { rows, total: rows.length };
}
