/**
 * POST /api/admin/sync-mfds
 * 식약처 API → disease_drugs.reference_drug + permit_kind + approval_date 동기화
 * 관리자 전용
 *
 * 사전 조건: MFDS_API_KEY 환경변수 설정 필요
 *   공공데이터포털(data.go.kr) → 식품의약품안전처 서비스 신청:
 *   1) DrugPrdtPrmsnInfoService06 (의약품 허가정보)
 *   2) BioeqDrugService01 (생물학적동등성시험결과)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import {
  searchBioeqByIngr,
  searchMfdsDrugPermit,
  permitKindLabel,
} from '@/lib/mfds/client';

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

  if (!process.env.MFDS_API_KEY) {
    return NextResponse.json({
      error: 'MFDS_API_KEY 환경변수가 설정되지 않았습니다.',
      guide: [
        '1. https://www.data.go.kr 에서 아래 두 서비스를 신청하세요.',
        '   • 식품의약품안전처_의약품 허가목록 (DrugPrdtPrmsnInfoService06)',
        '   • 식품의약품안전처_생물학적동등성시험결과정보조회서비스 (BioeqDrugService01)',
        '2. 승인된 API 키를 Vercel → Settings → Environment Variables → MFDS_API_KEY 에 설정하세요.',
      ],
    }, { status: 503 });
  }

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── 1. disease_drugs에서 성분명 목록 (제네릭 우선) ────────────────────
  const { data: drugs } = await db
    .from('disease_drugs')
    .select('id, product_name, ingredient_name, is_original')
    .not('ingredient_name', 'is', null);

  if (!drugs?.length) {
    return NextResponse.json({ error: 'disease_drugs가 비어 있습니다. 먼저 질환DB 임포트를 실행하세요.' }, { status: 400 });
  }

  // ── 2. 성분명별 대조약 정보 수집 (생동성시험 API) ──────────────────────
  const uniqueIngrs = [...new Set(
    drugs.map(d => (d.ingredient_name as string | null)?.trim()).filter(Boolean) as string[]
  )];

  // bioeqMap: productName → refDrugName
  const bioeqMap = new Map<string, string>();
  // permitMap: productName → { permitKindCd, approvalDate }
  const permitMap = new Map<string, { permitKindCd: string; approvalDate: string }>();
  let apiErrors = 0;

  for (const ingr of uniqueIngrs) {
    // 생동성시험 → 대조약 매핑
    try {
      let pageNo = 1;
      while (true) {
        const { items, totalCount } = await searchBioeqByIngr({
          ingrName: ingr, numOfRows: 100, pageNo,
        });
        for (const item of items) {
          const pn = item.productName.trim();
          if (pn && item.refDrugName && !bioeqMap.has(pn)) {
            bioeqMap.set(pn, item.refDrugName.trim());
          }
        }
        if (pageNo * 100 >= totalCount || pageNo >= 3) break;
        pageNo++;
      }
    } catch (e) {
      console.warn(`[MFDS bioeq] ${ingr}:`, e);
      apiErrors++;
    }

    // 허가 정보 → 허가종류 매핑
    try {
      let pageNo = 1;
      while (true) {
        const { items, totalCount } = await searchMfdsDrugPermit({
          itemName: ingr, numOfRows: 100, pageNo,
        });
        for (const item of items) {
          const pn = item.itemName.trim();
          if (pn && !permitMap.has(pn)) {
            permitMap.set(pn, {
              permitKindCd: item.permitKindCd,
              approvalDate: item.approvalDate,
            });
          }
        }
        if (pageNo * 100 >= totalCount || pageNo >= 3) break;
        pageNo++;
      }
    } catch (e) {
      console.warn(`[MFDS permit] ${ingr}:`, e);
      apiErrors++;
    }
  }

  // ── 3. disease_drugs 업데이트 ─────────────────────────────────────────
  let updated = 0;

  for (const drug of drugs) {
    const prodName = (drug.product_name as string).trim();
    const refDrug  = bioeqMap.get(prodName);
    const permit   = permitMap.get(prodName);

    if (!refDrug && !permit) continue;

    const updatePayload: Record<string, unknown> = {};
    if (refDrug)        updatePayload.reference_drug = refDrug;
    if (permit) {
      updatePayload.permit_kind   = permitKindLabel(permit.permitKindCd);
      updatePayload.approval_date = permit.approvalDate;
    }

    const { error } = await db
      .from('disease_drugs')
      .update(updatePayload)
      .eq('id', drug.id as number);

    if (!error) updated++;
  }

  return NextResponse.json({
    ok: true,
    drugsScanned: drugs.length,
    bioeqMatched: bioeqMap.size,
    permitMatched: permitMap.size,
    updated,
    apiErrors,
  });
}
