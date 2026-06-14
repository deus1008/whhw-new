'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import type { ReactElement } from 'react';
import type { StockAlertItem } from '@/lib/inventory/parse';

/* ═══════════════════════════════════════════════════════════════════
   DashboardClient — 판매대행사업 월간 업무현황 보고서
   - 4개 섹션: 거래처현황 / 처방처현황 / 수수료정산현황 / 현장활동
   - A4 인쇄 지원 (@media print)
═══════════════════════════════════════════════════════════════════ */

/* ── 타입 ─────────────────────────────────────────────────────────── */
export type CategoryStat = {
  hospCount:     number;
  totalPrescAmt: number;
  totalSettAmt:  number;
  avgPrescAmt:   number;
  avgSettAmt:    number;
} | null;

export type SettlementByCat = {
  month:    string;
  clinic:   CategoryStat;
  hospital: CategoryStat;
};

export type TopCustomer = {
  name:      string;
  category:  string;
  prescAmt:  number;
  settAmt:   number;
};

export type CsoStat = {
  name:      string;
  hospCount: number;
  prescAmt:  number;
  settAmt:   number;
};

export type PrescMonthStat = {
  month:            string;
  hospCount:        number;
  clinicCount:      number;
  hospitalCount:    number;
  productCount:     number;
  totalPrescAmt:    number;
  clinicPrescAmt:   number;
  hospitalPrescAmt: number;
};

export type TopPrescriber = {
  name:          string;
  category:      string;
  totalPrescAmt: number;
  months:        { month: string; prescAmt: number }[];
};

export type TrendEntry = { prescAmt: number; settAmt: number; rate: number } | null;

export type SettlementTrend = {
  month:    string;
  clinic:   TrendEntry;
  hospital: TrendEntry;
  total:    { prescAmt: number; settAmt: number; rate: number };
};

export type CustomerMonthStat = { month: string; count: number };

export type VisitPersonStat = {
  name:   string;
  total:  number;
  months: { month: string; count: number }[];
};

export type VisitDetailRow = {
  month:        string;
  visitedAt:    string;   // YYYY-MM-DD
  personName:   string;
  customerName: string;
  contactName:  string | null;
  content:      string;
};

export type ScheduleItem = {
  title:     string;
  startDate: string;
  endDate:   string | null;
  category:  string | null;
  assignee:  string | null;
};

export type EdiMonthStat = {
  month:                string;
  hospCount:            number;
  clinicCount:          number;
  hospitalCount:        number;
  productCount:         number;
  clinicProductCount:   number;
  hospitalProductCount: number;
  totalPrescAmt:        number;
  clinicPrescAmt:       number;
  hospitalPrescAmt:     number;
};

export type TopProduct = {
  name:          string;
  totalPrescAmt: number;
  months:        { month: string; prescAmt: number }[];
};

export type UpcomingProduct = {
  id:            string;
  title:         string;
  manufacturer:  string | null;
  launchDate:    string | null;
  status:        string | null;
  indication:    string | null;
  insuranceCode:  string | null;
  insurancePrice: string | null;
};

export type CsoDoc = {
  id:        string;
  filename:  string;
  category:  string;
  fileType:  string;
  createdAt: string;
  summary:   string | null;
};

export type ProductRankItem = {
  name:          string;
  totalPrescAmt: number;
  latestAmt:     number;
  delta:         number;   // 전월 대비 (최신월 - 전전월)
  months:        { month: string; prescAmt: number }[];
};

export type DcStatusItem = {
  id:           string;
  category:     string;   // 준비중 | 착수 | 상정 | 통과
  productName:  string;
  hospitalName: string;
  progress:     string | null;
  updatedAt:    string;
};

export type DashboardData = {
  reportDate:           string;
  recentMonths:         string[];          // 최근 3 처방월
  // 섹션2: 거래처현황 (CSO)
  csoStats:             CsoStat[];         // 상위 10개
  totalCsoCount:        number;            // 전체 CSO 수
  settlementByCategory: SettlementByCat[];
  top10Customers:       TopCustomer[];
  customerMonthly:      CustomerMonthStat[];
  // 섹션3: 처방처현황 (병원/의원)
  prescriptionMonthly:  PrescMonthStat[];
  top10Prescribers:     TopPrescriber[];
  // 섹션5: 수수료정산현황
  settlementTrend:      SettlementTrend[];
  // 섹션9: 현장활동
  schedules:            ScheduleItem[];
  visitSummary:         VisitPersonStat[];
  visitMonths:          string[];
  visitDetails:         VisitDetailRow[];
  // 섹션1: 처방실적 현황 (수수료정산 기반)
  settPrescMonthly:     EdiMonthStat[];
  // 섹션1: 처방실적 현황 (EDI/실적마감, 미사용)
  ediMonthly:           EdiMonthStat[];
  top5Products:         TopProduct[];
  ediMonths:            string[];
  // 섹션7: 발매예정
  upcomingProducts:     UpcomingProduct[];
  // 섹션6: 경쟁사 동향
  csoDocs:              CsoDoc[];
  // 섹션6b: 품절현황
  stockItems:           StockAlertItem[];
  stockFileName:        string | null;
  // 섹션4: 품목현황
  top10Products:        ProductRankItem[];
  bottom10Products:     ProductRankItem[];
  // 섹션8: DC현황
  dcItems:              DcStatusItem[];
  dcStageCounts:        Record<string, number>;
};

