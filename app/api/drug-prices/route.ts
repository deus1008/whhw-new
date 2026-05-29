import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * 약가 파일 업로드·조회 API
 *
 * GET  ?q={품목명}           — DB에서 약가 검색
 * POST multipart(file=...)  — Excel/CSV 파일 업로드 → drug_prices 테이블에 저장
 *
 * 지원 Excel 컬럼명 (한글/영문 자동 감지):
 *   품목명·품명·itmNm          → item_name
 *   상한가·최고상한가·mxCprc   → max_price
 *   급여구분·급여유형·payTpNm  → pay_type
 *   규격·규격명·nomNm          → standard
 *   단위·unit                  → unit
 *   시행일·시행년월일·adtStaDd → effective_date
 *   제조업체·제조업체명·mnfEntpNm → manufacturer
 *   코드·품목코드              → item_code
 */

/* ── 서비스 롤 클라이언트 (RLS 우회) ── */
function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/* ── 컬럼명 매핑 ── */
const COL_MAP: Record<string, string> = {
  // item_name
  '품목명': 'item_name', '품명': 'item_name', 'itmNm': 'item_name', 'ITEM_NAME': 'item_name',
  // max_price
  '상한가': 'max_price', '최고상한가': 'max_price', '최고상한금액': 'max_price',
  'mxCprc': 'max_price', 'MX_CPRC': 'max_price',
  // pay_type
  '급여구분': 'pay_type', '급여유형': 'pay_type', '급여구분명': 'pay_type',
  'payTpNm': 'pay_type', 'PAY_TP_NM': 'pay_type',
  // standard
  '규격': 'standard', '규격명': 'standard', '제형규격명': 'standard',
  'nomNm': 'standard', 'NOM_NM': 'standard',
  // unit
  '단위': 'unit', 'unit': 'unit', 'UNIT': 'unit',
  // effective_date
  '시행일': 'effective_date', '시행년월일': 'effective_date', '적용시작일': 'effective_date',
  '적용일자': 'effective_date', 'adtStaDd': 'effective_date', 'ADT_STA_DD': 'effective_date',
  // manufacturer
  '제조업체': 'manufacturer', '제조업체명': 'manufacturer', '제조사': 'manufacturer',
  'mnfEntpNm': 'manufacturer', 'MNF_ENTP_NM': 'manufacturer',
  // item_code
  '코드': 'item_code', '품목코드': 'item_code', '품목번호': 'item_code',
  '주성분코드': 'item_code',
};

/* ── GET: 품목명으로 약가 검색 ── */
export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ prices: [] });

  // 검색 키: 앞부분 한글 최대 6자
  const m    = q.match(/^([가-힣A-Za-z]+)/);
  const key  = m ? m[1].slice(0, 6) : q.slice(0, 6);

  const sb = serviceClient();
  const { data, error } = await sb
    .from('drug_prices')
    .select('*')
    .ilike('item_name', `%${key}%`)
    .order('effective_date', { ascending: false })
    .limit(20);

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ prices: [] }); // 테이블 없음 → 무시
    console.error('[drug-prices] GET error:', error.message);
    return NextResponse.json({ prices: [] });
  }

  return NextResponse.json({ prices: data ?? [] });
}

/* ── POST: Excel/CSV 업로드 ── */
export async function POST(req: NextRequest) {
  /* 관리자 인증 */
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자만 업로드할 수 있습니다.' }, { status: 403 });
  }

  /* 파일 수신 */
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    return NextResponse.json({ error: 'xlsx / xls / csv 파일만 지원합니다.' }, { status: 400 });
  }

  /* Excel 파싱 */
  const buffer = Buffer.from(await file.arrayBuffer());
  let rawRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  } catch {
    return NextResponse.json({ error: 'Excel 파싱에 실패했습니다.' }, { status: 400 });
  }

  if (rawRows.length === 0) {
    return NextResponse.json({ error: '데이터가 없습니다.' }, { status: 400 });
  }

  /* 컬럼 매핑 */
  const colMapping: Record<string, string> = {};
  for (const rawKey of Object.keys(rawRows[0])) {
    const trimmed = String(rawKey).trim();
    if (COL_MAP[trimmed]) colMapping[rawKey] = COL_MAP[trimmed];
  }

  if (!Object.values(colMapping).includes('item_name')) {
    return NextResponse.json({
      error: '품목명 컬럼을 찾을 수 없습니다. 컬럼명(품목명/품명/itmNm)을 확인하세요.',
    }, { status: 400 });
  }

  /* 행 변환 */
  const rows = rawRows
    .map(row => {
      const out: Record<string, unknown> = { source_file: file.name };
      for (const [rawKey, mappedKey] of Object.entries(colMapping)) {
        const val = String(row[rawKey] ?? '').trim();
        if (mappedKey === 'max_price') {
          out[mappedKey] = val ? (parseInt(val.replace(/,/g, ''), 10) || null) : null;
        } else {
          out[mappedKey] = val || null;
        }
      }
      return out;
    })
    .filter(r => r.item_name);

  if (rows.length === 0) {
    return NextResponse.json({ error: '유효한 품목명 데이터가 없습니다.' }, { status: 400 });
  }

  /* DB 저장: 같은 파일명 데이터 교체 */
  const sb = serviceClient();
  const { error: delErr } = await sb
    .from('drug_prices')
    .delete()
    .eq('source_file', file.name);

  if (delErr && delErr.code !== '42P01') {
    console.error('[drug-prices] delete error:', delErr);
  }

  /* 500건씩 배치 삽입 */
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: insErr } = await sb
      .from('drug_prices')
      .insert(rows.slice(i, i + CHUNK));

    if (insErr) {
      if (insErr.code === '42P01') {
        return NextResponse.json({
          error: 'drug_prices 테이블이 없습니다. Supabase SQL Editor에서 마이그레이션을 실행해 주세요.',
        }, { status: 500 });
      }
      console.error('[drug-prices] insert error:', insErr);
      return NextResponse.json({ error: `저장 실패: ${insErr.message}` }, { status: 500 });
    }
    inserted += Math.min(CHUNK, rows.length - i);
  }

  return NextResponse.json({
    success: true,
    inserted,
    total: rawRows.length,
    fileName: file.name,
  });
}
