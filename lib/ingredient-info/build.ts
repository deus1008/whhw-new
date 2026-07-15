/**
 * 성분 설명 생성 — 식약처 허가 효능효과를 근거로 Claude 가 2~3문장 요약.
 *
 * 근거 확보 경로(둘 다 정확 매칭만 사용. 부분일치는 쓰지 않는다):
 *   ① 주성분:  disease_drugs.ingredient_name  ⊂ drug_permit.main_ingr_kor
 *              (아토르바스타틴 → 아토르바스타틴칼슘삼수화물)
 *   ② 제품명:  disease_drugs.product_name     ⊂ drug_permit.item_name
 *   ③ 복합제:  'A+B' 는 성분별로 분해해 각각 ①②를 시도
 *
 * 부분일치를 금지하는 이유: '니트라제팜' 이 '플루니트라제팜'(다른 약)에 붙어
 * 엉뚱한 효능효과를 근거로 삼게 된다.
 * 근거를 못 찾은 성분은 grounded=false 로 저장하고 검수 대상으로 남긴다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Permit = { item_name: string | null; main_ingr_kor: string | null; efficacy: string | null };

export const norm = (s: string | null | undefined) =>
  String(s ?? '').replace(/[\s.\-/,·()]/g, '').toLowerCase();

/** '갈카네주맙 (CGRP 리간드 표적)' → '갈카네주맙' — 뒤 괄호는 사람이 붙인 부연설명 */
export const cleanIngredient = (s: string | null | undefined) =>
  String(s ?? '').replace(/\(.*$/, '').trim();

/** '파스틱정30밀리그램(나테글리니드)' → '파스틱정' */
export const baseProductName = (s: string | null | undefined) =>
  String(s ?? '').replace(/_\(.*$/, '').replace(/\([^()]*\)/g, '')
    .replace(/[\d.%㎎㎍a-zA-Z]+.*$/, '').trim();

/** 복합제 분해: '레보도파+카르비도파' → ['레보도파','카르비도파'] */
export const splitCombo = (s: string): string[] =>
  cleanIngredient(s).split(/[+/]/).map((x) => x.trim()).filter(Boolean);

export type PermitIndex = {
  byIngr: Map<string, string[]>;   // 정규화 주성분 → efficacy[]
  byProd: Map<string, string>;     // 정규화 제품기본명 → efficacy
  ingrKeys: string[];
};

export function buildIndex(permits: Permit[]): PermitIndex {
  const byIngr = new Map<string, string[]>();
  const byProd = new Map<string, string>();
  for (const p of permits) {
    if (!p.efficacy) continue;
    if (p.main_ingr_kor) {
      const k = norm(p.main_ingr_kor);
      if (k) (byIngr.get(k) ?? byIngr.set(k, []).get(k)!).push(p.efficacy);
    }
    const pk = norm(baseProductName(p.item_name));
    if (pk && !byProd.has(pk)) byProd.set(pk, p.efficacy);
  }
  return { byIngr, byProd, ingrKeys: [...byIngr.keys()] };
}

/** 성분 1건의 근거 효능효과 수집 — 정확/접두 매칭만 */
export function gatherEfficacy(
  ingredient: string, productNames: string[], idx: PermitIndex,
): string[] {
  const out: string[] = [];
  const push = (v?: string | null) => { if (v && !out.includes(v)) out.push(v); };

  for (const part of splitCombo(ingredient)) {
    const base = norm(part);
    if (!base || base.length < 2) continue;
    for (const k of idx.ingrKeys) {
      // 접두 매칭만: 성분 ⊂ 허가주성분(염 형태 포함) 또는 그 역
      if (k.startsWith(base) || base.startsWith(k)) {
        for (const e of idx.byIngr.get(k)!) push(e);
      }
    }
  }
  for (const p of productNames) push(idx.byProd.get(norm(baseProductName(p))));
  return out;
}

const SYS =
  '당신은 국내 제약 영업사원 교육자료를 쓰는 약사입니다. ' +
  '성분에 대해 한국어 2~3문장으로 설명하세요. ' +
  '① 약효 계열, ② 작용기전, ③ 주요 적응증 순으로 담되 문장으로 자연스럽게 쓰고 번호는 붙이지 마세요. ' +
  '제품명·회사명·약가·급여는 쓰지 마세요. 확실하지 않으면 단정하지 마세요.';

export type Generated = { description: string; drug_class: string | null };

export async function generate(
  ingredient: string, efficacy: string[], apiKey: string,
): Promise<Generated | null> {
  const grounded = efficacy.length > 0;
  const evidence = efficacy.slice(0, 3).map((e, i) => `[허가 효능효과 ${i + 1}] ${e.slice(0, 700)}`).join('\n');
  const user = grounded
    ? `성분: ${ingredient}\n\n다음은 식약처 허가사항 원문입니다. 이를 근거로 설명하세요.\n${evidence}\n\n` +
      `JSON 으로만 답하세요: {"description":"...","drug_class":"약효 계열 한 단어"}`
    : `성분: ${ingredient}\n\n허가사항 원문이 없습니다. 일반적으로 확립된 약리학 지식 범위에서만 설명하고, ` +
      `성분명이 불명확하거나 의약품 성분이 아니면 description 을 빈 문자열로 두세요.\n` +
      `JSON 으로만 답하세요: {"description":"...","drug_class":"약효 계열 한 단어"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 700, system: SYS,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const text = j?.content?.[0]?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const d = String(o.description ?? '').trim();
    return d ? { description: d, drug_class: String(o.drug_class ?? '').trim() || null } : null;
  } catch { return null; }
}

/** 질환학습 성분 목록 + 성분별 큐레이션 제품명 */
export async function loadIngredients(svc: SupabaseClient): Promise<Map<string, string[]>> {
  const byIng = new Map<string, string[]>();
  const { data } = await svc.from('disease_drugs').select('ingredient_name, product_name').limit(20000);
  for (const r of data ?? []) {
    const i = String(r.ingredient_name ?? '').trim();
    if (!i) continue;
    const list = byIng.get(i) ?? byIng.set(i, []).get(i)!;
    const p = String(r.product_name ?? '').trim();
    if (p && !list.includes(p)) list.push(p);
  }
  return byIng;
}

export async function loadPermits(svc: SupabaseClient): Promise<Permit[]> {
  const out: Permit[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data } = await svc.from('drug_permit')
      .select('item_name, main_ingr_kor, efficacy').not('efficacy', 'is', null)
      .range(from, from + 999);
    if (!data?.length) break;
    out.push(...(data as Permit[]));
  }
  return out;
}
