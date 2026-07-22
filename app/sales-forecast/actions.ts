'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileCanUpload } from '@/lib/roles';
import { buildMarket } from '@/lib/sales-forecast/market';
import { proposeForecast as aiPropose, refineForecast as aiRefine } from '@/lib/sales-forecast/ai';
import type { ForecastPlan, MarketData, ForecastProposal, ForecastYear } from '@/lib/sales-forecast/types';

function svc() {
  return createSvc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** 승인 + 작성권한(영업관리/PM/총괄/관리자) 확인 */
async function assertCanEdit() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { data: profile } = await supabase
    .from('profiles').select('role, roles, status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') throw new Error('승인된 계정이 아닙니다');
  if (!profileCanUpload(profile)) throw new Error('SF 작성 권한이 없습니다');
  return user.id;
}

async function assertApproved() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다');
  const { data: profile } = await supabase.from('profiles').select('status').eq('id', user.id).single();
  if (!profile || profile.status !== 'approved') throw new Error('승인된 계정이 아닙니다');
}

/** AI 예측 제안 (저장하지 않음) */
export async function proposeForecast(
  ingredientKey: string, plan: ForecastPlan,
): Promise<{ ok: boolean; proposal?: ForecastProposal; market?: MarketData; error?: string }> {
  try {
    await assertApproved();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY 미설정' };
    const market = await buildMarket(svc(), ingredientKey);
    const proposal = await aiPropose(market, plan, key);
    if (!proposal) return { ok: false, market, error: 'AI 제안 생성 실패 — 시장 데이터를 확인하세요' };
    return { ok: true, proposal, market };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 기존 품목 트렌드 예측 AI 보정 */
export async function refineForecast(
  ingredientKey: string, productName: string, base: ForecastYear[],
): Promise<{ ok: boolean; years?: ForecastYear[]; rationale?: string; error?: string }> {
  try {
    await assertApproved();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, error: 'ANTHROPIC_API_KEY 미설정' };
    if (!base?.length) return { ok: false, error: '보정할 예측이 없습니다' };
    const market = await buildMarket(svc(), ingredientKey);
    const r = await aiRefine(market, productName, base, key);
    if (!r) return { ok: false, error: 'AI 보정 실패' };
    return { ok: true, years: r.years, rationale: r.rationale };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type SaveInput = {
  id?: string;
  ingredient_key: string;
  product_name: string;
  launch_type: string;
  insurance_code: string | null;
  launch_price: number | null;
  insurance_price: number | null;
  price_factor: number;
  cost_ratio: number | null;
  commission_rate: number | null;
  pack_units: { label: string; tabsPerBox: number }[];
  manufacturing_lot: number | null;
  dev_cost: number | null;
  years: { y: number; amount: number; growth: number | null }[];
  ai_rationale: string | null;
  market_snapshot: unknown;
  status: 'draft' | 'confirmed';
};

export async function saveForecast(input: SaveInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const uid = await assertCanEdit();
    if (!input.ingredient_key || !input.product_name) return { ok: false, error: '성분·품목명이 필요합니다' };
    const row = {
      ...(input.id ? { id: input.id } : {}),
      ingredient_key: input.ingredient_key,
      product_name: input.product_name,
      launch_type: input.launch_type,
      insurance_code: input.insurance_code,
      launch_price: input.launch_price,
      insurance_price: input.insurance_price,
      price_factor: input.price_factor,
      cost_ratio: input.cost_ratio,
      commission_rate: input.commission_rate,
      pack_units: input.pack_units,
      manufacturing_lot: input.manufacturing_lot,
      dev_cost: input.dev_cost,
      years: input.years,
      ai_rationale: input.ai_rationale,
      market_snapshot: input.market_snapshot,
      status: input.status,
      created_by: uid,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await svc().from('sales_forecasts')
      .upsert(row, { onConflict: 'id' }).select('id').single();
    if (error) return { ok: false, error: error.message };
    revalidatePath('/sales-forecast');
    return { ok: true, id: data?.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteForecast(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanEdit();
    const { error } = await svc().from('sales_forecasts').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/sales-forecast');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 저장된 SF의 insurance_code로 UBIST 실측(연·월) 집계 */
export async function getActuals(
  insuranceCode: string,
): Promise<{ ok: boolean; byYear?: Record<string, number>; byMonth?: Record<string, number>; error?: string }> {
  try {
    await assertApproved();
    const code = insuranceCode.trim();
    if (!code) return { ok: false, error: 'insurance_code 없음' };
    const byYear: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    // 시장분석과 동일 소스(ubist_market)로 실측 집계 — 2021~2026 연·월 완비
    for (let from = 0; ; from += 1000) {
      const { data, error } = await svc()
        .from('ubist_market')
        .select('period, prescription_amount')
        .eq('insurance_code', code)
        .range(from, from + 999);
      if (error) return { ok: false, error: error.message };
      if (!data?.length) break;
      for (const r of data) {
        const p = String(r.period ?? '');
        const amt = Number(r.prescription_amount ?? 0);
        if (!p) continue;
        byMonth[p] = (byMonth[p] ?? 0) + amt;
        const y = p.slice(0, 4);
        byYear[y] = (byYear[y] ?? 0) + amt;
      }
      if (data.length < 1000) break;
    }
    return { ok: true, byYear, byMonth };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
