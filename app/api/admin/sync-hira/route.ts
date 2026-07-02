/**
 * POST /api/admin/sync-hira
 * HIRA API → disease_drugs 동기화 (약가·급여여부·ATC코드)
 *
 * 전략:
 *   1) dgamtCrtrInfoService1.2 (XML, DRUG_API_KEY로 이미 동작)
 *      → max_price, pay_type 업데이트
 *   2) msInfrMedBassInfoService (JSON, 별도 승인 필요)
 *      → atc_code, atc_name 업데이트 (서비스 미승인 시 자동 스킵)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import {
  searchHiraDrugPrice,
  searchHiraDrugs,
  fetchHiraAtcList,
  type HiraPriceItem,
  type HiraDrugItem,
} from '@/lib/hira/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('role, status').eq('id', user.id).single();
    if (!profile || !profileIsAdmin(profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!process.env.HIRA_API_KEY && !process.env.DRUG_API_KEY) {
      return NextResponse.json({
        error: 'DRUG_API_KEY 환경변수가 설정되지 않았습니다.',
        guide: 'Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에 DRUG_API_KEY를 확인하세요.',
      }, { status: 503 });
    }

    const db = createSvc(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    /* ── 1. disease_drugs 목록 ──────────────────────────────────── */
    const { data: drugs, error: dbErr } = await db
      .from('disease_drugs')
      .select('id, product_name, ingredient_name')
      .not('product_name', 'is', null);

    if (dbErr) {
      return NextResponse.json({
        error: `disease_drugs 조회 실패: ${dbErr.message}`,
        hint: 'Supabase SQL Editor에서 마이그레이션 파일을 먼저 실행하세요.',
      }, { status: 500 });
    }

    if (!drugs?.length) {
      return NextResponse.json({
        error: 'disease_drugs가 비어 있습니다.',
        hint: 'Step 1 (질환DB 임포트)을 먼저 실행하세요.',
      }, { status: 400 });
    }

    /* ── 2-A. 약가 API (dgamtCrtrInfoService1.2, XML) ──────────── */
    const priceMap = new Map<string, HiraPriceItem>();
    let priceErrors = 0;

    const uniqueNames = [...new Set(
      drugs.map(d => (d.product_name as string).trim()).filter(Boolean)
    )];

    for (const name of uniqueNames) {
      try {
        const items = await searchHiraDrugPrice(name);
        for (const item of items) {
          const key = item.itmNm.trim();
          if (key && !priceMap.has(key)) priceMap.set(key, item);
        }
      } catch {
        priceErrors++;
      }
    }

    /* ── 2-B. 보험의약품정보 API (msInfrMedBassInfoService, JSON) ─ */
    const hiraMap = new Map<string, HiraDrugItem>();
    let hiraErrors = 0;
    let atcEnabled = false;

    const uniqueIngrs = [...new Set(
      drugs.map(d => (d.ingredient_name as string | null)?.trim()).filter(Boolean) as string[]
    )];

    for (const ingr of uniqueIngrs) {
      try {
        const { items, totalCount } = await searchHiraDrugs({ ingrName: ingr, numOfRows: 100 });
        if (items.length > 0) atcEnabled = true;
        for (const item of items) {
          if (item.itemName && !hiraMap.has(item.itemName.trim())) {
            hiraMap.set(item.itemName.trim(), item);
          }
        }
        // 페이지네이션 (최대 2페이지 추가)
        if (totalCount > 100) {
          for (let p = 2; p <= Math.min(3, Math.ceil(totalCount / 100)); p++) {
            try {
              const { items: more } = await searchHiraDrugs({ ingrName: ingr, numOfRows: 100, pageNo: p });
              for (const item of more) {
                if (item.itemName && !hiraMap.has(item.itemName.trim())) {
                  hiraMap.set(item.itemName.trim(), item);
                }
              }
            } catch { /* skip */ }
          }
        }
      } catch {
        hiraErrors++;
      }
    }

    /* ── 3. disease_drugs 업데이트 ──────────────────────────────── */
    let updated = 0;

    for (const drug of drugs as { id: number; product_name: string }[]) {
      const name = drug.product_name.trim();
      const price = priceMap.get(name);
      const hira  = hiraMap.get(name);

      if (!price && !hira) continue;

      const patch: Record<string, unknown> = {};
      if (price?.maxPrice != null) patch.max_price = price.maxPrice;
      if (price?.payType)          patch.pay_type  = price.payType;
      if (hira?.atcCode)           patch.atc_code  = hira.atcCode;
      if (hira?.atcName)           patch.atc_name  = hira.atcName;
      if (hira?.itemSeq)           patch.item_code = hira.itemSeq;

      if (!Object.keys(patch).length) continue;

      const { error } = await db
        .from('disease_drugs')
        .update(patch)
        .eq('id', drug.id);

      if (!error) updated++;
    }

    /* ── 4. ATC 계층 동기화 (서비스 승인된 경우만) ──────────────── */
    let atcInserted = 0;
    if (atcEnabled) {
      try {
        const atcItems = await fetchHiraAtcList();
        if (atcItems.length > 0) {
          await db.from('atc_codes').delete().neq('code', '');
          const CHUNK = 200;
          for (let i = 0; i < atcItems.length; i += CHUNK) {
            const { error } = await db.from('atc_codes').upsert(
              atcItems.slice(i, i + CHUNK).map(a => ({
                code: a.code, level: a.level, name_ko: a.nameKo, parent_code: a.parent,
              })),
              { onConflict: 'code' },
            );
            if (!error) atcInserted += atcItems.slice(i, i + CHUNK).length;
          }
        }
      } catch (e) {
        console.warn('[HIRA sync] ATC 계층 동기화 실패:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      drugsScanned: drugs.length,
      priceMatched: priceMap.size,
      hiraMatched:  hiraMap.size,
      updated,
      atcInserted,
      atcEnabled,
      priceErrors,
      hiraErrors,
      note: !atcEnabled
        ? 'msInfrMedBassInfoService 미승인 → ATC코드 스킵. 약가/급여여부는 dgamtCrtrInfoService1.2로 업데이트했습니다.'
        : undefined,
    });

  } catch (e) {
    console.error('[sync-hira] 예외:', e);
    return NextResponse.json({
      error: e instanceof Error ? e.message : '동기화 중 오류가 발생했습니다.',
    }, { status: 500 });
  }
}
