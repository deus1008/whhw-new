import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId } from '@/lib/active-company';
import { analyzeEdiFile } from '@/app/edi/actions';
import { stripCompanyAffix } from '@/lib/format';

export const dynamic = 'force-dynamic';

const THRESHOLD   = 200_000;
const EDI_FOLDER  = 'EDI';
const EDI_TYPES   = ['xlsx', 'xls', 'csv', 'txt'];

type RawRow = {
  hospital_name:       string;
  cso_name:            string | null;
  sales_rep:           string | null;
  source_file:         string | null;
  prescription_amount: number;
};

export type HospitalTarget = {
  hospitalName:   string;
  csoName:        string;
  salesRep:       string;
  avgAmount:      number;
  monthlyAmounts: Record<string, number>; // YYYYMM → 합계
  monthCount:     number;
};

export type CodeDeleteResult = {
  months:    string[];   // 최근 3개 파일의 연월 YYYYMM (오름차순)
  targets:   HospitalTarget[];
  threshold: number;
};

/** 파일명에서 YYYYMM 추출 */
function extractYM(filename: string | null): string {
  if (!filename) return '000000';
  const m = filename.match(/(\d{4})[.\-_]?(\d{2})/);
  return m ? `${m[1]}${m[2]}` : '000000';
}

function db() {
  return createSvc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, roles, status, company_id')
    .eq('id', user.id)
    .single();
  if (!profile || profile.status !== 'approved')
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });

  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAdmin          = profileIsAdmin(profile);
  const companyId        = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  const sb = db();

  // 1. documents 테이블에서 EDI 파일 목록 → 파일명 기준 최근 3개 선택
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docQ: any = sb
    .from('documents')
    .select('id, filename')
    .eq('category', EDI_FOLDER)
    .in('file_type', EDI_TYPES);
  if (companyId) docQ = docQ.eq('company_id', companyId);
  else           docQ = docQ.is('company_id', null);

  const { data: docRows, error: docErr } = await docQ;
  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  type DocRow = { id: string; filename: string };
  const allDocs = (docRows ?? []) as DocRow[];

  if (allDocs.length === 0) {
    return NextResponse.json({ months: [], targets: [], threshold: THRESHOLD } satisfies CodeDeleteResult);
  }

  // 파일명 연월 기준 내림차순 → 최근 3개
  const recentDocs = allDocs
    .sort((a, b) => extractYM(b.filename).localeCompare(extractYM(a.filename)))
    .slice(0, 3);

  const recentFilenames = recentDocs.map(d => d.filename);
  const last3 = recentFilenames.map(f => extractYM(f)).sort();

  // 2. trend_prescriptions에 아직 없는 파일은 EDI 분석 실행 (자동 동기화)
  const { data: syncedRows } = await sb
    .from('trend_prescriptions')
    .select('source_file')
    .in('source_file', recentFilenames);

  const syncedSet = new Set(
    (syncedRows ?? []).map((r: { source_file: string | null }) => r.source_file).filter(Boolean)
  );

  const unsynced = recentDocs.filter(d => !syncedSet.has(d.filename));

  // 미분석 파일 순차 처리 (analyzeEdiFile → syncEdiToDb 내부 호출)
  for (const doc of unsynced) {
    await analyzeEdiFile(doc.id);
  }

  // 3. 최근 3개 파일 데이터 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dataQ: any = sb
    .from('trend_prescriptions')
    .select('hospital_name, cso_name, sales_rep, source_file, prescription_amount')
    .in('source_file', recentFilenames);
  if (companyId) dataQ = dataQ.eq('company_id', companyId);
  else           dataQ = dataQ.is('company_id', null);

  const { data: rows, error: dataErr } = await dataQ;
  if (dataErr) return NextResponse.json({ error: dataErr.message }, { status: 500 });

  // source_file → YYYYMM 매핑
  const fileToYM = new Map(recentFilenames.map(f => [f, extractYM(f)]));

  // 4. 처방처별 월별 합산
  type HospMeta = { csoName: string; salesRep: string; latestYM: string };
  const hospMeta    = new Map<string, HospMeta>();
  const hospMonthly = new Map<string, Map<string, number>>();

  for (const row of (rows ?? []) as RawRow[]) {
    const hName = stripCompanyAffix((row.hospital_name ?? '').trim());
    if (!hName) continue;
    const ym     = fileToYM.get(row.source_file ?? '') ?? extractYM(row.source_file);
    const amount = Number(row.prescription_amount) || 0;
    const cso    = stripCompanyAffix((row.cso_name  ?? '').trim()) || '미지정';
    const rep    = stripCompanyAffix((row.sales_rep ?? '').trim()) || '미지정';

    if (!hospMonthly.has(hName)) hospMonthly.set(hName, new Map());
    const mmap = hospMonthly.get(hName)!;
    mmap.set(ym, (mmap.get(ym) ?? 0) + amount);

    const ex = hospMeta.get(hName);
    if (!ex || ym > ex.latestYM) {
      hospMeta.set(hName, { csoName: cso, salesRep: rep, latestYM: ym });
    }
  }

  // 5. 평균 계산 및 필터 (없는 달 = 0)
  const targets: HospitalTarget[] = [];

  for (const [hName, mmap] of hospMonthly) {
    const monthlyAmounts: Record<string, number> = {};
    let total = 0;
    for (const m of last3) {
      const amt = mmap.get(m) ?? 0;
      monthlyAmounts[m] = amt;
      total += amt;
    }
    const avgAmount = total / last3.length;

    if (avgAmount < THRESHOLD) {
      const meta = hospMeta.get(hName)!;
      targets.push({
        hospitalName:   hName,
        csoName:        meta.csoName,
        salesRep:       meta.salesRep,
        avgAmount,
        monthlyAmounts,
        monthCount:     [...mmap.keys()].filter(m => last3.includes(m)).length,
      });
    }
  }

  targets.sort((a, b) => a.avgAmount - b.avgAmount);

  return NextResponse.json({ months: last3, targets, threshold: THRESHOLD } satisfies CodeDeleteResult);
}
