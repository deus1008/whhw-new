// HIRA 약가 → drug_prices 갱신.
//   API가 활성 약가(상한가) 전량을 제공하되 성분명이 없으므로,
//   기존 행의 성분명·품목명·규격·단위를 item_code 기준으로 이월(보존)하고,
//   API 활성집합에 없는 기존 행(비급여·파일전용)은 그대로 유지한 뒤 전면 재적재.
//   → 상한가는 항상 최신, 성분 그룹핑(=/drug-search)은 유지, 중복 없음.

import { fetchAllHiraPrices, extractIngredient } from './hira-price-api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any;

type ExistingRow = {
  item_code: string | null; item_name: string | null; ingredient_name: string | null;
  unit: string | null; standard: string | null; pay_type: string | null; source_file: string | null;
};

async function loadExisting(svc: Svc): Promise<ExistingRow[]> {
  const out: ExistingRow[] = [];
  let from = 0; const P = 1000;
  while (true) {
    const { data } = await svc.from('drug_prices')
      .select('item_code, item_name, ingredient_name, unit, standard, pay_type, source_file')
      .range(from, from + P - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < P) break; from += P;
  }
  return out;
}

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o;
}

export async function syncHiraPrices(svc: Svc): Promise<{ table: string; count: number; updated: number; kept: number }> {
  const api = await fetchAllHiraPrices();
  if (api.length === 0) throw new Error('HIRA 약가 응답 0건 — 갱신 중단(기존 데이터 보존)');

  const existing = await loadExisting(svc);
  const exByCode = new Map<string, ExistingRow>();
  for (const r of existing) if (r.item_code) exByCode.set(r.item_code, r);
  const apiCodes = new Set(api.map((a) => a.item_code));

  // 1) API 활성행: 성분명·품목명·규격·단위는 기존값 보존, 상한가/급여/제조사/적용일은 최신
  const apiRows = api.map((a) => {
    const ex = exByCode.get(a.item_code);
    return {
      item_code:       a.item_code,
      item_name:       ex?.item_name || a.item_name,
      ingredient_name: ex?.ingredient_name || a.ingredient_name || null,
      max_price:       a.max_price,
      pay_type:        a.pay_type || null,   // 전문/일반 = API spcGnlTpNm (정본)
      unit:            ex?.unit || a.unit || null,
      standard:        ex?.standard || a.standard || null,
      effective_date:  a.effective_date || null,
      manufacturer:    a.manufacturer || null,
      source_file:     'API:hira',
    };
  });

  // 2) API 활성집합에 없는 기존행(비급여·삭제·파일전용) 유지
  const kept = existing
    .filter((r) => r.item_code && !apiCodes.has(r.item_code))
    .map((r) => r as unknown as Record<string, unknown>);

  const updated = apiRows.filter((r) => exByCode.has(r.item_code)).length;
  const rows = [...apiRows, ...kept];

  // 전면 재적재
  await svc.from('drug_prices').delete().not('id', 'is', null);
  for (const c of chunk(rows, 1000)) {
    const { error } = await svc.from('drug_prices').insert(c);
    if (error) throw new Error(`drug_prices insert: ${error.message}`);
  }
  return { table: 'drug_prices', count: rows.length, updated, kept: kept.length };
}

export { extractIngredient };
