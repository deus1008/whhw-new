import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import LogoutButton from '@/components/LogoutButton';
import HomeButton from '@/components/HomeButton';
import DashboardClient from '@/components/DashboardClient';
import type { DashboardData } from '@/components/DashboardClient';
import { parseInventoryBuffer } from '@/lib/inventory/parse';
import type { StockAlertItem } from '@/lib/inventory/parse';
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
  if (isAllianceUser || isAdmin) {
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

  // 최근 3개월치 데이터를 안정적으로 포함하려면 6개월 윈도우가 필요
  const since4m = new Date(now);
  since4m.setMonth(since4m.getMonth() - 6);
  const since4mStr = `${since4m.getFullYear()}-${String(since4m.getMonth() + 1).padStart(2, '0')}`;

  const since3m = new Date(now);
  since3m.setMonth(since3m.getMonth() - 3);
  const since3mStr = since3m.toISOString().slice(0, 10);

  // 방문활동: 오늘 기준 2주 전
  const since2w = new Date(now);
  since2w.setDate(since2w.getDate() - 14);
  const since2wStr = since2w.toISOString().slice(0, 10);

  const next2m = new Date(now);
  next2m.setMonth(next2m.getMonth() + 2);
  const next2mStr = next2m.toISOString().slice(0, 10);

  // ── A. commission_settlements → RPC 집계 (단일 DB 집계 쿼리) ────────────
  type MonthTypeRow  = { prescription_month: string; is_clinic: boolean; hosp_cnt: number; prod_cnt: number; presc_amt: number; sett_amt: number };
  type MonthTotalRow = { prescription_month: string; hosp_cnt: number; prod_cnt: number; presc_amt: number; sett_amt: number };
  type CsoMonthRow   = { cso_name: string; prescription_month: string; hosp_cnt: number; prod_cnt: number; presc_amt: number; sett_amt: number };
  type CsoTotalRow   = { cso_name: string; hosp_cnt: number; presc_amt: number; sett_amt: number };
  type HospMonthRow  = { hospital_name: string; category: string; prescription_month: string; presc_amt: number; sett_amt: number };
  type ProdMonthRow  = { product_name: string; prescription_month: string; presc_amt: number };
  type GrandTotals   = { hosp_cnt: number; presc_amt: number; sett_amt: number };

  // ── Phase 1: 최신 EDI 처방월 확인 → 전년동월·직전월·최신월 결정 ─────────────
  // created_at 필터 제거 — 업로드 시점과 무관하게 전체 중 가장 최신 처방월을 찾음
  const { data: latestEdiRows } = await (() => {
    let q = svc.from('trend_prescriptions')
      .select('prescription_month')
      .not('prescription_month', 'is', null)
      .order('prescription_month', { ascending: false })
      .limit(1);
    if (companyId) q = q.eq('company_id', companyId);
    return q;
  })();
  const latestEdiRaw = (latestEdiRows as { prescription_month: string }[] | null)?.[0]?.prescription_month ?? null;
  const latestEdiNorm = latestEdiRaw ? toYYYYMM(latestEdiRaw) : null;
  const ediTargetNorms: string[] = [];
  if (latestEdiNorm && /^\d{4}-\d{2}$/.test(latestEdiNorm)) {
    const [yr, mo] = latestEdiNorm.split('-').map(Number);
    const prevNorm = mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, '0')}`;
    const slyNorm  = `${yr - 1}-${String(mo).padStart(2, '0')}`;
    ediTargetNorms.push(slyNorm, prevNorm, latestEdiNorm);  // 전년동월, 직전월, 최신월
  }
  // DB 저장 포맷이 다양하므로 모든 변형 포함 (YYYY-MM, YYYYMM, YYYY.MM)
  const ediTargetVariants = ediTargetNorms.flatMap(n => [n, n.replace('-', ''), n.replace('-', '.')]);

  // ── A + B. 모든 쿼리를 동시에 시작 ────────────────────────────────────────
  const settRpcPromise = companyId
    ? svc.rpc('get_dashboard_settlements', { p_company_id: companyId, p_since_month: since4mStr })
    : Promise.resolve({ data: null, error: null });

  // DB 집계 RPC — raw 행 전송 없이 월별·품목별·CSO별 집계 결과만 수신
  const ediRpcPromise = companyId && ediTargetNorms.length > 0
    ? svc.rpc('get_edi_summary', {
        p_company_id: companyId,
        p_months: ediTargetNorms.map(n => n.replace('-', '')),
      })
    : Promise.resolve({ data: null, error: null });
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
    { data: settRpcRaw, error: settErr },
    { data: custRows },
    { data: visitRows },
    { data: profileRows },
    { data: scheduleRows },
    { data: ediRpcResult },
    { data: upcomingRows },
    { data: docRows },
    { data: dcRows },
    { data: invDoc },
  ] = await Promise.all([
    settRpcPromise,
    custQ,
    svc.from('visit_records')
      .select('user_id, visited_at, customer_name, contact_name, content')
      .gte('visited_at', since2wStr)
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
    ediRpcPromise,
    upcomingQ,
    // 문서: 최근 3개월 (위탁사 필터 적용)
    docQ,
    // DC현황: 전체 목록 (sort_order 순, 위탁사 필터 적용)
    dcQ,
    // 품절예측: 최신 파일 메타 (위탁사 필터 적용)
    invDocQ,
  ]);

  // ── A-2. RPC 결과 파싱 ──────────────────────────────────────────────────────
  if (settErr) console.error('[dashboard:settlements rpc]', settErr);
  const sr = (settRpcRaw as Record<string, unknown>) ?? {};
  const byMonthType:  MonthTypeRow[]  = (sr.by_month_type  as MonthTypeRow[]  | null) ?? [];
  const byMonthTotal: MonthTotalRow[] = (sr.by_month_total as MonthTotalRow[] | null) ?? [];
  const byCsoMonth:   CsoMonthRow[]   = (sr.by_cso_month  as CsoMonthRow[]   | null) ?? [];
  const byCsoTotal:   CsoTotalRow[]   = (sr.by_cso_total  as CsoTotalRow[]   | null) ?? [];
  const byHospMonth:  HospMonthRow[]  = (sr.by_hosp_month as HospMonthRow[]  | null) ?? [];
  const byProdMonth:  ProdMonthRow[]  = (sr.by_prod_month as ProdMonthRow[]  | null) ?? [];
  const grandTotals:  GrandTotals     = (sr.grand_totals  as GrandTotals     | null) ?? { hosp_cnt: 0, presc_amt: 0, sett_amt: 0 };
  const recentMonths: string[]        = ((sr.recent_months as string[] | null) ?? []).slice().sort();
  const recentSet = new Set(recentMonths);

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


  // ── C. Settlement 데이터 가공 (RPC 집계 기반) ────────────────────────────

  // 인덱스: month × is_clinic (key: "true"/"false")
  const monthTypeIdx: Record<string, Record<string, MonthTypeRow>> = {};
  for (const r of byMonthType) {
    if (!monthTypeIdx[r.prescription_month]) monthTypeIdx[r.prescription_month] = {};
    monthTypeIdx[r.prescription_month][String(r.is_clinic)] = r;
  }
  const monthTotalIdx = Object.fromEntries(byMonthTotal.map(r => [r.prescription_month, r]));

  function aggFromRpc(h: number, p: number, s: number) {
    if (h === 0 && p === 0) return null;
    return {
      hospCount:     h,
      totalPrescAmt: p,
      totalSettAmt:  s,
      avgPrescAmt:   h > 0 ? Math.round(p / h) : 0,
      avgSettAmt:    h > 0 ? Math.round(s / h) : 0,
    };
  }

  // ── [섹션 2] 거래처현황: CSO별 집계 (EDI 기반, ediMonths 정의 후 계산) ───────

  // ── [섹션 3] 처방처현황: 병원/의원 월별 분리 집계 ────────────────────────
  const settlementByCategory = recentMonths.map(month => {
    const cl = monthTypeIdx[month]?.['true'];
    const hs = monthTypeIdx[month]?.['false'];
    return {
      month,
      clinic:   aggFromRpc(cl?.hosp_cnt ?? 0, cl?.presc_amt ?? 0, cl?.sett_amt ?? 0),
      hospital: aggFromRpc(hs?.hosp_cnt ?? 0, hs?.presc_amt ?? 0, hs?.sett_amt ?? 0),
    };
  });

  const prescriptionMonthly = recentMonths.map(month => {
    const t  = monthTotalIdx[month];
    const cl = monthTypeIdx[month]?.['true'];
    const hs = monthTypeIdx[month]?.['false'];
    return {
      month,
      hospCount:        t?.hosp_cnt   ?? 0,
      clinicCount:      cl?.hosp_cnt  ?? 0,
      hospitalCount:    hs?.hosp_cnt  ?? 0,
      productCount:     t?.prod_cnt   ?? 0,
      totalPrescAmt:    t?.presc_amt  ?? 0,
      clinicPrescAmt:   cl?.presc_amt ?? 0,
      hospitalPrescAmt: hs?.presc_amt ?? 0,
    };
  });

  // ── [섹션 2] 상위 10 거래처 / 처방처 ─────────────────────────────────────
  const hospTotals: Record<string, { category: string; prescAmt: number; settAmt: number; months: Record<string, number> }> = {};
  for (const r of byHospMonth) {
    if (!hospTotals[r.hospital_name]) {
      hospTotals[r.hospital_name] = { category: r.category, prescAmt: 0, settAmt: 0, months: {} };
    }
    hospTotals[r.hospital_name].prescAmt += r.presc_amt;
    hospTotals[r.hospital_name].settAmt  += r.sett_amt;
    hospTotals[r.hospital_name].months[r.prescription_month] = r.presc_amt;
  }
  const sortedHosps = Object.entries(hospTotals).sort(([, a], [, b]) => b.prescAmt - a.prescAmt);
  const top10Customers = sortedHosps.slice(0, 10).map(([name, v]) => ({
    name, category: v.category, prescAmt: v.prescAmt, settAmt: v.settAmt,
  }));
  const top10Prescribers = sortedHosps.slice(0, 10).map(([name, v]) => ({
    name,
    category:      v.category,
    totalPrescAmt: v.prescAmt,
    months: recentMonths.map(m => ({ month: m, prescAmt: v.months[m] ?? 0 })),
  }));

  // ── [섹션 8] 품목현황: 상위/하위 10 품목 추이 ────────────────────────────
  // top10Products / bottom10Products는 EDI 기반으로 G 섹션에서 계산

  // ── [섹션 1] 처방실적현황: 수수료정산 기반 월별 의원/병원 집계 ───────────────
  const settPrescMonthly = recentMonths.map(month => {
    const t  = monthTotalIdx[month];
    const cl = monthTypeIdx[month]?.['true'];
    const hs = monthTypeIdx[month]?.['false'];
    return {
      month,
      hospCount:            t?.hosp_cnt   ?? 0,
      clinicCount:          cl?.hosp_cnt  ?? 0,
      hospitalCount:        hs?.hosp_cnt  ?? 0,
      productCount:         t?.prod_cnt   ?? 0,
      clinicProductCount:   cl?.prod_cnt  ?? 0,
      hospitalProductCount: hs?.prod_cnt  ?? 0,
      totalPrescAmt:        t?.presc_amt  ?? 0,
      clinicPrescAmt:       cl?.presc_amt ?? 0,
      hospitalPrescAmt:     hs?.presc_amt ?? 0,
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

  // ── G. 처방실적(EDI) 집계 — DB 집계 RPC 기반 ──────────────────────────────
  type EdiByMonthRow    = { prescription_month: string; hosp_cnt: number; clinic_cnt: number; hosp_type_cnt: number; prod_cnt: number; clinic_prod_cnt: number; hosp_prod_cnt: number; presc_amt: number; clinic_amt: number; hosp_amt: number };
  type EdiByProductRow  = { product_name: string; prescription_month: string; presc_amt: number };
  type EdiByCsoMonthRow = { cso_name: string; prescription_month: string; hosp_cnt: number; prod_cnt: number; presc_amt: number };
  type EdiByCsoTotalRow = { cso_name: string; total_hosp_cnt: number; total_presc_amt: number };
  type EdiTotals        = { total_hosp_cnt: number; total_presc_amt: number };

  const ediRpc          = (ediRpcResult as Record<string, unknown> | null) ?? {};
  const ediByMonth:    EdiByMonthRow[]    = (ediRpc.by_month     as EdiByMonthRow[]    | null) ?? [];
  const ediByProduct:  EdiByProductRow[]  = (ediRpc.by_product   as EdiByProductRow[]  | null) ?? [];
  const ediByCsoMonth: EdiByCsoMonthRow[] = (ediRpc.by_cso_month as EdiByCsoMonthRow[] | null) ?? [];
  const ediByCsoTotal: EdiByCsoTotalRow[] = (ediRpc.by_cso_total as EdiByCsoTotalRow[] | null) ?? [];
  const ediRpcTotals:  EdiTotals          = (ediRpc.totals       as EdiTotals          | null) ?? { total_hosp_cnt: 0, total_presc_amt: 0 };

  const ediAllMonths = ediByMonth.map(r => toYYYYMM(r.prescription_month)).sort();
  // 전년동월·직전월·최신월 순서를 유지하되, 실제 데이터가 있는 월만 포함
  const ediMonthSet0 = new Set(ediAllMonths);
  const ediMonths    = ediTargetNorms.length > 0
    ? ediTargetNorms.filter(m => ediMonthSet0.has(m))
    : ediAllMonths.slice(-3);
  const ediMonthSet  = new Set(ediMonths);

  // 월별 집계
  const ediMonthly = ediMonths.map(month => {
    const r = ediByMonth.find(r => toYYYYMM(r.prescription_month) === month);
    return {
      month,
      hospCount:            r?.hosp_cnt       ?? 0,
      clinicCount:          r?.clinic_cnt      ?? 0,
      hospitalCount:        r?.hosp_type_cnt   ?? 0,
      productCount:         r?.prod_cnt        ?? 0,
      clinicProductCount:   r?.clinic_prod_cnt ?? 0,
      hospitalProductCount: r?.hosp_prod_cnt   ?? 0,
      totalPrescAmt:        r?.presc_amt       ? Number(r.presc_amt)  : 0,
      clinicPrescAmt:       r?.clinic_amt      ? Number(r.clinic_amt) : 0,
      hospitalPrescAmt:     r?.hosp_amt        ? Number(r.hosp_amt)   : 0,
    };
  });

  // 품목별 집계
  type ProdAcc = { prescAmt: number; months: Record<string, number> };
  const prodMap: Record<string, ProdAcc> = {};
  for (const r of ediByProduct) {
    const monthNorm = toYYYYMM(r.prescription_month);
    if (!ediMonthSet.has(monthNorm)) continue;
    if (!prodMap[r.product_name]) prodMap[r.product_name] = { prescAmt: 0, months: {} };
    const amt = Number(r.presc_amt);
    prodMap[r.product_name].prescAmt += amt;
    prodMap[r.product_name].months[monthNorm] = (prodMap[r.product_name].months[monthNorm] ?? 0) + amt;
  }
  const top5Products = Object.entries(prodMap)
    .sort(([, a], [, b]) => b.prescAmt - a.prescAmt)
    .slice(0, 5)
    .map(([name, v]) => ({
      name,
      totalPrescAmt: v.prescAmt,
      months: ediMonths.map(m => ({ month: m, prescAmt: v.months[m] ?? 0 })),
    }));

  // 품목현황 상위/하위 10 (EDI 기반)
  const ediLatest      = ediMonths[ediMonths.length - 1] ?? '';
  const ediPrev        = ediMonths[ediMonths.length - 2] ?? '';
  const ediProdsSorted = Object.entries(prodMap)
    .map(([name, v]) => ({
      name,
      totalPrescAmt: v.prescAmt,
      latestAmt:     v.months[ediLatest] ?? 0,
      delta:         (v.months[ediLatest] ?? 0) - (v.months[ediPrev] ?? 0),
      months:        ediMonths.map(m => ({ month: m, prescAmt: v.months[m] ?? 0 })),
    }))
    .filter(p => p.totalPrescAmt > 0)
    .sort((a, b) => b.latestAmt - a.latestAmt);
  const top10Products    = ediProdsSorted.slice(0, 10);
  const bottom10Products = ediProdsSorted.slice(-10).reverse();

  // ── [섹션 2] 거래처현황: CSO별 집계 (EDI 기반) ────────────────────────────
  const csoTotalLookup = Object.fromEntries(ediByCsoTotal.map(r => [r.cso_name, r]));
  const csoAccMap: Record<string, { name: string; prescAmt: number; settAmt: number; hospCount: number; months: { month: string; hospCount: number; prodCount: number; prescAmt: number }[] }> = {};
  for (const r of ediByCsoMonth) {
    const monthNorm = toYYYYMM(r.prescription_month);
    if (!ediMonthSet.has(monthNorm)) continue;
    const cn = r.cso_name;
    if (!csoAccMap[cn]) {
      csoAccMap[cn] = { name: cn, prescAmt: 0, settAmt: 0, hospCount: 0, months: ediMonths.map(m => ({ month: m, hospCount: 0, prodCount: 0, prescAmt: 0 })) };
    }
    const mi = csoAccMap[cn].months.findIndex(m => m.month === monthNorm);
    if (mi >= 0) {
      csoAccMap[cn].months[mi].prescAmt  = Number(r.presc_amt);
      csoAccMap[cn].months[mi].hospCount = r.hosp_cnt;
      csoAccMap[cn].months[mi].prodCount = r.prod_cnt;
    }
    csoAccMap[cn].prescAmt += Number(r.presc_amt);
  }
  for (const [cn, acc] of Object.entries(csoAccMap)) {
    acc.hospCount = csoTotalLookup[cn]?.total_hosp_cnt ?? 0;
  }
  const allCsoStats   = Object.values(csoAccMap).sort((a, b) => b.prescAmt - a.prescAmt);
  const totalCsoCount = allCsoStats.length;
  const csoStats      = allCsoStats.slice(0, 20);
  const csoAllTotals  = {
    hospCount: ediRpcTotals.total_hosp_cnt,
    prescAmt:  Number(ediRpcTotals.total_presc_amt),
    settAmt:   0,
  };
  const csoMonthlyTotals = ediMonths.map(month => {
    const r = ediByMonth.find(r => toYYYYMM(r.prescription_month) === month);
    return { month, settAmt: 0, prescAmt: r?.presc_amt ? Number(r.presc_amt) : 0, hospCount: r?.hosp_cnt ?? 0, prodCount: r?.prod_cnt ?? 0 };
  });

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
    csoMonthlyTotals,
    settlementByCategory,
    top10Customers,
    customerMonthly,
    // 섹션3: 처방처현황
    prescriptionMonthly,
    top10Prescribers,
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
        className="relative z-10 w-full px-4 dash-page-wrapper"
        style={{ maxWidth: '860px', paddingTop: '2rem', paddingBottom: '2rem', alignSelf: 'flex-start' }}
      >
        <p className="domain" style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: 'clamp(1.4rem, 4vw, 2rem)' }}>
          판매대행사업
        </p>
        {companyName && (
          <p className="no-print" style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            <span style={{
              fontSize: '0.75rem', padding: '3px 12px', borderRadius: '100px',
              background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#a5b4fc',
            }}>
              {companyName}
            </span>
          </p>
        )}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          <HomeButton />
          <LogoutButton compact />
        </div>

        {(isAllianceUser || isAdmin) && (
          <div className="no-print">
            <AllianceCompanyBar
              companies={allianceCompanies}
              activeCompanyId={companyId}
            />
          </div>
        )}
        <DashboardClient data={dashData} />
      </div>
    </>
  );
}