/* ── 포맷 유틸 ─────────────────────────────────────────────────────── */
function fmtPeriod(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1].slice(2)}년 ${+m[2]}월`;
  return s;
}

function fmtWon(n: number, _compact = false): string {
  return Math.round(n / 1000).toLocaleString();
}

function fmtRate(r: number): string { return `${r.toFixed(1)}%`; }

function fmtDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1].slice(2)}.${m[2]}.${m[3]}`;
  return s;
}

function DeltaCount({ cur, prev }: { cur: number; prev?: number }) {
  if (prev === undefined) return <span className="muted">-</span>;
  const d = cur - prev;
  if (d === 0) return <span className="muted">±0</span>;
  return <span className={d > 0 ? 'up' : 'dn'}>{d > 0 ? '▲' : '▼'}{Math.abs(d).toLocaleString()}</span>;
}

function DeltaAmt({ cur, prev }: { cur: number; prev?: number }) {
  if (prev === undefined) return <span className="muted">-</span>;
  const d = cur - prev;
  if (d === 0) return <span className="muted">±0</span>;
  return <span className={d > 0 ? 'up' : 'dn'} style={{ fontSize: '0.78rem' }}>{d > 0 ? '▲' : '▼'}{fmtWon(Math.abs(d), true)}</span>;
}

function Empty({ msg }: { msg?: string }) {
  return (
    <p className="empty-msg">
      {msg ?? '파일을 업로드하면 자동으로 집계됩니다.'}
    </p>
  );
}

/* ── 섹션 래퍼 ─────────────────────────────────────────────────────── */
function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="dash-section" id={id}>
      <h2 className="section-title">{title}</h2>
      {children}
    </div>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="sub-title">{children}</h3>;
}

