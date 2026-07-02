/**
 * POST /api/admin/sync-hira
 * HIRA 약제급여목록 API → disease_drugs.atc_code + max_price + item_code 동기화
 * 관리자 전용
 *
 * 사전 조건: HIRA_API_KEY 환경변수 설정 필요
 *   공공데이터포털(data.go.kr) → 건강보험심사평가원_보험의약품정보서비스 신청
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { searchHiraDrugs, fetchHiraAtcList, type HiraDrugItem } from '@/lib/hira/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
  if (!profile || !profileIsAdmin(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.HIRA_API_KEY) {
    return NextResponse.json({
      error: 'HIRA_API_KEY 환경변수가 설정되지 않았습니다.',
      guide: 'Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에 HIRA_API_KEY를 추가하세요.',
    }, { status: 503 });
  }

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── 1. disease_drugs에서 품목명 목록 가져오기 ──────────────────────────
  const { data: drugs } = await db
    .from('disease_drugs')
    .select('id, product_name, ingredient_name')
    .not('product_name', 'is', null);

  if (!drugs?.length) {
    return NextResponse.json({ error: 'disease_drugs가 비어 있습니다. 먼저 질환DB 임포트를 실행하세요.' }, { status: 400 });
  }

  // ── 2. 성분명 단위로 HIRA 조회 (중복 제거) ──────────────────────────────
  const uniqueIngrs = [...new Set(
    drugs.map(d => (d.ingredient_name as string | null)?.trim()).filter(Boolean) as string[]
  )];

  const hiraMap = new Map<string, HiraDrugItem>();  // productName → HiraItem
  let hiraErrors = 0;

  for (const ingr of uniqueIngrs) {
    try {
      // 페이지네이션: 최대 300건 조회
      let pageNo = 1;
      while (true) {
        const { items, totalCount } = await searchHiraDrugs({ ingrName: ingr, numOfRows: 100, pageNo });
        for (const item of items) {
          if (item.itemName && !hiraMap.has(item.itemName.trim())) {
            hiraMap.set(item.itemName.trim(), item);
          }
        }
        if (pageNo * 100 >= totalCount || pageNo >= 3) break;
        pageNo++;
      }
    } catch (e) {
      console.warn(`[HIRA sync] ${ingr} 조회 실패:`, e);
      hiraErrors++;
    }
  }

  // ── 3. disease_drugs 업데이트 ─────────────────────────────────────────
  let updated = 0;
  const CHUNK = 50;

  for (let i = 0; i < drugs.length; i += CHUNK) {
    const chunk = drugs.slice(i, i + CHUNK);
    for (const drug of chunk) {
      const hira = hiraMap.get((drug.product_name as string).trim());
      if (!hira) continue;

      const { error } = await db
        .from('disease_drugs')
        .update({
          atc_code:  hira.atcCode  || null,
          atc_name:  hira.atcName  || null,
          item_code: hira.itemSeq  || null,
          max_price: hira.maxPrice ?? null,
          pay_type:  hira.mediPayYn === 'Y' ? '급여' : hira.mediPayYn === 'N' ? '비급여' : null,
        })
        .eq('id', drug.id as number);

      if (!error) updated++;
    }
  }

  // ── 4. ATC 코드 계층 테이블 동기화 ──────────────────────────────────────
  let atcInserted = 0;
  try {
    const atcItems = await fetchHiraAtcList();
    if (atcItems.length > 0) {
      // 기존 삭제 후 재적재
      await db.from('atc_codes').delete().neq('code', '');
      const atcChunk = 200;
      for (let i = 0; i < atcItems.length; i += atcChunk) {
        const { error } = await db.from('atc_codes').upsert(
          atcItems.slice(i, i + atcChunk).map(a => ({
            code:        a.code,
            level:       a.level,
            name_ko:     a.nameKo,
            parent_code: a.parent,
          })),
          { onConflict: 'code' },
        );
        if (!error) atcInserted += atcItems.slice(i, i + atcChunk).length;
      }
    }
  } catch (e) {
    console.warn('[HIRA sync] ATC 계층 동기화 실패:', e);
  }

  return NextResponse.json({
    ok: true,
    drugsScanned: drugs.length,
    hiraMatched: hiraMap.size,
    updated,
    atcInserted,
    hiraErrors,
  });
}
