import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveDrugCore, cmpStrength } from './resolve';

/**
 * 성분별 함량을 사전계산해 disease_drug_strengths 에 upsert.
 * cron 라우트와 로컬 최초적재 스크립트가 공유. (resolveDrugCore = 조회 화면과 동일 로직)
 */
export async function buildDiseaseStrengths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
): Promise<{ pairs: number; rows: number }> {
  // 1) 처리 대상 (질환군, 중분류) 쌍 — 중분류 없는 행은 트리에 안 나오므로 제외
  const { data: dd } = await db
    .from('disease_drugs')
    .select('disease_group, sub_category')
    .not('disease_group', 'is', null)
    .not('sub_category', 'is', null)
    .limit(20000);

  const pairKey = (g: string, s: string) => `${g}${s}`;
  const pairs = new Map<string, [string, string]>();
  for (const r of dd ?? []) {
    const g = String(r.disease_group ?? '').trim();
    const s = String(r.sub_category ?? '').trim();
    if (!g || !s) continue;
    pairs.set(pairKey(g, s), [g, s]);
  }

  let rowCount = 0;
  const now = new Date().toISOString();

  // 2) 쌍별로 resolveDrugCore → 성분별 distinct 함량(정렬) → upsert
  for (const [group, sub] of pairs.values()) {
    let drugs;
    try {
      ({ drugs } = await resolveDrugCore(db, group, sub));
    } catch (e) {
      console.error(`[build-strengths] ${group} > ${sub}:`, e instanceof Error ? e.message : e);
      continue;
    }
    const byIngr = new Map<string, Set<string>>();
    for (const d of drugs) {
      const ingr = String(d.ingredient_name ?? '').trim();
      const st   = String(d.strength ?? '').trim();
      if (!ingr || !st) continue;
      if (!byIngr.has(ingr)) byIngr.set(ingr, new Set());
      byIngr.get(ingr)!.add(st);
    }

    const upserts = [...byIngr.entries()].map(([ingredient_name, set]) => ({
      disease_group:   group,
      sub_category:    sub,
      ingredient_name,
      strengths:       [...set].sort(cmpStrength),
      updated_at:      now,
    }));
    if (!upserts.length) continue;

    const { error } = await db
      .from('disease_drug_strengths')
      .upsert(upserts, { onConflict: 'disease_group,sub_category,ingredient_name' });
    if (error) { console.error(`[build-strengths] upsert ${group} > ${sub}:`, error.message); continue; }
    rowCount += upserts.length;
  }

  return { pairs: pairs.size, rows: rowCount };
}