/* ══════════════════════════════════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════════════════════════════════ */
export default function DashboardClient({ data }: { data: DashboardData }) {
  const {
    reportDate, recentMonths,
    csoStats, totalCsoCount,
    settlementByCategory, top10Customers, customerMonthly,
    prescriptionMonthly,
    settlementTrend,
    schedules, visitSummary, visitMonths, visitDetails,
    settPrescMonthly,
    ediMonthly, ediMonths,
    upcomingProducts,
    csoDocs,
    stockItems, stockFileName,
    top10Products, bottom10Products,
    dcItems, dcStageCounts,
  } = data;

  const MEMO_KEY = 'whhw-dashboard-memo';
  const [memo, setMemo]               = useState('');
  const [savedMemo, setSavedMemo]     = useState('');
  const [isEditingMemo, setIsEditing] = useState(false);
  const [justSaved, setJustSaved]     = useState(false);
  const textareaRef                   = useRef<HTMLTextAreaElement>(null);

  // localStorage에서 메모 로드
  useEffect(() => {
    const saved = localStorage.getItem(MEMO_KEY) ?? '';
    setMemo(saved);
    setSavedMemo(saved);
    if (!saved) setIsEditing(true); // 내용 없으면 편집 모드 시작
  }, []);

  const handleSave = () => {
    localStorage.setItem(MEMO_KEY, memo);
    setSavedMemo(memo);
    setIsEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleCancel = () => {
    setMemo(savedMemo);
    setIsEditing(false);
  };

  const today = reportDate;
  const noSett = recentMonths.length === 0;
  const noEdi  = ediMonths.length === 0;

  // 일정: 과거 / 예정 분류
  const todayStr = today;
  const upcomingSchedules = schedules.filter(s => s.startDate >= todayStr).slice(0, 8);
  const recentSchedules   = schedules.filter(s => s.startDate < todayStr).slice(-6).reverse();

  // 당월 기준 방문 상세 (지정 순서 정렬)
  const PERSON_ORDER = ['박동수', '김윤성', '임경봉', '김양희', '이정원', '이훈섭'];
  const thisMonth = today.slice(0, 7);   // "2026-06"
  const thisMonthVisits = (visitDetails ?? [])
    .filter(v => v.month === thisMonth)
    .sort((a, b) => {
      const ai = PERSON_ORDER.indexOf(a.personName);
      const bi = PERSON_ORDER.indexOf(b.personName);
      const ao = ai === -1 ? PERSON_ORDER.length : ai;
      const bo = bi === -1 ? PERSON_ORDER.length : bi;
      return ao !== bo ? ao - bo
        : a.customerName.localeCompare(b.customerName, 'ko')
          || a.visitedAt.localeCompare(b.visitedAt);
    });

  // DC 단계 상수
  const DC_STAGES = ['준비중', '착수', '상정', '통과'] as const;
  const DC_COLORS: Record<string, string> = {
    준비중: '#94a3b8', 착수: '#fbbf24', 상정: '#60a5fa', 통과: '#4ade80',
  };

  return (
    <>
      {/* ── 인쇄 스타일 ────────────────────────────────────────── */}
      <style>{`
        /* ── 공통 ── */
        .dash-section {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 1.1rem 1rem;
          margin-bottom: 1rem;
        }
        .section-title {
          font-size: 0.98rem; font-weight: 700; margin-bottom: 0.9rem;
          background: linear-gradient(135deg,#fff 0%,#a8c4ff 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .sub-title {
          font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.5);
          margin: 0.9rem 0 0.45rem; letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .dash-table { width: 100%; border-collapse: collapse; }
        .dash-table th {
          padding: 0.35rem 0.5rem; font-size: 0.72rem;
          color: rgba(255,255,255,0.45); font-weight: 600;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          white-space: nowrap;
        }
        .dash-table td {
          padding: 0.4rem 0.5rem; font-size: 0.82rem;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          vertical-align: middle;
        }
        .dash-table tr:last-child td { border-bottom: none; }
        .dash-table .right { text-align: right; }
        .dash-table .center { text-align: center; }
        .dash-table .bold { font-weight: 700; }
        .dash-table .muted { color: rgba(255,255,255,0.38); }
        .dash-table .total-row td {
          font-weight: 700; color: #a8c4ff;
          border-top: 1px solid rgba(255,255,255,0.12);
        }
        .up { color: #4ade80; }
        .dn { color: #f87171; }
        .muted { color: rgba(255,255,255,0.38); }
        .empty-msg {
          font-size: 0.8rem; color: rgba(255,255,255,0.35);
          text-align: center; padding: 1rem 0; margin: 0;
        }
        .badge-clinic  { }
        .badge-hosp    { }
        .print-btn {
          display: flex; align-items: center; gap: 0.4rem;
          padding: 0.4rem 0.9rem; border-radius: 8px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.7); font-size: 0.8rem; font-weight: 600;
          cursor: pointer; font-family: inherit; margin-bottom: 0.75rem;
          transition: background 0.15s;
        }
        .print-btn:hover { background: rgba(255,255,255,0.10); }
        .print-header { display: none; }
        .schedule-list { list-style: none; padding: 0; margin: 0; }
        .schedule-item {
          display: flex; gap: 0.5rem; align-items: flex-start;
          padding: 0.35rem 0; border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 0.8rem;
        }
        .schedule-item:last-child { border-bottom: none; }
        .schedule-date { color: rgba(255,255,255,0.45); white-space: nowrap; min-width: 60px; }
        .schedule-title { color: rgba(255,255,255,0.85); flex: 1; }
        .schedule-tag {
          font-size: 0.68rem; padding: 0.05rem 0.35rem; border-radius: 3px;
          background: rgba(168,85,247,0.15); color: #d8b4fe; white-space: nowrap;
        }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
        @media (max-width: 600px) { .two-col { grid-template-columns: 1fr; } }

        /* ── 인쇄 ── */
        @media print {
          @page { size: A4 portrait; margin: 12mm 14mm; }

          body, html {
            background: #fff !important;
            color: #111 !important;
            font-size: 9pt !important;
          }
          .orb, .page-nav, .print-btn, .domain { display: none !important; }
          .print-header {
            display: block !important;
            border-bottom: 2px solid #222;
            padding-bottom: 4mm;
            margin-bottom: 4mm;
          }
          .print-header h1 {
            font-size: 13pt; font-weight: 800; margin: 0 0 1mm;
            color: #111 !important;
          }
          .print-header p { font-size: 8pt; color: #555; margin: 0; }

          .dash-section {
            background: #fff !important;
            border: 1px solid #bbb !important;
            border-radius: 4px !important;
            padding: 3mm 4mm !important;
            margin-bottom: 3mm !important;
            break-inside: avoid;
          }
          .section-title {
            font-size: 9.5pt !important; font-weight: 700 !important;
            -webkit-text-fill-color: #111 !important;
            background: none !important; color: #111 !important;
            margin-bottom: 2mm !important;
          }
          .sub-title {
            font-size: 7.5pt !important; color: #555 !important;
            margin: 1.5mm 0 1mm !important;
          }
          .dash-table th {
            padding: 1mm 2mm !important; font-size: 7pt !important;
            color: #333 !important; background: #f3f3f3 !important;
            border: 1px solid #ccc !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .dash-table td {
            padding: 1mm 2mm !important; font-size: 7.5pt !important;
            border: 1px solid #ddd !important; color: #111 !important;
            vertical-align: middle !important;
          }
          .dash-table tr:last-child td { border-bottom: 1px solid #ddd !important; }
          .dash-table .total-row td {
            font-weight: 700 !important; color: #111 !important;
            background: #f9f9f9 !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .up  { color: #16a34a !important; }
          .dn  { color: #dc2626 !important; }
          .muted { color: #888 !important; }
          .two-col { grid-template-columns: 1fr 1fr !important; gap: 3mm !important; }
          .schedule-item { padding: 0.5mm 0 !important; font-size: 7.5pt !important; }
          .schedule-date { color: #555 !important; min-width: 14mm !important; }
          .schedule-title { color: #111 !important; }
          .schedule-tag { background: #ede9fe !important; color: #4c1d95 !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .empty-msg { color: #888 !important; font-size: 7.5pt !important; }
        }
      `}</style>

      {/* ── 인쇄 전용 헤더 ─────────────────────────────────────── */}
      <div className="print-header">
        <h1>📊 판매대행사업 업무현황 보고</h1>
        <p>
          보고일: {today}
        </p>
      </div>

      {/* ── 인쇄 버튼 + 단위 표기 ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', fontWeight: 600, letterSpacing: '0.03em' }}>
          단위: 천원
        </span>
        <button className="print-btn" onClick={() => window.print()} style={{ marginBottom: 0 }}>
          🖨️ A4 인쇄
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          섹션 1: 처방실적 현황 (수수료정산 파일 기반)
      ══════════════════════════════════════════════════════════ */}
      <Section title="📈 처방실적 현황" id="s1">
        {noSett ? (
          <Empty msg="수수료 정산 파일을 업로드하면 자동 집계됩니다." />
        ) : (
          <>
            <SubTitle>▸ 의원·병원별 처방 집계 ({recentMonths.length > 0 ? `${fmtPeriod(recentMonths[0])} ~ ${fmtPeriod(recentMonths[recentMonths.length - 1])}` : '최근 3개월'})</SubTitle>
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '72px' }} />
                  <col style={{ width: '64px' }} />
                  <col style={{ width: '72px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '80px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="center">월</th>
                    <th className="center">구분</th>
                    <th className="center">처방처수</th>
                    <th className="center">처방품목수</th>
                    <th className="center">처방액 합계</th>
                    <th className="center">처방액 평균</th>
                    <th className="center">전월대비</th>
                  </tr>
                </thead>
                <tbody>
                  {settPrescMonthly.map((r, i) => {
                    const prev = settPrescMonthly[i - 1];
                    return (
                      <Fragment key={r.month}>
                        <tr>
                          <td className="center muted" rowSpan={3} style={{ verticalAlign: 'middle', fontWeight: 600, fontSize: '0.8rem' }}>{fmtPeriod(r.month)}</td>
                          <td className="center">의원</td>
                          <td className="center bold">{r.clinicCount.toLocaleString()}</td>
                          <td className="center">{r.clinicProductCount.toLocaleString()}</td>
                          <td className="center bold">{fmtWon(r.clinicPrescAmt)}</td>
                          <td className="center muted" style={{ fontSize: '0.78rem' }}>
                            {r.clinicCount > 0 ? fmtWon(Math.round(r.clinicPrescAmt / r.clinicCount)) : '-'}
                          </td>
                          <td className="center"><DeltaAmt cur={r.clinicPrescAmt} prev={prev?.clinicPrescAmt} /></td>
                        </tr>
                        <tr>
                          <td className="center">병원</td>
                          <td className="center bold">{r.hospitalCount.toLocaleString()}</td>
                          <td className="center">{r.hospitalProductCount.toLocaleString()}</td>
                          <td className="center bold">{fmtWon(r.hospitalPrescAmt)}</td>
                          <td className="center muted" style={{ fontSize: '0.78rem' }}>
                            {r.hospitalCount > 0 ? fmtWon(Math.round(r.hospitalPrescAmt / r.hospitalCount)) : '-'}
                          </td>
                          <td className="center"><DeltaAmt cur={r.hospitalPrescAmt} prev={prev?.hospitalPrescAmt} /></td>
                        </tr>
                        <tr className="total-row">
                          <td className="center" style={{ letterSpacing: '0.02em' }}>전체</td>
                          <td className="center">{r.hospCount.toLocaleString()}</td>
                          <td className="center">{r.productCount.toLocaleString()}</td>
                          <td className="center">{fmtWon(r.totalPrescAmt)}</td>
                          <td className="center muted" style={{ fontSize: '0.78rem' }}>
                            {r.hospCount > 0 ? fmtWon(Math.round(r.totalPrescAmt / r.hospCount)) : '-'}
                          </td>
                          <td className="center"><DeltaAmt cur={r.totalPrescAmt} prev={prev?.totalPrescAmt} /></td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 2: 거래처현황 (CSO)
      ══════════════════════════════════════════════════════════ */}
      <Section title="🏢 거래처현황" id="s2">
        {noSett ? (
          <Empty msg="수수료정산 파일을 업로드하면 자동 집계됩니다." />
        ) : csoStats.length === 0 ? (
          <Empty msg="CSO 담당자 정보가 있는 파일을 업로드하면 집계됩니다." />
        ) : (
          <>
            <SubTitle>▸ CSO별 집계 · 상위 {csoStats.length}개 / 전체 {totalCsoCount}개 ({recentMonths.length > 0 ? `${fmtPeriod(recentMonths[0])} ~ ${fmtPeriod(recentMonths[recentMonths.length - 1])}` : '최근 3개월'})</SubTitle>
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th className="center">순위</th>
                    <th>CSO명</th>
                    <th className="right">처방처수</th>
                    <th className="right">처방액 합계</th>
                    <th className="right">정산액 합계</th>
                    <th className="right">정산율</th>
                  </tr>
                </thead>
                <tbody>
                  {csoStats.map((r, i) => {
                    const rate = r.prescAmt > 0 ? Math.round(r.settAmt / r.prescAmt * 1000) / 10 : 0;
                    return (
                      <tr key={r.name}>
                        <td className="center muted">{i + 1}</td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {r.name}
                        </td>
                        <td className="right">{r.hospCount.toLocaleString()}</td>
                        <td className="right bold">{fmtWon(r.prescAmt)}</td>
                        <td className="right">{fmtWon(r.settAmt)}</td>
                        <td className="right" style={{ color: '#a8c4ff', fontSize: '0.82rem' }}>{fmtRate(rate)}</td>
                      </tr>
                    );
                  })}
                  {/* 합산 / 평균 행 */}
                  {(() => {
                    const n  = csoStats.length;
                    const th = csoStats.reduce((s, r) => s + r.hospCount, 0);
                    const tp = csoStats.reduce((s, r) => s + r.prescAmt,  0);
                    const ts = csoStats.reduce((s, r) => s + r.settAmt,   0);
                    const overallRate = tp > 0 ? Math.round(ts / tp * 1000) / 10 : 0;
                    return (
                      <>
                        <tr className="total-row">
                          <td className="center" colSpan={2} style={{ fontWeight: 700 }}>합산 (상위 {n}개)</td>
                          <td className="right">{th.toLocaleString()}</td>
                          <td className="right">{fmtWon(tp)}</td>
                          <td className="right">{fmtWon(ts)}</td>
                          <td className="right" style={{ color: '#a8c4ff' }}>{tp > 0 ? fmtRate(overallRate) : '-'}</td>
                        </tr>
                        <tr className="total-row" style={{ color: 'rgba(255,255,255,0.55)' }}>
                          <td className="center" colSpan={2}>CSO당 평균</td>
                          <td className="right">{n > 0 ? Math.round(th / n).toLocaleString() : '-'}</td>
                          <td className="right">{n > 0 ? fmtWon(Math.round(tp / n)) : '-'}</td>
                          <td className="right">{n > 0 ? fmtWon(Math.round(ts / n)) : '-'}</td>
                          <td className="right" style={{ color: '#a8c4ff' }}>{n > 0 && tp > 0 ? fmtRate(Math.round(ts / tp * 1000) / 10) : '-'}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 4: 품목현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="💊 품목현황" id="s4">
        {top10Products.length === 0 ? (
          <Empty msg="수수료정산 파일을 업로드하면 자동 집계됩니다." />
        ) : (
          <>
            {([
              { label: '▸ 상위 10 품목 (최신월 처방액 기준)', items: top10Products,    isTop: true,  accentColor: '#4ade80' },
              { label: '▸ 하위 10 품목 (최신월 처방액 기준)', items: bottom10Products, isTop: false, accentColor: '#f87171' },
            ] as { label: string; items: ProductRankItem[]; isTop: boolean; accentColor: string }[]).map(({ label, items, isTop, accentColor }) => (
              items.length > 0 && (
                <div key={label} style={{ marginBottom: '0.5rem' }}>
                  <SubTitle>{label}</SubTitle>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th className="center">순위</th>
                          <th>품목명</th>
                          {recentMonths.map(m => <th key={m} className="right">{fmtPeriod(m)}</th>)}
                          <th className="right">전월대비</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((p, i) => (
                          <tr key={p.name}>
                            <td className="center" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>
                              {isTop ? i + 1 : `▼${i + 1}`}
                            </td>
                            <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{p.name}</td>
                            {p.months.map(m => (
                              <td key={m.month} className="right" style={{ fontSize: '0.80rem' }}>
                                {m.prescAmt > 0 ? fmtWon(m.prescAmt, true) : <span className="muted">-</span>}
                              </td>
                            ))}
                            <td className="right" style={{ fontSize: '0.78rem' }}>
                              {p.delta === 0
                                ? <span className="muted">±0</span>
                                : <span className={p.delta > 0 ? 'up' : 'dn'}>
                                    {p.delta > 0 ? '▲' : '▼'}{fmtWon(Math.abs(p.delta), true)}
                                  </span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ))}
          </>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 5: 수수료정산현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="💰 수수료정산현황" id="s5">
        {noSett ? (
          <Empty msg="수수료정산 파일을 업로드하면 자동 집계됩니다." />
        ) : (
          <>
            <SubTitle>▸ 3개월 처방액·정산액·수수료율 추이</SubTitle>
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>월</th><th>구분</th>
                    <th className="right">처방액</th><th className="right">전월 대비</th>
                    <th className="right">정산액</th><th className="right">전월 대비</th>
                    <th className="right">수수료율</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementTrend.map((row, ri) => {
                    const prev = settlementTrend[ri - 1];
                    const rows: ReactElement[] = [];
                    if (row.clinic) {
                      rows.push(
                        <tr key={`${row.month}-cl`}>
                          <td className="muted" rowSpan={[row.clinic, row.hospital, row.total].filter(Boolean).length}>{fmtPeriod(row.month)}</td>
                          <td>의원</td>
                          <td className="right">{fmtWon(row.clinic.prescAmt)}</td>
                          <td className="right"><DeltaAmt cur={row.clinic.prescAmt} prev={prev?.clinic?.prescAmt} /></td>
                          <td className="right">{fmtWon(row.clinic.settAmt)}</td>
                          <td className="right"><DeltaAmt cur={row.clinic.settAmt} prev={prev?.clinic?.settAmt} /></td>
                          <td className="right">{fmtRate(row.clinic.rate)}</td>
                        </tr>
                      );
                    }
                    if (row.hospital) {
                      rows.push(
                        <tr key={`${row.month}-hs`}>
                          {!row.clinic && <td className="muted">{fmtPeriod(row.month)}</td>}
                          <td>병원</td>
                          <td className="right">{fmtWon(row.hospital.prescAmt)}</td>
                          <td className="right"><DeltaAmt cur={row.hospital.prescAmt} prev={prev?.hospital?.prescAmt} /></td>
                          <td className="right">{fmtWon(row.hospital.settAmt)}</td>
                          <td className="right"><DeltaAmt cur={row.hospital.settAmt} prev={prev?.hospital?.settAmt} /></td>
                          <td className="right">{fmtRate(row.hospital.rate)}</td>
                        </tr>
                      );
                    }
                    rows.push(
                      <tr key={`${row.month}-total`} className="total-row">
                        {!row.clinic && !row.hospital && <td className="muted">{fmtPeriod(row.month)}</td>}
                        <td style={{ fontWeight: 700 }}>전체</td>
                        <td className="right">{fmtWon(row.total.prescAmt)}</td>
                        <td className="right"><DeltaAmt cur={row.total.prescAmt} prev={prev?.total.prescAmt} /></td>
                        <td className="right">{fmtWon(row.total.settAmt)}</td>
                        <td className="right"><DeltaAmt cur={row.total.settAmt} prev={prev?.total.settAmt} /></td>
                        <td className="right" style={{ fontWeight: 700 }}>{fmtRate(row.total.rate)}</td>
                      </tr>
                    );
                    return rows;
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 6: 경쟁사 동향
      ══════════════════════════════════════════════════════════ */}
      <Section title="📄 경쟁사 동향" id="s6">
        {(() => {
          const COMPETITOR_ORDER = [
            '대웅바이오', '셀트리온제약', '안국약품', '동구바이오제약',
            '마더스제약', '경동제약', '휴온스', '테라젠이텍스',
          ];

          const competitorRows = COMPETITOR_ORDER.map((company, idx) => {
            const matches = csoDocs
              .filter(d => d.filename.includes(company))
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return { rank: idx + 1, company, doc: matches[0] ?? null };
          });

          // 8개사에 매칭되지 않는 기타 문서
          const otherDocs = csoDocs.filter(d =>
            !COMPETITOR_ORDER.some(c => d.filename.includes(c))
          );

          const hasAnyData = competitorRows.some(r => r.doc !== null);

          return (
            <>
              <SubTitle>▸ CSO 경쟁사 8개사 동향 · 처방액 규모 기준</SubTitle>
              <div style={{ overflowX: 'auto' }}>
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th className="center" style={{ width: '2.5rem' }}>순위</th>
                      <th style={{ width: '8rem' }}>경쟁사</th>
                      <th>최근 동향 요약</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitorRows.map(({ rank, company, doc }) => {
                      const displayText = doc
                        ? (doc.summary ?? doc.filename.replace(/\.[^/.]+$/, ''))
                        : null;
                      return (
                        <tr key={company} style={{ opacity: doc ? 1 : 0.45 }}>
                          <td className="center muted">{rank}</td>
                          <td style={{ fontWeight: 700, color: doc ? '#e9d5ff' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                            {company}
                          </td>
                          <td style={{ fontSize: '0.83rem', color: doc ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)', whiteSpace: 'pre-line', lineHeight: 1.65 }}>
                            {displayText ?? '자료 없음'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 기타 경쟁사 문서 */}
              {otherDocs.length > 0 && (
                <>
                  <div style={{ marginTop: '1rem' }}><SubTitle>▸ 기타 경쟁사 자료</SubTitle></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {otherDocs.map(d => {
                      const daysAgo = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86400000);
                      const freshColor = daysAgo <= 7 ? '#4ade80' : daysAgo <= 30 ? '#fbbf24' : 'rgba(255,255,255,0.35)';
                      const title = d.summary ?? d.filename.replace(/\.[^/.]+$/, '');
                      return (
                        <div key={d.id} style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          padding: '0.45rem 0.7rem', borderRadius: '7px',
                          background: 'rgba(255,255,255,0.025)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <span style={{ fontSize: '0.75rem', color: freshColor, minWidth: '44px', textAlign: 'right', fontWeight: 600 }}>
                            {daysAgo === 0 ? '오늘' : `${daysAgo}일전`}
                          </span>
                          <span style={{ flex: 1, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {!hasAnyData && otherDocs.length === 0 && (
                <Empty msg="문서관리 > '경쟁사동향' 폴더에 파일을 업로드하면 자동 표시됩니다. 파일명에 회사명을 포함하면 해당 행에 연결됩니다." />
              )}

              <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.7rem', textAlign: 'right' }}>
                파일명에 회사명 포함 시 자동 연결 · <a href="/documents" style={{ color: '#a5b4fc' }}>문서관리</a>
              </p>
            </>
          );
        })()}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 6b: 품절현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="⚠️ 품절현황" id="s6b">
        {stockItems.length === 0 ? (
          <Empty msg="문서관리 > '재고관리' 폴더에 파일을 업로드하면 자동 표시됩니다." />
        ) : (
          <>
            {/* 요약 pill */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {(['품절', '예측'] as const).map(type => {
                const cnt = stockItems.filter(i => i.alert_type === type).length;
                const color = type === '품절' ? '#ef4444' : '#f59e0b';
                return (
                  <div key={type} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.28rem 0.85rem', borderRadius: '100px',
                    background: `${color}14`, border: `1px solid ${color}33`,
                  }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color, lineHeight: 1 }}>{cnt}</span>
                    <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.6)' }}>{type}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th className="center" style={{ width: '3.5rem' }}>구분</th>
                    <th>제품명</th>
                    <th className="center" style={{ width: '4rem' }}>재고일</th>
                    <th className="center" style={{ width: '6rem' }}>품절시작일</th>
                    <th className="center" style={{ width: '6rem' }}>공급예정일</th>
                    <th>발생유형</th>
                  </tr>
                </thead>
                <tbody>
                  {stockItems.map((item, idx) => {
                    const color = item.alert_type === '품절' ? '#ef4444' : '#f59e0b';
                    const dayColor =
                      item.stock_days === null   ? 'rgba(255,255,255,0.4)'
                      : item.stock_days <= 0     ? '#ef4444'
                      : item.stock_days < 7      ? '#f87171'
                      : item.stock_days < 14     ? '#fb923c'
                      : item.stock_days < 30     ? '#fbbf24'
                      : '#4ade80';
                    const fmtD = (s: string | null) => {
                      if (!s) return '-';
                      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
                      return m ? `${m[1].slice(2)}.${m[2]}.${m[3]}` : s;
                    };
                    return (
                      <tr key={idx}>
                        <td className="center" style={{ color, fontWeight: 700, fontSize: '0.78rem' }}>
                          {item.alert_type}
                        </td>
                        <td style={{ fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.product_name}
                        </td>
                        <td className="center" style={{ color: dayColor, fontWeight: 700 }}>
                          {item.stock_days !== null ? `${item.stock_days}일` : '-'}
                        </td>
                        <td className="center" style={{ fontSize: '0.8rem' }}>
                          {fmtD(item.stockout_start)}
                        </td>
                        <td className="center" style={{ fontSize: '0.8rem' }}>
                          {fmtD(item.supply_date)}
                        </td>
                        <td className="muted" style={{ fontSize: '0.78rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.cause || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {stockFileName && (
              <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.5rem', textAlign: 'right' }}>
                출처: {stockFileName} · <a href="/inventory" style={{ color: '#a5b4fc' }}>재고현황</a>
              </p>
            )}
          </>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 7: 발매예정현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="🚀 발매예정현황" id="s7">
        {upcomingProducts.length === 0 ? (
          <Empty msg="허가현황 폴더에 파일을 업로드하면 자동으로 등록됩니다." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>제품명</th><th>제조사</th>
                  <th className="center">발매예정일</th><th>보험코드</th>
                  <th className="right">보험가</th><th className="center">상태</th>
                </tr>
              </thead>
              <tbody>
                {upcomingProducts.map(p => {
                  const isPast = p.launchDate && p.launchDate < today;
                  return (
                    <tr key={p.id} style={{ opacity: isPast ? 0.65 : 1 }}>
                      <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {p.title}
                        {p.indication && (
                          <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 400, marginLeft: '0.4rem' }}>
                            {p.indication.length > 20 ? p.indication.slice(0, 20) + '…' : p.indication}
                          </span>
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{p.manufacturer ?? '-'}</td>
                      <td className="center" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {p.launchDate ? fmtDate(p.launchDate.slice(0, 10)) : '-'}
                      </td>
                      <td className="muted" style={{ fontSize: '0.78rem' }}>{p.insuranceCode ?? '-'}</td>
                      <td className="right" style={{ fontSize: '0.8rem' }}>{p.insurancePrice ?? '-'}</td>
                      <td className="center">
                        {p.status ?? '예정'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 8: DC현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="🏥 DC현황" id="s8">
        {/* 통합 테이블 */}
        {dcItems.length === 0 ? (
          <Empty msg="DC현황 페이지에서 데이터를 입력하면 표시됩니다." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th className="center" style={{ width: '4rem' }}>단계</th>
                  <th>제품명</th>
                  <th>병원명</th>
                  <th>진행현황</th>
                </tr>
              </thead>
              <tbody>
                {dcItems.slice(0, 30).map(d => (
                  <tr key={d.id}>
                    <td className="center" style={{
                      color: DC_COLORS[d.category] ?? 'rgba(255,255,255,0.5)',
                      fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap',
                    }}>
                      {d.category}
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.productName}
                    </td>
                    <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.hospitalName}
                    </td>
                    <td className="muted" style={{ fontSize: '0.78rem' }}>
                      {d.progress ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.5rem', textAlign: 'right' }}>
          전체 보기 → <a href="/dc" style={{ color: '#a5b4fc' }}>DC현황</a>
        </p>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 9: 현장활동현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="👥 현장활동현황" id="s9">
        {/* ── 담당자별 방문 현황 (당월) ── */}
        <SubTitle>▸ 담당자별 방문 현황 ({fmtPeriod(thisMonth)})</SubTitle>
        {thisMonthVisits.length === 0 ? (
          <Empty msg="이번 달 영업활동 기록이 없습니다." />
        ) : (
          <table className="dash-table" style={{ marginBottom: '1.4rem' }}>
            <colgroup>
              <col style={{ width: '72px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '84px' }} />
              <col />
              <col style={{ width: '68px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>담당자</th>
                <th>방문한 업체</th>
                <th>CSO담당자명</th>
                <th>협의내용</th>
                <th className="center">방문일자</th>
              </tr>
            </thead>
            <tbody>
              {thisMonthVisits.map((v, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{v.personName}</td>
                  <td>{v.customerName}</td>
                  <td style={{ color: v.contactName ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                    {v.contactName ?? '-'}
                  </td>
                  <td style={{ lineHeight: 1.5 }}>{v.content}</td>
                  <td className="center muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(v.visitedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── 예정 일정 ── */}
        {upcomingSchedules.length > 0 && (
          <>
            <SubTitle>▸ 예정 일정</SubTitle>
            <ul className="schedule-list">
              {upcomingSchedules.map((s, i) => (
                <li key={i} className="schedule-item">
                  <span className="schedule-date">{fmtDate(s.startDate)}</span>
                  <span className="schedule-title">{s.title}</span>
                  {s.category && <span className="schedule-tag">{s.category}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ── 최근 완료 일정 ── */}
        {recentSchedules.length > 0 && (
          <>
            <SubTitle>▸ 최근 완료 일정</SubTitle>
            <ul className="schedule-list">
              {recentSchedules.map((s, i) => (
                <li key={i} className="schedule-item" style={{ opacity: 0.7 }}>
                  <span className="schedule-date">{fmtDate(s.startDate)}</span>
                  <span className="schedule-title">{s.title}</span>
                  {s.category && <span className="schedule-tag">{s.category}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        {upcomingSchedules.length === 0 && recentSchedules.length === 0 && (
          <Empty msg="등록된 일정이 없습니다." />
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 10: 메모 (자유기술)
      ══════════════════════════════════════════════════════════ */}
      <Section title="📝 메모" id="s10">
        {/* ── 툴바 ── */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
          {isEditingMemo ? (
            <>
              <button onClick={handleSave} style={memoBtn('#4ade80', 'rgba(74,222,128,0.15)', 'rgba(74,222,128,0.35)')}>
                저장
              </button>
              {savedMemo && (
                <button onClick={handleCancel} style={memoBtn('rgba(255,255,255,0.55)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.15)')}>
                  취소
                </button>
              )}
            </>
          ) : (
            <button onClick={handleEdit} style={memoBtn('#a8c4ff', 'rgba(168,196,255,0.1)', 'rgba(168,196,255,0.3)')}>
              수정
            </button>
          )}
          {justSaved && (
            <span style={{ fontSize: '0.78rem', color: '#4ade80', marginLeft: '0.3rem' }}>✓ 저장됨</span>
          )}
        </div>

        {/* ── 편집 모드 ── */}
        {isEditingMemo && (
          <textarea
            ref={textareaRef}
            className="memo-area no-print"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="보고 내용, 특이사항, 향후 계획 등을 자유롭게 입력하세요..."
            rows={6}
            style={{
              width: '100%', padding: '0.7rem 0.8rem',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '8px', color: 'rgba(255,255,255,0.85)',
              fontSize: '0.83rem', lineHeight: 1.65, resize: 'vertical',
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
        )}

        {/* ── 보기 모드 ── */}
        {!isEditingMemo && (
          <div
            className="no-print"
            style={{
              whiteSpace: 'pre-wrap', fontSize: '0.83rem', lineHeight: 1.7,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', padding: '0.7rem 0.8rem',
              minHeight: '80px', color: savedMemo ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.25)',
            }}
          >
            {savedMemo || '저장된 메모가 없습니다.'}
          </div>
        )}

        {/* ── 인쇄 전용 ── */}
        <div
          className="memo-print"
          style={{
            display: 'none',
            whiteSpace: 'pre-wrap', fontSize: '0.83rem', lineHeight: 1.7,
            border: '1px solid #ccc', borderRadius: '4px', padding: '0.6rem 0.8rem',
            minHeight: '80px', color: '#111',
          }}
        >
          {savedMemo || '(내용 없음)'}
        </div>
      </Section>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .memo-print { display: block !important; }
        }
        .memo-area:focus { border-color: rgba(99,102,241,0.5) !important; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
        .memo-area::placeholder { color: rgba(255,255,255,0.22); }
        .memo-btn:hover { opacity: 0.8; }
      `}</style>
    </>
  );
}

function memoBtn(color: string, bg: string, border: string): React.CSSProperties {
  return {
    padding: '0.3rem 0.85rem', borderRadius: '7px', border: `1px solid ${border}`,
    background: bg, color, fontSize: '0.8rem', fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.15s',
  };
}
