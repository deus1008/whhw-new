import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import DashboardClient from '@/components/DashboardClient';
import type { DashboardData } from '@/components/DashboardClient';
import { parseInventoryBuffer } from '@/lib/inventory/parse';
import type { StockAlertItem } from '@/lib/inventory/parse';
import { getPerformanceData } from '@/app/performance/actions';
import { profileIsAdmin } from '@/lib/roles';
import { getEffectiveCompanyId, isAllianceEmployee } from '@/lib/active-company';
import AllianceCompanyBar from '@/components/AllianceCompanyBar';

export const dynamic = 'force-dynamic';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** "202604" → "2026-04", "2026-04" → "2026-04", "2026.04" → "2026-04" */
function toYYYYMM(s: string): string {
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4)}`;
  if (/^\d{4}\.\d{2}$/.test(s)) return s.replace('.', '-');
  return s;
}

const COMP_KEYWORDS = ['경쟁사', '경쟁동향', '시장동향', 'CSO동향', '경쟁현황'];

function isCompCategory(cat: string | null): boolean {
  if (!cat) return false;
  return COMP_KEYWORDS.some(k => cat.includes(k));
}

/** 의원 여부: hospital_category 우선, fallback hospital_type */
function isClinic(cat: string | null, typ?: string | null): boolean {
  const v = (cat ?? typ ?? '').trim();
  return v === '의원' || v.endsWith('의원');
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) console.error('[dashboard:getUser]', userError);
  if (!user) redirect('/login');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, roles, status, company_id')
    .eq('id', user.id)
    .single();

  if (!myProfile || myProfile.status !== 'approved') redirect('/pending');

  const isAdmin = profileIsAdmin(myProfile);
  const profileCompanyId = (myProfile.company_id as string) ?? null;
  const isAllianceUser = isAllianceEmployee(profileCompanyId, isAdmin);

  // 아주얼라이언스 직원의 경우 쿠키에 저장된 선택 위탁사를 companyId로 사용
  const companyId = await getEffectiveCompanyId(profileCompanyId, isAdmin);

  const svc = getSvc();

  // 아주얼라이언스 직원용: 위탁사 선택 목록
  let allianceCompanies: { id: string; name: string }[] = [];
  if (isAllianceUser) {
    const { data: companiesData } = await svc
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    allianceCompanies = (companiesData ?? []) as { id: string; name: string }[];
  }

  // 위탁사 이름 조회 (뱃지 표시용)
  let companyName: string | null = isAdmin ? null : '아주얼라이언스';
  if (companyId) {
    const { data: cd } = await svc
      .from('client_companies').select('name').eq('id', companyId).single();
    companyName = (cd as { name: string } | null)?.name ?? null;
  }

  // ── 날짜 기준 ──────────────────────────────────────────────────────────────
  const now = new Date();

  const since4m = new Date(now);
  since4m.setMonth(since4m.getMonth() - 4);
  const since4mStr = `${since4m.getFullYear()}-${String(since4m.getMonth() + 1).padStart(2, '0')}`;

  const since3m = new Date(now);
  since3m.setMonth(since3m.getMonth() - 3);
  const since3mStr = since3m.toISOString().slice(0, 10);

  const next2m = new Date(now);
  next2m.setMonth(next2m.getMonth() + 2);
  const next2mStr = next2m.toISOString().slice(0, 10);

  // ── A. commission_settlements (4개월, 병렬 페이지네이션) ──────────────────
  type SRow = {
    prescription_month:  string;
    hospital_name:       string | null;
    hospital_category:   string | null;
    hospital_type:       string | null;
    product_name:        string | null;
    prescription_amount: number | null;
    settlement_amount:   number | null;
    cso_name:            string | null;
  };

  const PAGE  = 1000;
  const BATCH = 10;
  let allSett: SRow[] = [];

  let settQ0 = svc
    .from('commission_settlements')
    .select(
      'prescription_month,hospital_name,hospital_category,hospital_type,product_name,prescription_amount,settlement_amount,cso_name',
      { count: 'exact' },
    )
    .not('prescription_month', 'is', null)
    .gte('prescription_month', since4mStr)
    .range(0, PAGE - 1);
  if (companyId) settQ0 = settQ0.eq('company_id', companyId);
  const { data: firstSett, count: settCount } = await settQ0;

  if (firstSett) allSett = firstSett as SRow[];

  const settPages = Math.ceil((settCount ?? firstSett?.length ?? 0) / PAGE);
  if (settPages > 1) {
    for (let bs = 1; bs < settPages; bs += BATCH) {
      const be    = Math.min(bs + BATCH, settPages);
      const batch = await Promise.all(
        Array.from({ length: be - bs }, (_, i) => {
          const pg = bs + i;
          let pQ = svc
            .from('commission_settlements')
            .select('prescription_month,hospital_name,hospital_category,hospital_type,product_name,prescription_amount,settlement_amount,cso_name')
            .not('prescription_month', 'is', null)
            .gte('prescription_month', since4mStr)
            .range(pg * PAGE, pg * PAGE + PAGE - 1);
          if (companyId) pQ = pQ.eq('company_id', companyId);
          return pQ;
        }),
      );
      for (const r of batch) {
        if (r.data) allSett = allSett.concat(r.data as SRow[]);
      }
    }
  }

  // ── B. 나머지 쿼리 병렬 실행 (마감분석 데이터도 함께 병렬 시작) ───────────────
  const perfDataPromise = getPerformanceData(companyId);

  // 위탁사 필터가 필요한 쿼리를 미리 빌드
  const ediQ = (() => {
    let q = svc.from('trend_prescriptions')
      .select('prescription_month,hospital_name,product_name,prescription_amount,hospital_type')
      .not('prescription_month', 'is', null)
      .gte('created_at', since3mStr)
      .order('created_at', { ascending: false })
      .range(0, 2999);
    if (companyId) q = q.eq('company_id', companyId);
    return q;
  })();
  const upcomingQ = (() => {
    let q = svc.from('upcoming_products')
      .select('id,title,manufacturer,launch_date,status,indication,insurance_code,insurance_price,memo')
      .not('status', 'eq', '단종')
      .not('status', 'eq', '발매완료')
      .order('launch_date', { ascending: true })
      .order('memo', { ascending: true, nullsFirst: false })
      .limit(15);
    if (companyId) q = q.eq('company_id', companyId);
    return q;
  })();
  const dcQ = (() => {
    let q = svc.from('dc_status')
      .select('id,category,product_name,hospital_name,progress,updated_at')
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })
      .limit(200);
    if (companyId) q = q.eq('company_id', companyId);
    return q;
  })();

  // 위탁사 필터가 필요한 추가 쿼리 빌드
  const custQ = (() => {
    let q = svc.from('customer_status').select('source_file, created_at').gte('created_at', since3mStr);
    if (companyId) q = q.eq('company_id', companyId);
    return q;
  })();
  const docQ = (() => {
    let q = svc.from('documents')
      .select('id,filename,category,file_type,created_at,status,summary')
      .gte('created_at', since3mStr)
      .order('created_at', { ascending: false })
      .limit(60);
    if (companyId) q = q.eq('company_id', companyId);
    return q;
  })();
  const invDocQ = (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = svc.from('documents')
      .select('id,filename,storage_path,created_at')
      .eq('category', '품절예측');
    if (companyId) q = q.eq('company_id', companyId);
    return q.order('created_at', { ascending: false }).limit(1).single();
  })();

  const [
    { data: custRows },
    { data: visitRows },
    { data: profileRows },
    { data: scheduleRows },
    { data: ediRows },
    { data: upcomingRows },
    { data: docRows },
    { data: dcRows },
    { data: invDoc },
  ] = await Promise.all([
    custQ,
    svc.from('visit_records')
      .select('user_id, visited_at, customer_name, contact_name, content')
      .gte('visited_at', since3mStr)
      .order('visited_at', { ascending: true }),
    svc.from('profiles')
      .select('id, email, full_name')
      .eq('status', 'approved'),
    svc.from('marketing_schedules')
      .select('title, start_date, end_date, category, location, assignee')
      .gte('start_date', since3mStr)
      .lte('start_date', next2mStr)
      .order('start_date', { ascending: true })
      .limit(60),
    // 처방실적(EDI/실적마감): 최근 3개월 (위탁사 필터 적용)
    ediQ,
    // 발매예정: 단종·발매완료 제외, 발매일 → 성분명 순 (위탁사 필터 적용)
    upcomingQ,
    // 문서: 최근 3개월 (위탁사 필터 적용)
    docQ,
    // DC현황: 전체 목록 (sort_order 순, 위탁사 필터 적용)
    dcQ,
    // 품절예측: 최신 파일 메타 (위탁사 필터 적용)
    invDocQ,
  ]);

  // ── B-2. 품절예측 파일 다운로드 + 파싱 ───────────────────────────────────────
  let stockItems: StockAlertItem[] = [];
  let stockFileName: string | null = null;
  if (invDoc?.storage_path) {
    stockFileName = invDoc.filename as string;
    const { data: blob } = await svc.storage.from('documents').download(invDoc.storage_path as string);
    if (blob) {
      const buf = Buffer.from(await blob.arrayBuffer());
      const result = parseInventoryBuffer(buf);
      if (!result.error) stockItems = result.items;
    }
  }

  // ── B-3. 마감분석 처방처수 맵 빌드 (기간 "YYYY.MM" → "YYYY-MM" 변환) ────────
  const perfResult = await perfDataPromise;
  type PerfCount = { total: number; clinic?: number; hospital?: number };
  const perfMap: Record<string, PerfCount> = {};
  for (const report of (perfResult?.reports ?? [])) {
    const period = report.period.replace('.', '-'); // "2026.05" → "2026-05"
    perfMap[period] = {
      total:    report.data.prescriptionCount,
      clinic:   report.data.clinicPrescriptionCount,
      hospital: report.data.hospitalPrescriptionCount,
    };
  }

  // ── C. Settlement 데이터 가공 ─────────────────────────────────────────────
  const normSett = allSett.map(r => ({
    ...r,
    prescription_month: toYYYYMM(r.prescription_month),
  }));

  const allMonths    = [...new Set(normSett.map(r => r.prescription_month))].sort();
  const recentMonths = allMonths.slice(-3);
  const recentSet    = new Set(recentMonths);

  /** 행 집합을 집계: hospCount, totalPrescAmt, totalSettAmt, avgPrescAmt, avgSettAmt */
  function aggRows(rows: SRow[]) {
    const hosps    = new Set(rows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const prescAmt = rows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0);
    const settAmt  = rows.reduce((s, r) => s + (r.settlement_amount  ?? 0), 0);
    if (hosps.size === 0 && prescAmt === 0) return null;
    return {
      hospCount:    hosps.size,
      totalPrescAmt: prescAmt,
      totalSettAmt:  settAmt,
      avgPrescAmt:   hosps.size > 0 ? Math.round(prescAmt / hosps.size) : 0,
      avgSettAmt:    hosps.size > 0 ? Math.round(settAmt  / hosps.size) : 0,
    };
  }

  // ── [섹션 2] 거래처현황: CSO별 집계 ──────────────────────────────────────
  type CsoAcc = { prescAmt: number; settAmt: number; hosps: Set<string> };
  const csoAccMap: Record<string, CsoAcc> = {};
  for (const r of normSett.filter(r => recentSet.has(r.prescription_month))) {
    const key = (r.cso_name ?? '').trim() || '미지정';
    if (!csoAccMap[key]) csoAccMap[key] = { prescAmt: 0, settAmt: 0, hosps: new Set() };
    csoAccMap[key].prescAmt += r.prescription_amount ?? 0;
    csoAccMap[key].settAmt  += r.settlement_amount   ?? 0;
    if (r.hospital_name) csoAccMap[key].hosps.add(r.hospital_name);
  }
  const allCsoStats = Object.entries(csoAccMap)
    .map(([name, v]) => ({ name, prescAmt: v.prescAmt, settAmt: v.settAmt, hospCount: v.hosps.size }))
    .sort((a, b) => b.prescAmt - a.prescAmt);
  const totalCsoCount = allCsoStats.length;
  const csoStats = allCsoStats.slice(0, 10);
  // 처방처수는 CSO별 Set 합산(중복 발생) 대신 전체 unique 병원명 Set으로 계산
  const csoAllHospSet = new Set<string>();
  for (const r of normSett.filter(r => recentSet.has(r.prescription_month))) {
    if (r.hospital_name) csoAllHospSet.add(r.hospital_name);
  }
  const csoAllTotals = {
    hospCount: csoAllHospSet.size,
    prescAmt:  allCsoStats.reduce((s, r) => s + r.prescAmt, 0),
    settAmt:   allCsoStats.reduce((s, r) => s + r.settAmt,  0),
  };

  // ── [섹션 3] 처방처현황: 병원/의원 월별 분리 집계 ────────────────────────
  const settlementByCategory = recentMonths.map(month => {
    const rows   = normSett.filter(r => r.prescription_month === month);
    const clRows = rows.filter(r =>  isClinic(r.hospital_category, r.hospital_type));
    const hsRows = rows.filter(r => !isClinic(r.hospital_category, r.hospital_type));
    return { month, clinic: aggRows(clRows), hospital: aggRows(hsRows) };
  });

  const prescriptionMonthly = recentMonths.map(month => {
    const rows    = normSett.filter(r => r.prescription_month === month);
    const clRows  = rows.filter(r =>  isClinic(r.hospital_category, r.hospital_type));
    const hsRows  = rows.filter(r => !isClinic(r.hospital_category, r.hospital_type));
    const allH    = new Set(rows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const clH     = new Set(clRows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const hsH     = new Set(hsRows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const prods   = new Set(rows.filter(r => r.product_name).map(r => r.product_name!));
    return {
      month,
      hospCount:        allH.size,
      clinicCount:      clH.size,
      hospitalCount:    hsH.size,
      productCount:     prods.size,
      totalPrescAmt:    rows.reduce((s, r)   => s + (r.prescription_amount ?? 0), 0),
      clinicPrescAmt:   clRows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0),
      hospitalPrescAmt: hsRows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0),
    };
  });

  // ── [섹션 2] 상위 10 거래처 (병원/의원 처방액 기준) ───────────────────────
  type HospAcc = { category: string; prescAmt: number; settAmt: number };
  const hospAccMap: Record<string, HospAcc> = {};
  for (const r of normSett.filter(r => recentSet.has(r.prescription_month))) {
    if (!r.hospital_name) continue;
    if (!hospAccMap[r.hospital_name]) {
      hospAccMap[r.hospital_name] = {
        category: isClinic(r.hospital_category, r.hospital_type) ? '의원' : '병원',
        prescAmt: 0, settAmt: 0,
      };
    }
    hospAccMap[r.hospital_name].prescAmt += r.prescription_amount ?? 0;
    hospAccMap[r.hospital_name].settAmt  += r.settlement_amount   ?? 0;
  }
  const top10Customers = Object.entries(hospAccMap)
    .sort(([, a], [, b]) => b.prescAmt - a.prescAmt)
    .slice(0, 10)
    .map(([name, v]) => ({ name, ...v }));

  // ── [섹션 2] 상위 10 처방처 ──────────────────────────────────────────────
  type PrescriberAcc = { category: string; prescAmt: number; months: Record<string, number> };
  const prescriberMap: Record<string, PrescriberAcc> = {};
  for (const r of normSett.filter(r => recentSet.has(r.prescription_month))) {
    if (!r.hospital_name) continue;
    if (!prescriberMap[r.hospital_name]) {
      prescriberMap[r.hospital_name] = {
        category: isClinic(r.hospital_category, r.hospital_type) ? '의원' : '병원',
        prescAmt: 0, months: {},
      };
    }
    const amt = r.prescription_amount ?? 0;
    prescriberMap[r.hospital_name].prescAmt += amt;
    prescriberMap[r.hospital_name].months[r.prescription_month] =
      (prescriberMap[r.hospital_name].months[r.prescription_month] ?? 0) + amt;
  }
  const top10Prescribers = Object.entries(prescriberMap)
    .sort(([, a], [, b]) => b.prescAmt - a.prescAmt)
    .slice(0, 10)
    .map(([name, v]) => ({
      name,
      category:     v.category,
      totalPrescAmt: v.prescAmt,
      months: recentMonths.map(m => ({ month: m, prescAmt: v.months[m] ?? 0 })),
    }));

  // ── [섹션 8] 품목현황: 상위/하위 10 품목 추이 ────────────────────────────
  // commission_settlements의 recentMonths 데이터 활용
  type ProdStat = { prescAmt: number; months: Record<string, number> };
  const prodStatMap: Record<string, ProdStat> = {};
  const latestMonth = recentMonths[recentMonths.length - 1] ?? '';

  for (const r of normSett.filter(r => recentSet.has(r.prescription_month))) {
    if (!r.product_name) continue;
    if (!prodStatMap[r.product_name]) prodStatMap[r.product_name] = { prescAmt: 0, months: {} };
    const amt = r.prescription_amount ?? 0;
    prodStatMap[r.product_name].prescAmt += amt;
    prodStatMap[r.product_name].months[r.prescription_month] =
      (prodStatMap[r.product_name].months[r.prescription_month] ?? 0) + amt;
  }

  // 최신월 기준 정렬 → 상위/하위 구분
  const allProdsSorted = Object.entries(prodStatMap)
    .map(([name, v]) => {
      const latestAmt  = v.months[latestMonth] ?? 0;
      const prevMonth  = recentMonths[recentMonths.length - 2] ?? '';
      const prevAmt    = v.months[prevMonth] ?? 0;
      return {
        name,
        totalPrescAmt: v.prescAmt,
        latestAmt,
        delta: latestAmt - prevAmt,
        months: recentMonths.map(m => ({ month: m, prescAmt: v.months[m] ?? 0 })),
      };
    })
    // 최신월 데이터가 있는 품목만 포함 (전기 실적 없는 품목 제외)
    .filter(p => p.totalPrescAmt > 0)
    .sort((a, b) => b.latestAmt - a.latestAmt);

  const top10Products    = allProdsSorted.slice(0, 10);
  const bottom10Products = allProdsSorted.slice(-10).reverse(); // 하위에서 낮은 것부터

  // ── [섹션 1] 처방실적현황: 수수료정산 기반 월별 의원/병원 집계 ───────────────
  const settPrescMonthly = recentMonths.map(month => {
    const rows    = normSett.filter(r => r.prescription_month === month);
    const clRows  = rows.filter(r =>  isClinic(r.hospital_category, r.hospital_type));
    const hsRows  = rows.filter(r => !isClinic(r.hospital_category, r.hospital_type));
    const allH    = new Set(rows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const clH     = new Set(clRows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const hsH     = new Set(hsRows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const allP    = new Set(rows.filter(r => r.product_name).map(r => r.product_name!));
    const clP     = new Set(clRows.filter(r => r.product_name).map(r => r.product_name!));
    const hsP     = new Set(hsRows.filter(r => r.product_name).map(r => r.product_name!));
    return {
      month,
      hospCount:            allH.size,
      clinicCount:          clH.size,
      hospitalCount:        hsH.size,
      productCount:         allP.size,
      clinicProductCount:   clP.size,
      hospitalProductCount: hsP.size,
      totalPrescAmt:        rows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0),
      clinicPrescAmt:       clRows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0),
      hospitalPrescAmt:     hsRows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0),
    };
  });

  // ── [섹션 3] 수수료정산현황: 월별 의원/병원/전체 추이 ────────────────────
  const settlementTrend = recentMonths.map(month => {
    const rows   = normSett.filter(r => r.prescription_month === month);
    const clRows = rows.filter(r =>  isClinic(r.hospital_category, r.hospital_type));
    const hsRows = rows.filter(r => !isClinic(r.hospital_category, r.hospital_type));

    function aggTrend(rs: SRow[]) {
      if (rs.length === 0) return null;
      const p = rs.reduce((s, r) => s + (r.prescription_amount ?? 0), 0);
      const se = rs.reduce((s, r) => s + (r.settlement_amount  ?? 0), 0);
      return { prescAmt: p, settAmt: se, rate: p > 0 ? Math.round(se / p * 1000) / 10 : 0 };
    }

    const totalP = rows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0);
    const totalS = rows.reduce((s, r) => s + (r.settlement_amount   ?? 0), 0);
    return {
      month,
      clinic:   aggTrend(clRows),
      hospital: aggTrend(hsRows),
      total:    { prescAmt: totalP, settAmt: totalS, rate: totalP > 0 ? Math.round(totalS / totalP * 1000) / 10 : 0 },
    };
  });

  // ── D. 거래처현황 (customer_status 업로드 기준) ───────────────────────────
  const custMonthMap: Record<string, number> = {};
  for (const r of (custRows ?? [])) {
    const month = (r.created_at as string).slice(0, 7);
    custMonthMap[month] = (custMonthMap[month] ?? 0) + 1;
  }
  const customerMonthly = Object.entries(custMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-3)
    .map(([month, count]) => ({ month, count }));

  // ── E. 방문활동 집계 ──────────────────────────────────────────────────────
  const profMap: Record<string, string> = Object.fromEntries(
    (profileRows ?? []).map(p => [p.id as string, ((p.full_name || p.email) as string)]),
  );

  const visitUserMap: Record<string, Record<string, number>> = {};
  for (const r of (visitRows ?? [])) {
    const uid   = r.user_id as string;
    const month = (r.visited_at as string).slice(0, 7);
    if (!visitUserMap[uid]) visitUserMap[uid] = {};
    visitUserMap[uid][month] = (visitUserMap[uid][month] ?? 0) + 1;
  }

  const visitMonths = [...new Set(
    Object.values(visitUserMap).flatMap(m => Object.keys(m)),
  )].sort().slice(-3);

  const visitSummary = Object.entries(visitUserMap)
    .map(([uid, mMap]) => ({
      name:   profMap[uid] ?? uid,
      total:  Object.values(mMap).reduce((s, n) => s + n, 0),
      months: visitMonths.map(m => ({ month: m, count: mMap[m] ?? 0 })),
    }))
    .sort((a, b) => b.total - a.total);

  // 방문 상세: 담당자·업체·CSO담당자명·협의내용·방문일자 (당월 테이블용)
  const visitDetails = (visitRows ?? []).map(r => ({
    month:        (r.visited_at as string).slice(0, 7),
    visitedAt:    (r.visited_at as string).slice(0, 10),
    personName:   profMap[r.user_id as string] ?? (r.user_id as string),
    customerName: (r.customer_name as string) ?? '',
    contactName:  r.contact_name as string | null,
    content:      (r.content as string) ?? '',
  })).sort((a, b) =>
    a.personName.localeCompare(b.personName) || a.visitedAt.localeCompare(b.visitedAt),
  );

  // ── G. 처방실적(EDI/실적마감) 집계 ──────────────────────────────────────────
  type EdiRow = {
    prescription_month: string;
    hospital_name: string | null;
    product_name: string | null;
    prescription_amount: number | null;
    hospital_type: string | null;
  };

  const normEdi = (ediRows as EdiRow[] ?? []).map(r => ({
    ...r,
    prescription_month: toYYYYMM(r.prescription_month ?? ''),
  })).filter(r => /^\d{4}-\d{2}$/.test(r.prescription_month));

  const ediAllMonths = [...new Set(normEdi.map(r => r.prescription_month))].sort();
  const ediMonths    = ediAllMonths.slice(-3);
  const ediMonthSet  = new Set(ediMonths);

  const ediMonthly = ediMonths.map(month => {
    const rows    = normEdi.filter(r => r.prescription_month === month);
    const clRows  = rows.filter(r =>  isClinic(null, r.hospital_type));
    const hsRows  = rows.filter(r => !isClinic(null, r.hospital_type));
    const allH    = new Set(rows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const clH     = new Set(clRows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const hsH     = new Set(hsRows.filter(r => r.hospital_name).map(r => r.hospital_name!));
    const allP    = new Set(rows.filter(r => r.product_name).map(r => r.product_name!));
    const clP     = new Set(clRows.filter(r => r.product_name).map(r => r.product_name!));
    const hsP     = new Set(hsRows.filter(r => r.product_name).map(r => r.product_name!));
    return {
      month,
      hospCount:            allH.size,
      clinicCount:          clH.size,
      hospitalCount:        hsH.size,
      productCount:         allP.size,
      clinicProductCount:   clP.size,
      hospitalProductCount: hsP.size,
      totalPrescAmt:        rows.reduce((s, r)   => s + (r.prescription_amount ?? 0), 0),
      clinicPrescAmt:       clRows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0),
      hospitalPrescAmt:     hsRows.reduce((s, r) => s + (r.prescription_amount ?? 0), 0),
    };
  });

  // 상위 5 품목
  type ProdAcc = { prescAmt: number; months: Record<string, number> };
  const prodMap: Record<string, ProdAcc> = {};
  for (const r of normEdi.filter(r => ediMonthSet.has(r.prescription_month))) {
    if (!r.product_name) continue;
    if (!prodMap[r.product_name]) prodMap[r.product_name] = { prescAmt: 0, months: {} };
    const amt = r.prescription_amount ?? 0;
    prodMap[r.product_name].prescAmt += amt;
    prodMap[r.product_name].months[r.prescription_month] =
      (prodMap[r.product_name].months[r.prescription_month] ?? 0) + amt;
  }
  const top5Products = Object.entries(prodMap)
    .sort(([, a], [, b]) => b.prescAmt - a.prescAmt)
    .slice(0, 5)
    .map(([name, v]) => ({
      name,
      totalPrescAmt: v.prescAmt,
      months: ediMonths.map(m => ({ month: m, prescAmt: v.months[m] ?? 0 })),
    }));

  // ── H. 발매예정 ───────────────────────────────────────────────────────────
  const upcomingProducts = (upcomingRows ?? []).map(p => ({
    id:             p.id             as string,
    title:          p.title          as string,
    manufacturer:   p.manufacturer   as string | null,
    launchDate:     p.launch_date    as string | null,
    status:         p.status         as string | null,
    indication:     p.indication     as string | null,
    insurancePrice: p.insurance_price as string | null,
    ingredient:     p.memo           as string | null,
  }));

  // ── I. 경쟁사 동향 (경쟁사 관련 문서) ────────────────────────────────────
  const csoDocs = (docRows ?? [])
    .filter(d => isCompCategory(d.category as string | null))
    .slice(0, 30)
    .map(d => ({
      id:        d.id        as string,
      filename:  d.filename  as string,
      category:  (d.category ?? '기타') as string,
      fileType:  d.file_type as string,
      createdAt: d.created_at as string,
      summary:   (d.summary ?? null) as string | null,
    }));

  // ── J. DC현황 ─────────────────────────────────────────────────────────────
  const DC_STAGES = ['준비중', '접수', '코드인', '탈락'] as const;
  const dcItems = (dcRows ?? []).map(r => ({
    id:           r.id           as string,
    category:     (r.category ?? '') as string,
    productName:  (r.product_name  ?? '') as string,
    hospitalName: (r.hospital_name ?? '') as string,
    progress:     (r.progress ?? null)    as string | null,
    updatedAt:    (r.updated_at ?? '')    as string,
  }));
  const dcStageCounts: Record<string, number> = Object.fromEntries(
    DC_STAGES.map(s => [s, dcItems.filter(d => d.category === s).length]),
  );

  // ── F. 주요일정 ───────────────────────────────────────────────────────────
  const schedules = (scheduleRows ?? []).map(s => ({
    title:     s.title    as string,
    startDate: s.start_date as string,
    endDate:   s.end_date   as string | null,
    category:  s.category   as string | null,
    assignee:  s.assignee   as string | null,
  }));

  // ── DashboardData 조립 ────────────────────────────────────────────────────
  const dashData: DashboardData = {
    reportDate: now.toISOString().slice(0, 10),
    recentMonths,
    // 섹션2: 거래처현황
    csoStats,
    totalCsoCount,
    csoAllTotals,
    settlementByCategory,
    top10Customers,
    customerMonthly,
    // 섹션3: 처방처현황
    prescriptionMonthly,
    top10Prescribers,
    settlementTrend,
    schedules,
    visitSummary,
    visitMonths,
    visitDetails,
    // 처방실적현황 (수수료정산 기반)
    settPrescMonthly,
    // 처방실적(EDI)
    ediMonthly,
    top5Products,
    ediMonths,
    upcomingProducts,
    csoDocs,
    stockItems,
    stockFileName,
    top10Products,
    bottom10Products,
    dcItems,
    dcStageCounts,
  };

  return (
    <>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          판매대행사업
        </p>
        {companyName && (
          <p style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            <span style={{
              fontSize: '0.75rem', padding: '3px 12px', borderRadius: '100px',
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#a5b4fc',
            }}>
              {companyName}
            </span>
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {isAllianceUser && (
          <AllianceCompanyBar
            companies={allianceCompanies}
            activeCompanyId={companyId}
          />
        )}
        <DashboardClient data={dashData} />
      </div>
    </>
  );
}

