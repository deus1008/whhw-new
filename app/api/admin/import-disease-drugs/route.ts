/**
 * POST /api/admin/import-disease-drugs
 * public/data/질환별의약품_DB.xlsx → disease_drugs 테이블 일괄 임포트
 * 관리자 전용
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface ExcelRow {
  질환군?: string;
  중분류?: string;
  치료분류?: string;
  성분명?: string;
  제품명?: string;
  제조사?: string;
  판매사?: string;
  규격?: string;
  가격?: string;
  급여여부?: string;
  오리지널여부?: string;
  작용기전?: string;
  비고?: string;
}

interface MechanismRow {
  질환군?: string;
  중분류?: string;
  치료분류?: string;
  '작용기전 요약'?: string;
}

function parsePrice(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9]/g, ''));
  return isNaN(n) || n === 0 ? null : n;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
  if (!profile || !profileIsAdmin(profile)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 엑셀 파일 읽기
  const filePath = path.join(process.cwd(), 'public', 'data', '질환별의약품_DB.xlsx');
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: '질환별의약품_DB.xlsx 파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  const wb = XLSX.readFile(filePath);

  // ── 전체 의약품 목록 시트 파싱 ──────────────────────────────────────────
  const ws = wb.Sheets['전체 의약품 목록'];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: null });

  // ── 기전별 분류 시트 (작용기전 요약) ────────────────────────────────────
  const wsMech = wb.Sheets['기전별 분류'];
  const mechRows = XLSX.utils.sheet_to_json<MechanismRow>(wsMech ?? {}, { defval: null });

  // 기전별 맵: "질환군||중분류||치료분류" → 작용기전 요약
  const mechMap = new Map<string, string>();
  for (const r of mechRows) {
    const key = `${r.질환군 ?? ''}||${r.중분류 ?? ''}||${r.치료분류 ?? ''}`;
    if (r['작용기전 요약']) mechMap.set(key, r['작용기전 요약']);
  }

  const records = rows
    .filter(r => r.성분명 || r.제품명)
    .map(r => {
      const mechKey = `${r.질환군 ?? ''}||${r.중분류 ?? ''}||${r.치료분류 ?? ''}`;
      const mechFallback = `${r.질환군 ?? ''}||||`;

      const origRaw = (r.오리지널여부 ?? '').trim().toLowerCase();
      const isOriginal = origRaw === '오리지널' || origRaw === 'o' || origRaw === 'y'
        || origRaw === '○' || origRaw === '예' || origRaw === 'true' || origRaw === '1';

      return {
        disease_group:   (r.질환군   ?? '').trim() || null,
        sub_category:    (r.중분류   ?? '').trim() || null,
        treatment_class: (r.치료분류 ?? '').trim() || null,
        ingredient_name: (r.성분명   ?? '').trim() || null,
        product_name:    (r.제품명   ?? '').trim() || null,
        manufacturer:    (r.제조사   ?? '').trim() || null,
        distributor:     (r.판매사   ?? '').trim() || null,
        standard:        (r.규격     ?? '').trim() || null,
        pay_type:        (r.급여여부 ?? '').trim() || null,
        is_original:     isOriginal,
        mechanism:       (mechMap.get(mechKey) ?? mechMap.get(mechFallback) ?? (r.작용기전 ?? '').trim()) || null,
        note:            (r.비고     ?? '').trim() || null,
        max_price:       parsePrice(r.가격 as string | undefined),
        source_file:     '질환별의약품_DB.xlsx',
      };
    });

  if (!records.length) {
    return NextResponse.json({ error: '임포트할 데이터가 없습니다.' }, { status: 400 });
  }

  // 기존 데이터 삭제 후 재적재
  await db.from('disease_drugs').delete().eq('source_file', '질환별의약품_DB.xlsx');

  const CHUNK = 200;
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await db.from('disease_drugs').insert(records.slice(i, i + CHUNK));
    if (error) {
      errors.push(`chunk ${i}: ${error.message}`);
    } else {
      inserted += records.slice(i, i + CHUNK).length;
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    total: records.length,
    errors: errors.length ? errors : undefined,
  });
}
