/**
 * POST /api/admin/sync-hira
 * HIRA 보험의약품정보서비스 → disease_drugs.atc_code 동기화
 *
 * max_price / pay_type는 Step 1 엑셀 임포트에서 이미 적재되므로 여기서 다루지 않음.
 * 이 단계는 msInfrMedBassInfoService 승인 여부 확인 + ATC코드 업데이트가 목적.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { searchHiraDrugs, fetchHiraAtcList } from '@/lib/hira/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    /* ── 인증 ── */
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
      }, { status: 503 });
    }

    /* ── 1. msInfrMedBassInfoService 승인 여부 확인 (테스트 1건) ── */
    const testResult = await searchHiraDrugs({ ingrName: '메트포르민', numOfRows: 1 });
    const atcEnabled = testResult.items.length > 0;

    if (!atcEnabled) {
      return NextResponse.json({
        ok: true,
        atcEnabled: false,
        note: 'msInfrMedBassInfoService가 현재 API 키로 승인되지 않았습니다. '
          + 'ATC코드 동기화를 건너뜁니다. '
          + '약가·급여여부는 Step 1(엑셀 임포트)에서 이미 적재되어 있습니다.',
      });
    }

    /* ── 2. 성분별 ATC 코드 수집 ── */
    const db = createSvc(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: drugs, error: dbErr } = await db
      .from('disease_drugs')
      .select('id, product_name, ingredient_name')
      .not('product_name', 'is', null);

    if (dbErr) {
      return NextResponse.json({
        error: `disease_drugs 조회 실패: ${dbErr.message}`,
        hint: 'Supabase SQL Editor에서 마이그레이션을 먼저 실행하세요.',
      }, { status: 500 });
    }
    if (!drugs?.length) {
      return NextResponse.json({
        error: 'disease_drugs가 비어 있습니다. Step 1을 먼저 실행하세요.',
      }, { status: 400 });
    }

    const uniqueIngrs = [...new Set(
      drugs
        .map(d => (d.ingredient_name as string | null)?.trim())
        .filter(Boolean) as string[]
    )];

    type HiraItem = Awaited<ReturnType<typeof searchHiraDrugs>>['items'][number];
    const hiraMap = new Map<string, HiraItem>();
    let hiraErrors = 0;

    for (const ingr of uniqueIngrs) {
      try {
        const { items, totalCount } = await searchHiraDrugs({ ingrName: ingr, numOfRows: 100 });
        for (const item of items) {
          if (item.itemName && !hiraMap.has(item.itemName.trim())) {
            hiraMap.set(item.itemName.trim(), item);
          }
        }
        if (totalCount > 100) {
          const pages = Math.min(3, Math.ceil(totalCount / 100));
          for (let p = 2; p <= pages; p++) {
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

    /* ── 3. disease_drugs 업데이트 (ATC코드·상한가) ── */
    let updated = 0;
    for (const drug of drugs as { id: number; product_name: string }[]) {
      const hira = hiraMap.get(drug.product_name.trim());
      if (!hira) continue;

      const patch: Record<string, unknown> = {};
      if (hira.atcCode)  patch.atc_code  = hira.atcCode;
      if (hira.atcName)  patch.atc_name  = hira.atcName;
      if (hira.itemSeq)  patch.item_code = hira.itemSeq;
      if (hira.maxPrice != null) patch.max_price = hira.maxPrice;
      if (hira.mediPayYn === 'Y') patch.pay_type = '급여';
      else if (hira.mediPayYn === 'N') patch.pay_type = '비급여';

      if (!Object.keys(patch).length) continue;

      const { error } = await db.from('disease_drugs').update(patch).eq('id', drug.id);
      if (!error) updated++;
    }

    /* ── 4. ATC 계층 테이블 동기화 ── */
    let atcInserted = 0;
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

    return NextResponse.json({
      ok: true,
      atcEnabled: true,
      drugsScanned: drugs.length,
      hiraMatched: hiraMap.size,
      updated,
      atcInserted,
      hiraErrors,
    });

  } catch (e) {
    console.error('[sync-hira] 예외:', e);
    return NextResponse.json({
      error: e instanceof Error ? e.message : '동기화 중 오류가 발생했습니다.',
    }, { status: 500 });
  }
}
