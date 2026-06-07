'use client';

import type { ReactElement } from 'react';

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

export type PrescMonthStat = {
  month:         string;
  hospCount:     number;
  productCount:  number;
  totalPrescAmt: number;
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

export type ScheduleItem = {
  title:     string;
  startDate: string;
  endDate:   string | null;
  category:  string | null;
  assignee:  string | null;
};

export type EdiMonthStat = {
  month:         string;
  hospCount:     number;
  productCount:  number;
  totalPrescAmt: number;
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
};

export type DashboardData = {
  reportDate:           string;
  recentMonths:         string[];          // 최근 3 처방월
  // 섹션1: 거래처현황
  settlementByCategory: SettlementByCat[];
  top10Customers:       TopCustomer[];
  customerMonthly:      CustomerMonthStat[];
  // 섹션2: 처방처현황
  prescriptionMonthly:  PrescMonthStat[];
  top10Prescribers:     TopPrescriber[];
  // 섹션3: 수수료정산현황
  settlementTrend:      SettlementTrend[];
  // 섹션4: 현장활동
  schedules:            ScheduleItem[];
  visitSummary:         VisitPersonStat[];
  visitMonths:          string[];
  // 섹션5: 처방실적 현황 (EDI/실적마감)
  ediMonthly:           EdiMonthStat[];
  top5Products:         TopProduct[];
  ediMonths:            string[];
  // 섹션6: 발매예정
  upcomingProducts:     UpcomingProduct[];
  // 섹션7: 경쟁사 동향
  csoDocs:              CsoDoc[];
};

/* ── 포맷 유틸 ─────────────────────────────────────────────────────── */
function fmtPeriod(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1].slice(2)}년 ${+m[2]}월`;
  return s;
}

function fmtWon(n: number, compact = false): string {
  if (compact) {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
    if (n >= 10_000)      return `${Math.round(n / 10_000)}만`;
    return String(Math.round(n));
  }
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (n >= 10_000)      return `${Math.round(n / 10_000).toLocaleString()}만원`;
  return n.toLocaleString() + '원';
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
    settlementByCategory, top10Customers, customerMonthly,
    prescriptionMonthly, top10Prescribers,
    settlementTrend,
    schedules, visitSummary, visitMonths,
    ediMonthly, top5Products, ediMonths,
    upcomingProducts,
    csoDocs,
  } = data;

  const today = reportDate;
  const noSett = recentMonths.length === 0;
  const noEdi  = ediMonths.length === 0;

  // 일정: 과거 / 예정 분류
  const todayStr = today;
  const upcomingSchedules = schedules.filter(s => s.startDate >= todayStr).slice(0, 8);
  const recentSchedules   = schedules.filter(s => s.startDate < todayStr).slice(-6).reverse();

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
        .badge {
          display: inline-block; padding: 0.1rem 0.4rem;
          border-radius: 4px; font-size: 0.7rem; font-weight: 600;
        }
        .badge-clinic  { background: rgba(52,211,153,0.15); color: #6ee7b7; }
        .badge-hosp    { background: rgba(99,102,241,0.15); color: #a5b4fc; }
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
          .badge-clinic  { background: #d1fae5 !important; color: #065f46 !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .badge-hosp    { background: #e0e7ff !important; color: #3730a3 !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
          {recentMonths.length > 0 && ` | 기준기간: ${fmtPeriod(recentMonths[0])} ~ ${fmtPeriod(recentMonths[recentMonths.length - 1])}`}
        </p>
      </div>

      {/* ── 인쇄 버튼 ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="print-btn" onClick={() => window.print()}>
          🖨️ A4 인쇄
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          섹션 1: 거래처현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="🏢 거래처현황" id="s1">

        {/* 1-A: 거래처 월별 변동 (customer_status 기반) */}
        {customerMonthly.length > 0 && (
          <>
            <SubTitle>▸ 거래처 수 (3개월)</SubTitle>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>기간</th>
                  <th className="right">거래처수</th>
                  <th className="right">전기 대비</th>
                </tr>
              </thead>
              <tbody>
                {customerMonthly.map((r, i) => (
                  <tr key={r.month}>
                    <td className="muted">{fmtPeriod(r.month)}</td>
                    <td className="right bold">{r.count.toLocaleString()}</td>
                    <td className="right">
                      <DeltaCount cur={r.count} prev={customerMonthly[i - 1]?.count} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* 1-B: 의원/병원 평균 처방·정산금액 */}
        {noSett ? (
          <Empty msg="수수료정산 파일을 업로드하면 자동 집계됩니다." />
        ) : (
          <>
            <SubTitle>▸ 의원·병원 평균 처방·정산현황</SubTitle>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>월</th>
                  <th>구분</th>
                  <th className="right">처방처수</th>
                  <th className="right">평균처방액</th>
                  <th className="right">평균정산액</th>
                  <th className="right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {settlementByCategory.map((row, ri) => {
                  const prevRow = settlementByCategory[ri - 1];
                  return (
                    <>
                      {row.clinic && (
                        <tr key={`${row.month}-cl`}>
                          {ri === 0 || settlementByCategory[ri - 1] ? (
                            <td className="muted" rowSpan={[row.clinic, row.hospital].filter(Boolean).length}>
                              {fmtPeriod(row.month)}
                            </td>
                          ) : null}
                          <td><span className="badge badge-clinic">의원</span></td>
                          <td className="right">{row.clinic.hospCount.toLocaleString()}</td>
                          <td className="right">{fmtWon(row.clinic.avgPrescAmt, true)}</td>
                          <td className="right">{fmtWon(row.clinic.avgSettAmt, true)}</td>
                          <td className="right">
                            <DeltaAmt cur={row.clinic.avgPrescAmt} prev={prevRow?.clinic?.avgPrescAmt} />
                          </td>
                        </tr>
                      )}
                      {row.hospital && (
                        <tr key={`${row.month}-hs`}>
                          {!row.clinic && (
                            <td className="muted">{fmtPeriod(row.month)}</td>
                          )}
                          <td><span className="badge badge-hosp">병원</span></td>
                          <td className="right">{row.hospital.hospCount.toLocaleString()}</td>
                          <td className="right">{fmtWon(row.hospital.avgPrescAmt, true)}</td>
                          <td className="right">{fmtWon(row.hospital.avgSettAmt, true)}</td>
                          <td className="right">
                            <DeltaAmt cur={row.hospital.avgPrescAmt} prev={prevRow?.hospital?.avgPrescAmt} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {/* 1-C: 상위 10 거래처 */}
        {top10Customers.length > 0 && (
          <>
            <SubTitle>▸ 상위 10 거래처 (처방액 기준)</SubTitle>
            <table className="dash-table">
              <thead>
                <tr>
                  <th className="center">순위</th>
                  <th>거래처명</th>
                  <th>구분</th>
                  <th className="right">처방액 합계</th>
                  <th className="right">정산액 합계</th>
                </tr>
              </thead>
              <tbody>
                {top10Customers.map((r, i) => (
                  <tr key={r.name}>
                    <td className="center muted">{i + 1}</td>
                    <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                    <td>
                      <span className={`badge ${r.category === '의원' ? 'badge-clinic' : 'badge-hosp'}`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="right bold">{fmtWon(r.prescAmt)}</td>
                    <td className="right">{fmtWon(r.settAmt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 2: 처방처현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="🏥 처방처현황" id="s2">
        {noSett ? (
          <Empty msg="수수료정산 파일을 업로드하면 자동 집계됩니다." />
        ) : (
          <>
            {/* 2-A: 월별 처방처/품목/처방액 */}
            <SubTitle>▸ 처방처·품목·처방액 변동 (3개월)</SubTitle>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>월</th>
                  <th className="right">처방처수</th>
                  <th className="right">전월 대비</th>
                  <th className="right">처방품목수</th>
                  <th className="right">처방액 합계</th>
                  <th className="right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {prescriptionMonthly.map((r, i) => (
                  <tr key={r.month}>
                    <td className="muted">{fmtPeriod(r.month)}</td>
                    <td className="right bold">{r.hospCount.toLocaleString()}</td>
                    <td className="right">
                      <DeltaCount cur={r.hospCount} prev={prescriptionMonthly[i - 1]?.hospCount} />
                    </td>
                    <td className="right">{r.productCount.toLocaleString()}</td>
                    <td className="right bold">{fmtWon(r.totalPrescAmt)}</td>
                    <td className="right">
                      <DeltaAmt cur={r.totalPrescAmt} prev={prescriptionMonthly[i - 1]?.totalPrescAmt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 2-B: 상위 10 처방처 */}
            {top10Prescribers.length > 0 && (
              <>
                <SubTitle>▸ 상위 10 처방처 (3개월 추이)</SubTitle>
                <div style={{ overflowX: 'auto' }}>
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th className="center">순위</th>
                        <th>처방처명</th>
                        <th>구분</th>
                        {recentMonths.map(m => (
                          <th key={m} className="right">{fmtPeriod(m)}</th>
                        ))}
                        <th className="right" style={{ color: '#a8c4ff' }}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top10Prescribers.map((r, i) => (
                        <tr key={r.name}>
                          <td className="center muted">{i + 1}</td>
                          <td style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.name}
                          </td>
                          <td>
                            <span className={`badge ${r.category === '의원' ? 'badge-clinic' : 'badge-hosp'}`}>
                              {r.category}
                            </span>
                          </td>
                          {r.months.map(m => (
                            <td key={m.month} className="right" style={{ fontSize: '0.78rem' }}>
                              {m.prescAmt > 0 ? fmtWon(m.prescAmt, true) : <span className="muted">-</span>}
                            </td>
                          ))}
                          <td className="right bold" style={{ color: '#a8c4ff' }}>
                            {fmtWon(r.totalPrescAmt, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 3: 수수료정산현황
      ══════════════════════════════════════════════════════════ */}
      <Section title="💰 수수료정산현황" id="s3">
        {noSett ? (
          <Empty msg="수수료정산 파일을 업로드하면 자동 집계됩니다." />
        ) : (
          <>
            <SubTitle>▸ 3개월 처방액·정산액·수수료율 추이</SubTitle>
            <div style={{ overflowX: 'auto' }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>월</th>
                    <th>구분</th>
                    <th className="right">처방액</th>
                    <th className="right">전월 대비</th>
                    <th className="right">정산액</th>
                    <th className="right">전월 대비</th>
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
                          <td className="muted" rowSpan={[row.clinic, row.hospital, row.total].filter(Boolean).length}>
                            {fmtPeriod(row.month)}
                          </td>
                          <td><span className="badge badge-clinic">의원</span></td>
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
                          <td><span className="badge badge-hosp">병원</span></td>
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
          섹션 4: 현장활동
      ══════════════════════════════════════════════════════════ */}
      <Section title="👥 현장활동" id="s4">
        <div className="two-col">
          {/* 4-A: 담당자별 방문 현황 */}
          <div>
            <SubTitle>▸ 담당자별 방문 현황</SubTitle>
            {visitSummary.length === 0 ? (
              <Empty msg="영업활동 기록이 없습니다." />
            ) : (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>담당자</th>
                    {visitMonths.map(m => (
                      <th key={m} className="center">{fmtPeriod(m)}</th>
                    ))}
                    <th className="center" style={{ color: '#a8c4ff' }}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {visitSummary.map(v => (
                    <tr key={v.name}>
                      <td style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.name}
                      </td>
                      {visitMonths.map(m => {
                        const cnt = v.months.find(mv => mv.month === m)?.count ?? 0;
                        return (
                          <td key={m} className="center" style={{ color: cnt > 0 ? '#fff' : 'rgba(255,255,255,0.25)' }}>
                            {cnt > 0 ? cnt : '-'}
                          </td>
                        );
                      })}
                      <td className="center bold" style={{ color: '#a8c4ff' }}>{v.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 4-B: 주요 일정 */}
          <div>
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
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 5: 처방실적 현황 (EDI/실적마감)
      ══════════════════════════════════════════════════════════ */}
      <Section title="📈 처방실적 현황" id="s5">
        {noEdi ? (
          <Empty msg="EDI 또는 실적마감 파일을 업로드하면 자동 집계됩니다." />
        ) : (
          <>
            {/* 5-A: 월별 처방현황 */}
            <SubTitle>▸ 월별 처방 집계 (3개월)</SubTitle>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>월</th>
                  <th className="right">처방처수</th>
                  <th className="right">전월 대비</th>
                  <th className="right">처방품목수</th>
                  <th className="right">처방액 합계</th>
                  <th className="right">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {ediMonthly.map((r, i) => (
                  <tr key={r.month}>
                    <td className="muted">{fmtPeriod(r.month)}</td>
                    <td className="right bold">{r.hospCount.toLocaleString()}</td>
                    <td className="right">
                      <DeltaCount cur={r.hospCount} prev={ediMonthly[i - 1]?.hospCount} />
                    </td>
                    <td className="right">{r.productCount.toLocaleString()}</td>
                    <td className="right bold">{fmtWon(r.totalPrescAmt)}</td>
                    <td className="right">
                      <DeltaAmt cur={r.totalPrescAmt} prev={ediMonthly[i - 1]?.totalPrescAmt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 5-B: 상위 5 품목 */}
            {top5Products.length > 0 && (
              <>
                <SubTitle>▸ 주력 품목 TOP 5 (처방액 기준)</SubTitle>
                <div style={{ overflowX: 'auto' }}>
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th className="center">순위</th>
                        <th>품목명</th>
                        {ediMonths.map(m => (
                          <th key={m} className="right">{fmtPeriod(m)}</th>
                        ))}
                        <th className="right" style={{ color: '#a8c4ff' }}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top5Products.map((p, i) => (
                        <tr key={p.name}>
                          <td className="center muted">{i + 1}</td>
                          <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </td>
                          {p.months.map(m => (
                            <td key={m.month} className="right" style={{ fontSize: '0.78rem' }}>
                              {m.prescAmt > 0 ? fmtWon(m.prescAmt, true) : <span className="muted">-</span>}
                            </td>
                          ))}
                          <td className="right bold" style={{ color: '#a8c4ff' }}>
                            {fmtWon(p.totalPrescAmt, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Section>

      {/* ══════════════════════════════════════════════════════════
          섹션 6: 발매예정
      ══════════════════════════════════════════════════════════ */}
      <Section title="🚀 발매예정" id="s6">
        {upcomingProducts.length === 0 ? (
          <Empty msg="허가현황 폴더에 파일을 업로드하면 자동으로 등록됩니다." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>제품명</th>
                  <th>제조사</th>
                  <th className="center">발매예정일</th>
                  <th>보험코드</th>
                  <th className="right">보험가</th>
                  <th className="center">상태</th>
                </tr>
              </thead>
              <tbody>
                {upcomingProducts.map(p => {
                  const isPast = p.launchDate && p.launchDate < today;
                  const statusColor =
                    p.status === '발매완료' ? '#4ade80' :
                    p.status === '보험등재' ? '#a5b4fc' :
                    p.status === '허가완료' ? '#fbbf24' :
                    'rgba(255,255,255,0.5)';
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
                      <td className="muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {p.manufacturer ?? '-'}
                      </td>
                      <td className="center" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {p.launchDate ? fmtDate(p.launchDate.slice(0, 10)) : '-'}
                      </td>
                      <td className="muted" style={{ fontSize: '0.78rem' }}>
                        {p.insuranceCode ?? '-'}
                      </td>
                      <td className="right" style={{ fontSize: '0.8rem' }}>
                        {p.insurancePrice ?? '-'}
                      </td>
                      <td className="center">
                        <span className="badge" style={{
                          background: `${statusColor}22`,
                          color: statusColor,
                          border: `1px solid ${statusColor}44`,
                        }}>
                          {p.status ?? '예정'}
                        </span>
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
          섹션 7: 경쟁사 동향
      ══════════════════════════════════════════════════════════ */}
      <Section title="📄 경쟁사 동향" id="s7">
        {csoDocs.length === 0 ? (
          <Empty msg="'CSO동향' 등 관련 폴더에 파일을 업로드하면 목록이 표시됩니다." />
        ) : (
          <>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', margin: '0 0 0.7rem' }}>
              문서관리에 업로드된 CSO/경쟁사 관련 최신 자료 목록입니다.
            </p>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>폴더</th>
                  <th className="center">형식</th>
                  <th className="right">업로드일</th>
                </tr>
              </thead>
              <tbody>
                {csoDocs.map(d => (
                  <tr key={d.id}>
                    <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.filename}
                    </td>
                    <td>
                      <span className="schedule-tag" style={{ background: 'rgba(168,85,247,0.12)', color: '#d8b4fe' }}>
                        {d.category}
                      </span>
                    </td>
                    <td className="center muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      {d.fileType}
                    </td>
                    <td className="right muted" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {fmtDate(d.createdAt.slice(0, 10))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.5rem', textAlign: 'right' }}>
              전체 파일 보기 → <a href="/documents" style={{ color: '#a5b4fc' }}>문서관리</a>
            </p>
          </>
        )}
      </Section>
    </>
  );
}
