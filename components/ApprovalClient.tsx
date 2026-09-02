'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { ApprovalRow, DrilldownRow } from '@/app/api/approval-data/route';
import { fmtNum } from '@/lib/format';

type AllData = {
  rows:         ApprovalRow[];
  months:       string[];    // 선택 가능한 허가월(YYYY-MM, 오름차순)
  rxTypes:      string[];    // 전문일반 값 목록
  totalMonths:  number;
  windowMonths: number;
  undated:      number;
  failedCount:  number;
};

type Breakdown = { name: string; count: number }[];
type ViewData = {
  meta: {
    totalCount: number; approvedCount: number; cancelledCount: number;
    uniqueIngredients: number; topIngredientName: string; topIngredientCompanyCount: number;
    topIngredientTotalCount: number; monthCount: number;
  };
  companyBreakdown: Breakdown;
  approvalTypeBreakdown: Breakdown;
  topIngredients: Breakdown;
  monthlyTrend: { period: string; count: number; approved: number; cancelled: number }[];
  drilldownRows: DrilldownRow[];
};

type FileInfo = { id: string; filename: string; createdAt: string };

/* ── 공통 스타일 ── */
const CARD: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e9f0',
  borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem',
};
const TH: React.CSSProperties = {
  padding: '0.5rem 0.75rem', fontSize: '0.72rem',
  color: 'var(--text-muted)', fontWeight: 600,
  borderBottom: '1px solid #e5e9f0',
  textAlign: 'left', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '0.45rem 0.75rem', fontSize: '0.8rem',
  borderBottom: '1px solid #eaeef4',
  color: 'var(--text-primary)',
};

/* ── 기본 서브 컴포넌트 ── */
function Skel({ w = '100%', h = '0.85rem' }: { w?: string; h?: string }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: '5px',
      background: 'rgba(15,23,42,0.08)',
      animation: 'skel-pulse 1.4s ease-in-out infinite',
    }} />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem',
      background: 'linear-gradient(135deg,#1e293b 0%,#2563eb 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
    }}>{children}</h3>
  );
}

function SummaryCard({ label, value, unit, sub, color }: {
  label: string; value: string; unit?: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e9f0',
      borderRadius: '12px', padding: '0.9rem 1rem',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
        <span style={{ fontSize: '1.7rem', fontWeight: 700, color: color ?? '#111827', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

/* ── 드릴다운 공통 ── */
function useToggle() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return { expanded, toggle };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: '1rem', fontSize: '0.6rem',
      color: 'rgba(37,99,235,0.6)', userSelect: 'none', flexShrink: 0,
    }}>
      {open ? '▼' : '▶'}
    </span>
  );
}

/* ── 회사별 허가현황 드릴다운 테이블 ──
   Level 1: 회사명  →  Level 2: 성분명  →  Level 3: 품목명 + Level 4: 허가일
*/
function DrilldownCompanyTable({ drilldownRows, title }: {
  drilldownRows: DrilldownRow[];
  title: string;
}) {
  const lvl1 = useToggle(); // company expand
  const lvl2 = useToggle(); // ingredient expand within company

  // tree: company → ingredient → [ {product, approvalDate} ]
  const tree = useMemo(() => {
    const map = new Map<string, Map<string, { product: string; approvalDate: string }[]>>();
    for (const r of drilldownRows) {
      if (!r.company) continue;
      if (!map.has(r.company)) map.set(r.company, new Map());
      const ing = r.ingredient || '(성분명 없음)';
      const ingMap = map.get(r.company)!;
      if (!ingMap.has(ing)) ingMap.set(ing, []);
      ingMap.get(ing)!.push({ product: r.product || '(품목명 없음)', approvalDate: r.approvalDate });
    }
    return map;
  }, [drilldownRows]);

  // 회사 랭킹: 성분수(distinct) 내림차순, 동수면 품목수.
  const rows = useMemo(() =>
    [...tree.entries()].map(([name, ingMap]) => {
      let products = 0; for (const arr of ingMap.values()) products += arr.length;
      return { name, count: ingMap.size, products };
    }).sort((a, b) => b.count - a.count || b.products - a.products),
  [tree]);

  const maxCount = Math.max(...rows.map(r => r.count), 1);

  return (
    <div style={CARD}>
      <SectionTitle>{title}</SectionTitle>
      <div className="resp-table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: '2.2rem', textAlign: 'center' }}>순위</th>
              <th style={TH}>회사명 / 성분 / 품목</th>
              <th style={{ ...TH, width: '28%' }}>성분수 비율</th>
              <th style={{ ...TH, textAlign: 'right', minWidth: '110px' }}>성분수 / 품목수</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row, i) => {
              const isOpen = lvl1.expanded.has(row.name);
              const ingMap = tree.get(row.name);
              const hasDetail = !!ingMap && ingMap.size > 0;
              const ingList = ingMap
                ? Array.from(ingMap.entries()).sort((a, b) => b[1].length - a[1].length)
                : [];

              return (
                <React.Fragment key={row.name}>
                  {/* ── Level 1: 회사 ── */}
                  <tr
                    onClick={() => hasDetail && lvl1.toggle(row.name)}
                    style={{
                      background: i % 2 === 0 ? '#fafbfd' : undefined,
                      cursor: hasDetail ? 'pointer' : 'default',
                    }}
                  >
                    <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{i + 1}</td>
                    <td style={{ ...TD, fontWeight: i < 3 ? 600 : 400 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0' }}>
                        {hasDetail && <Chevron open={isOpen} />}
                        {!hasDetail && <span style={{ display: 'inline-block', width: '1rem' }} />}
                        {row.name}
                      </span>
                    </td>
                    <td style={{ ...TD, paddingRight: '1rem' }}>
                      <div style={{ background: '#eef1f6', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${(row.count / maxCount) * 100}%`, height: '100%',
                          background: i === 0 ? 'linear-gradient(90deg,#dc2626,#fb923c)'
                            : i < 3 ? 'linear-gradient(90deg,#2563eb,#4f46e5)'
                            : 'rgba(37,99,235,0.4)',
                          borderRadius: '3px',
                        }} />
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', color: i === 0 ? '#dc2626' : i < 3 ? '#2563eb' : 'var(--text-primary)', fontWeight: i < 3 ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {fmtNum(row.count)}성분
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {fmtNum(row.products)}품목</span>
                    </td>
                  </tr>

                  {/* ── Level 2: 성분 ── */}
                  {isOpen && ingList.map(([ingName, products]) => {
                    const ingKey = `${row.name}::${ingName}`;
                    const isIngOpen = lvl2.expanded.has(ingKey);
                    const sorted = [...products].sort((a, b) => (b.approvalDate || '').localeCompare(a.approvalDate || ''));

                    return (
                      <React.Fragment key={ingKey}>
                        <tr
                          onClick={() => lvl2.toggle(ingKey)}
                          style={{ background: 'rgba(79,142,247,0.05)', cursor: 'pointer' }}
                        >
                          <td style={{ ...TD, borderBottom: '1px solid rgba(79,142,247,0.07)' }} />
                          <td style={{ ...TD, paddingLeft: '2rem', fontSize: '0.76rem', color: '#475569', borderBottom: '1px solid rgba(79,142,247,0.07)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <Chevron open={isIngOpen} />
                              {ingName}
                            </span>
                          </td>
                          <td style={{ ...TD, borderBottom: '1px solid rgba(79,142,247,0.07)' }} />
                          <td style={{ ...TD, textAlign: 'right', fontSize: '0.74rem', color: '#2563eb', borderBottom: '1px solid rgba(79,142,247,0.07)' }}>
                            {products.length}건
                          </td>
                        </tr>

                        {/* ── Level 3: 품목  +  Level 4: 허가일 ── */}
                        {isIngOpen && sorted.map((p, pi) => (
                          <tr key={pi} style={{ background: 'rgba(124,58,237,0.04)' }}>
                            <td style={{ ...TD, borderBottom: '1px solid rgba(124,58,237,0.05)' }} />
                            <td style={{ ...TD, paddingLeft: '3.5rem', fontSize: '0.73rem', color: '#1f2937', borderBottom: '1px solid rgba(124,58,237,0.05)' }}>
                              <span style={{ marginRight: '0.3rem', color: '#7c3aed' }}>•</span>
                              {p.product}
                            </td>
                            <td style={{ ...TD, borderBottom: '1px solid rgba(124,58,237,0.05)' }} />
                            <td style={{ ...TD, textAlign: 'right', fontSize: '0.71rem', color: '#94a3b8', borderBottom: '1px solid rgba(124,58,237,0.05)', whiteSpace: 'nowrap' }}>
                              {p.approvalDate || '-'}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            }) : (
              <tr><td colSpan={4} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)' }}>회사명 컬럼이 탐지되지 않았습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 모바일 카드 (회사→성분→품목→허가일 확장 유지) ── */}
      <div className="resp-cards">
        {rows.length > 0 ? rows.map((row, i) => {
          const isOpen = lvl1.expanded.has(row.name);
          const ingMap = tree.get(row.name);
          const hasDetail = !!ingMap && ingMap.size > 0;
          const ingList = ingMap ? Array.from(ingMap.entries()).sort((a, b) => b[1].length - a[1].length) : [];
          return (
            <div key={row.name} className="mcard">
              <div className="mcard-head" onClick={() => hasDetail && lvl1.toggle(row.name)} style={{ cursor: hasDetail ? 'pointer' : 'default' }}>
                <span className="mcard-rank">{i + 1}</span>
                <span className="mcard-title">{row.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.76rem', whiteSpace: 'nowrap', color: i === 0 ? '#dc2626' : i < 3 ? '#2563eb' : '#475569' }}>
                  {fmtNum(row.count)}성분 · {fmtNum(row.products)}품목 {hasDetail && (isOpen ? '▼' : '▶')}
                </span>
              </div>
              {isOpen && ingList.map(([ingName, products]) => {
                const ingKey = `${row.name}::${ingName}`;
                const isIngOpen = lvl2.expanded.has(ingKey);
                const sorted = [...products].sort((a, b) => (b.approvalDate || '').localeCompare(a.approvalDate || ''));
                return (
                  <div key={ingKey} style={{ marginTop: '0.3rem', paddingLeft: '0.4rem', borderLeft: '2px solid #e5e9f0' }}>
                    <div onClick={() => lvl2.toggle(ingKey)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.83rem', color: '#475569' }}>
                      <span>{isIngOpen ? '▼' : '▶'} {ingName}</span>
                      <span style={{ color: '#2563eb', whiteSpace: 'nowrap' }}>{products.length}건</span>
                    </div>
                    {isIngOpen && sorted.map((p, pi) => (
                      <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.18rem 0 0.18rem 0.9rem', fontSize: '0.77rem', color: '#1f2937' }}>
                        <span>• {p.product}</span>
                        <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{p.approvalDate || '-'}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        }) : <div className="mcard" style={{ color: '#94a3b8' }}>회사명 컬럼이 탐지되지 않았습니다.</div>}
      </div>
    </div>
  );
}

/* ── 성분별 허가현황 드릴다운 테이블 ──
   Level 1: 성분명  →  Level 2: 회사명  →  Level 3: 품목명 + Level 4: 허가일
*/
function DrilldownIngredientTable({ rows, drilldownRows, title }: {
  rows: { name: string; count: number }[];
  drilldownRows: DrilldownRow[];
  title: string;
}) {
  const lvl1 = useToggle(); // ingredient expand
  const lvl2 = useToggle(); // company expand within ingredient

  // tree: ingredient → company → [ {product, approvalDate} ]
  const tree = useMemo(() => {
    const map = new Map<string, Map<string, { product: string; approvalDate: string }[]>>();
    for (const r of drilldownRows) {
      if (!r.ingredient) continue;
      if (!map.has(r.ingredient)) map.set(r.ingredient, new Map());
      const co = r.company || '(회사명 없음)';
      const coMap = map.get(r.ingredient)!;
      if (!coMap.has(co)) coMap.set(co, []);
      coMap.get(co)!.push({ product: r.product || '(품목명 없음)', approvalDate: r.approvalDate });
    }
    return map;
  }, [drilldownRows]);

  const maxCount = Math.max(...rows.map(r => r.count), 1);

  return (
    <div style={CARD}>
      <SectionTitle>{title}</SectionTitle>
      <div className="resp-table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: '2.2rem', textAlign: 'center' }}>순위</th>
              <th style={TH}>성분명 / 회사 / 품목</th>
              <th style={{ ...TH, width: '28%' }}>비율</th>
              <th style={{ ...TH, textAlign: 'right', minWidth: '90px' }}>허가일 / 수량</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row, i) => {
              const isOpen = lvl1.expanded.has(row.name);
              const coMap = tree.get(row.name);
              const hasDetail = !!coMap && coMap.size > 0;
              const coList = coMap
                ? Array.from(coMap.entries()).sort((a, b) => b[1].length - a[1].length)
                : [];

              return (
                <React.Fragment key={row.name}>
                  {/* ── Level 1: 성분 ── */}
                  <tr
                    onClick={() => hasDetail && lvl1.toggle(row.name)}
                    style={{
                      background: i % 2 === 0 ? '#fafbfd' : undefined,
                      cursor: hasDetail ? 'pointer' : 'default',
                    }}
                  >
                    <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{i + 1}</td>
                    <td style={{ ...TD, fontWeight: i < 3 ? 600 : 400 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {hasDetail && <Chevron open={isOpen} />}
                        {!hasDetail && <span style={{ display: 'inline-block', width: '1rem' }} />}
                        {row.name}
                      </span>
                    </td>
                    <td style={{ ...TD, paddingRight: '1rem' }}>
                      <div style={{ background: '#eef1f6', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${(row.count / maxCount) * 100}%`, height: '100%',
                          background: i === 0 ? 'linear-gradient(90deg,#7c3aed,#4f46e5)'
                            : i < 3 ? 'linear-gradient(90deg,#2563eb,#7c3aed)'
                            : 'rgba(37,99,235,0.4)',
                          borderRadius: '3px',
                        }} />
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', color: i === 0 ? '#7c3aed' : i < 3 ? '#2563eb' : 'var(--text-primary)', fontWeight: i < 3 ? 600 : 400 }}>
                      {fmtNum(row.count)}건
                    </td>
                  </tr>

                  {/* ── Level 2: 회사 ── */}
                  {isOpen && coList.map(([coName, products]) => {
                    const coKey = `${row.name}::${coName}`;
                    const isCoOpen = lvl2.expanded.has(coKey);
                    const sorted = [...products].sort((a, b) => (b.approvalDate || '').localeCompare(a.approvalDate || ''));

                    return (
                      <React.Fragment key={coKey}>
                        <tr
                          onClick={() => lvl2.toggle(coKey)}
                          style={{ background: 'rgba(124,58,237,0.05)', cursor: 'pointer' }}
                        >
                          <td style={{ ...TD, borderBottom: '1px solid rgba(124,58,237,0.07)' }} />
                          <td style={{ ...TD, paddingLeft: '2rem', fontSize: '0.76rem', color: '#475569', borderBottom: '1px solid rgba(124,58,237,0.07)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <Chevron open={isCoOpen} />
                              {coName}
                            </span>
                          </td>
                          <td style={{ ...TD, borderBottom: '1px solid rgba(124,58,237,0.07)' }} />
                          <td style={{ ...TD, textAlign: 'right', fontSize: '0.74rem', color: '#7c3aed', borderBottom: '1px solid rgba(124,58,237,0.07)' }}>
                            {products.length}건
                          </td>
                        </tr>

                        {/* ── Level 3: 품목  +  Level 4: 허가일 ── */}
                        {isCoOpen && sorted.map((p, pi) => (
                          <tr key={pi} style={{ background: 'rgba(79,142,247,0.04)' }}>
                            <td style={{ ...TD, borderBottom: '1px solid rgba(79,142,247,0.05)' }} />
                            <td style={{ ...TD, paddingLeft: '3.5rem', fontSize: '0.73rem', color: '#1f2937', borderBottom: '1px solid rgba(79,142,247,0.05)' }}>
                              <span style={{ marginRight: '0.3rem', color: '#4f8ef7' }}>•</span>
                              {p.product}
                            </td>
                            <td style={{ ...TD, borderBottom: '1px solid rgba(79,142,247,0.05)' }} />
                            <td style={{ ...TD, textAlign: 'right', fontSize: '0.71rem', color: '#94a3b8', borderBottom: '1px solid rgba(79,142,247,0.05)', whiteSpace: 'nowrap' }}>
                              {p.approvalDate || '-'}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            }) : (
              <tr><td colSpan={4} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)' }}>성분명 컬럼이 탐지되지 않았습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── 모바일 카드 (성분→회사→품목→허가일 확장 유지) ── */}
      <div className="resp-cards">
        {rows.length > 0 ? rows.map((row, i) => {
          const isOpen = lvl1.expanded.has(row.name);
          const coMap = tree.get(row.name);
          const hasDetail = !!coMap && coMap.size > 0;
          const coList = coMap ? Array.from(coMap.entries()).sort((a, b) => b[1].length - a[1].length) : [];
          return (
            <div key={row.name} className="mcard">
              <div className="mcard-head" onClick={() => hasDetail && lvl1.toggle(row.name)} style={{ cursor: hasDetail ? 'pointer' : 'default' }}>
                <span className="mcard-rank">{i + 1}</span>
                <span className="mcard-title">{row.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', whiteSpace: 'nowrap', color: i === 0 ? '#7c3aed' : i < 3 ? '#2563eb' : '#475569' }}>
                  {fmtNum(row.count)}건 {hasDetail && (isOpen ? '▼' : '▶')}
                </span>
              </div>
              {isOpen && coList.map(([coName, products]) => {
                const coKey = `${row.name}::${coName}`;
                const isCoOpen = lvl2.expanded.has(coKey);
                const sorted = [...products].sort((a, b) => (b.approvalDate || '').localeCompare(a.approvalDate || ''));
                return (
                  <div key={coKey} style={{ marginTop: '0.3rem', paddingLeft: '0.4rem', borderLeft: '2px solid #e5e9f0' }}>
                    <div onClick={() => lvl2.toggle(coKey)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.3rem 0', fontSize: '0.83rem', color: '#475569' }}>
                      <span>{isCoOpen ? '▼' : '▶'} {coName}</span>
                      <span style={{ color: '#7c3aed', whiteSpace: 'nowrap' }}>{products.length}건</span>
                    </div>
                    {isCoOpen && sorted.map((p, pi) => (
                      <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.18rem 0 0.18rem 0.9rem', fontSize: '0.77rem', color: '#1f2937' }}>
                        <span>• {p.product}</span>
                        <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{p.approvalDate || '-'}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        }) : <div className="mcard" style={{ color: '#94a3b8' }}>성분명 컬럼이 탐지되지 않았습니다.</div>}
      </div>
    </div>
  );
}

/* ── 허가유형별 분포 ── */
function ApprovalTypeTable({ rows, title }: { rows: { name: string; count: number }[]; title: string }) {
  if (rows.length === 0) return null;
  if (rows.length === 1 && rows[0].name === '기타') return null;
  return (
    <div style={CARD}>
      <SectionTitle>{title}</SectionTitle>
      <div className="resp-table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>허가유형</th>
              <th style={{ ...TH, textAlign: 'right' }}>품목수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.name}>
                <td style={TD}>{row.name}</td>
                <td style={{ ...TD, textAlign: 'right', color: i === 0 ? '#dc2626' : '#2563eb', fontWeight: i === 0 ? 700 : 400 }}>
                  {fmtNum(row.count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="resp-cards">
        {rows.map((row, i) => (
          <div key={row.name} className="mcard">
            <div className="mcard-head">
              <span className="mcard-title">{row.name}</span>
            </div>
            <div className="mcard-row">
              <span className="mcard-k">품목수</span>
              <span className="mcard-v" style={{ color: i === 0 ? '#dc2626' : '#2563eb' }}>{fmtNum(row.count)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 월별 추이 ── */
function MonthlyTrend({ trend }: { trend: ViewData['monthlyTrend'] }) {
  if (trend.length === 0) return null;
  const maxCount = Math.max(...trend.map(t => t.count), 1);
  return (
    <div style={CARD}>
      <SectionTitle>월별 허가 품목 추이</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {trend.map(item => {
          const pct = (item.count / maxCount) * 100;
          const label = formatPeriod(item.period);
          return (
            <div key={item.period} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '80px', flexShrink: 0 }}>
                {label}
              </span>
              <div style={{
                flex: 1, background: '#eef1f6',
                borderRadius: '4px', height: '10px', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: 'linear-gradient(90deg,#4f8ef7,#7c3aed)',
                  borderRadius: '4px', transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: '#2563eb', minWidth: '92px', textAlign: 'right', flexShrink: 0 }}>
                {fmtNum(item.count)}품목
                {item.cancelled > 0 && <span style={{ color: '#dc2626', marginLeft: 4 }}>취소{fmtNum(item.cancelled)}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── 포맷 유틸 ── */
function formatPeriod(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  return `${m[1]}년 ${parseInt(m[2])}월`;
}

const selStyle: React.CSSProperties = {
  padding: '0.4rem 0.7rem', borderRadius: '8px', fontSize: '0.82rem',
  background: '#ffffff', border: '1px solid #d7dce5',
  color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer',
};

function chipStyle(on: boolean, accent = false): React.CSSProperties {
  return {
    padding: '0.4rem 0.85rem', borderRadius: '100px', cursor: 'pointer', border: '1px solid',
    borderColor: on ? 'rgba(37,99,235,0.5)' : '#e5e9f0',
    background: on ? '#e8f0fe' : (accent ? '#f1f5f9' : 'transparent'),
    color: on ? '#2563eb' : 'var(--text-muted)',
    fontSize: '0.8rem', fontWeight: on ? 700 : 400, fontFamily: 'inherit', transition: 'all 0.15s',
  };
}

/* ── 선택 행 집계(기간·전문일반 필터 후) ── */
function aggregate(rows: ApprovalRow[]): ViewData {
  const active = rows.filter(r => !r.cancelled);
  const companyMap = new Map<string, number>();
  const typeMap    = new Map<string, number>();
  const ingMap     = new Map<string, number>();
  const ingCoMap   = new Map<string, Set<string>>();
  for (const r of active) {
    if (r.company) companyMap.set(r.company, (companyMap.get(r.company) ?? 0) + 1);
    typeMap.set(r.approvalType || '기타', (typeMap.get(r.approvalType || '기타') ?? 0) + 1);
    if (r.ingredient) {
      ingMap.set(r.ingredient, (ingMap.get(r.ingredient) ?? 0) + 1);
      if (r.company) {
        if (!ingCoMap.has(r.ingredient)) ingCoMap.set(r.ingredient, new Set());
        ingCoMap.get(r.ingredient)!.add(r.company);
      }
    }
  }
  // 월별 추이(유효/전체/취소)
  const mAgg = new Map<string, { a: number; c: number; t: number }>();
  for (const r of rows) {
    const o = mAgg.get(r.month) ?? { a: 0, c: 0, t: 0 };
    o.t++; if (r.cancelled) o.c++; else o.a++;
    mAgg.set(r.month, o);
  }
  const monthlyTrend = [...mAgg.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, o]) => ({ period, count: o.a, approved: o.t, cancelled: o.c }));

  // 최다 집중 성분(회사 수 기준)
  let topName = '', topCo = 0, topTot = 0;
  for (const [n, co] of ingCoMap.entries()) if (co.size > topCo) { topCo = co.size; topName = n; topTot = ingMap.get(n) ?? 0; }
  if (!topName && ingMap.size > 0) { let mx = 0; for (const [n, c] of ingMap.entries()) if (c > mx) { mx = c; topName = n; topTot = c; } }

  const toArr = (m: Map<string, number>) => [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return {
    meta: {
      totalCount: active.length, approvedCount: rows.length, cancelledCount: rows.length - active.length,
      uniqueIngredients: ingMap.size, topIngredientName: topName, topIngredientCompanyCount: topCo, topIngredientTotalCount: topTot,
      monthCount: mAgg.size,
    },
    companyBreakdown: toArr(companyMap),
    approvalTypeBreakdown: toArr(typeMap),
    topIngredients: toArr(ingMap).slice(0, 10),
    monthlyTrend,
    drilldownRows: active.map(r => ({ company: r.company, ingredient: r.ingredient, product: r.product, approvalDate: r.approvalDate })),
  };
}

/* ── 메인 컴포넌트 ── */
export default function ApprovalClient({ allFiles }: { allFiles: FileInfo[] }) {
  const files = allFiles ?? [];
  const [allData,    setAllData]    = useState<AllData | null>(null);
  const [loading,    setLoading]    = useState(files.length > 0);
  const [fetchError, setFetchError] = useState(false);
  // 선택 중(분석 전)
  const [startM, setStartM] = useState('');
  const [endM,   setEndM]   = useState('');
  const [rxSel,  setRxSel]  = useState<string[]>([]);   // 전문일반 선택(빈 배열 = 전체)
  // 분석 적용됨
  const [applied, setApplied] = useState<{ start: string; end: string; rx: string[] } | null>(null);

  const ids = useMemo(() => files.map(f => f.id).join(','), [files]);

  async function loadAll() {
    if (!ids) return;
    setAllData(null); setFetchError(false); setLoading(true);
    try {
      const res = await fetch(`/api/approval-data?ids=${encodeURIComponent(ids)}`);
      if (res.ok) {
        const d = await res.json() as AllData;
        setAllData(d);
        const first = d.months[0] ?? '', last = d.months[d.months.length - 1] ?? '';
        setStartM(first); setEndM(last); setRxSel([]);
        setApplied({ start: first, end: last, rx: [] });   // 초기: 전체
      } else setFetchError(true);
    } catch { setFetchError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (files.length > 0) loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const months  = allData?.months ?? [];
  const rxTypes = allData?.rxTypes ?? [];
  const filteredRows = useMemo(() => {
    if (!allData || !applied) return [];
    const lo = applied.start <= applied.end ? applied.start : applied.end;
    const hi = applied.start <= applied.end ? applied.end : applied.start;
    return allData.rows.filter(r =>
      r.month >= lo && r.month <= hi &&
      (applied.rx.length === 0 || applied.rx.includes(r.rxType)),
    );
  }, [allData, applied]);
  const viewData = useMemo(() => aggregate(filteredRows), [filteredRows]);

  if (files.length === 0) {
    return (
      <div style={{ ...CARD, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2.5rem' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.6rem', opacity: 0.4 }}>📄</div>
        문서관리 &gt; 허가현황 폴더에 업로드된 파일이 없습니다.
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes skel-pulse { 0%,100%{opacity:.3} 50%{opacity:.65} }
      `}</style>

      {/* 월 복수선택 */}
      {(loading || allData) && (
        <>
          {loading ? (
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ borderRadius: '100px', overflow: 'hidden' }}><Skel w='90px' h='32px' /></div>
              ))}
            </div>
          ) : (
            <div style={{ ...CARD, padding: '1rem 1.1rem' }}>
              {/* 기간(허가월) 선택 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', minWidth: '54px' }}>허가월</span>
                <select value={startM} onChange={e => setStartM(e.target.value)} style={selStyle}>
                  {months.map(m => <option key={m} value={m}>{formatPeriod(m)}</option>)}
                </select>
                <span style={{ color: 'var(--text-muted)' }}>~</span>
                <select value={endM} onChange={e => setEndM(e.target.value)} style={selStyle}>
                  {months.map(m => <option key={m} value={m}>{formatPeriod(m)}</option>)}
                </select>
              </div>

              {/* 전문일반 복수선택 */}
              {rxTypes.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', minWidth: '54px' }}>전문일반</span>
                  <button onClick={() => setRxSel([])} style={chipStyle(rxSel.length === 0, true)}>전체</button>
                  {rxTypes.map(t => {
                    const on = rxSel.includes(t);
                    return (
                      <button key={t}
                        onClick={() => setRxSel(on ? rxSel.filter(x => x !== t) : [...rxSel, t])}
                        style={chipStyle(on)}>
                        {on ? '✓ ' : ''}{t}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 분석 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                <button onClick={() => setApplied({ start: startM, end: endM, rx: [...rxSel] })}
                  style={{
                    padding: '0.5rem 1.4rem', borderRadius: '9px', cursor: 'pointer', fontFamily: 'inherit',
                    background: 'linear-gradient(135deg,#3b82f6,#6366f1)', border: 'none',
                    color: '#fff', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                  🔍 분석
                </button>
                {applied && (
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {formatPeriod(applied.start <= applied.end ? applied.start : applied.end)} ~ {formatPeriod(applied.start <= applied.end ? applied.end : applied.start)}
                    {applied.rx.length > 0 && <> · {applied.rx.join('·')}</>}
                    {' · '}유효 <b style={{ color: '#2563eb' }}>{fmtNum(viewData.meta.totalCount)}</b>품목 · <b>{viewData.meta.monthCount}</b>개월
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* 오류 */}
      {fetchError && !loading && (
        <div style={{ ...CARD, textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '0.6rem', opacity: 0.6 }}>⚠️</div>
          <div style={{ marginBottom: '0.4rem', color: '#dc2626' }}>파일을 불러오는 중 오류가 발생했습니다.</div>
          <div style={{ fontSize: '0.78rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
            파일 형식이 지원되지 않거나 일시적인 네트워크 오류일 수 있습니다.
          </div>
          <button onClick={loadAll} style={{
            padding: '0.45rem 1.2rem', borderRadius: '8px', cursor: 'pointer',
            background: 'rgba(79,142,247,0.15)', border: '1px solid rgba(79,142,247,0.35)',
            color: '#2563eb', fontSize: '0.82rem',
          }}>다시 시도</button>
        </div>
      )}

      {/* 스켈레톤 */}
      {loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '12px', padding: '0.9rem 1rem' }}>
                <Skel w="55%" h="0.65rem" />
                <div style={{ marginTop: '0.5rem' }}><Skel w="70%" h="1.5rem" /></div>
                <div style={{ marginTop: '0.35rem' }}><Skel w="80%" h="0.6rem" /></div>
              </div>
            ))}
          </div>
          {[...Array(2)].map((_, i) => (
            <div key={i} style={CARD}>
              <Skel w="130px" h="0.85rem" />
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {[...Array(6)].map((_, j) => <Skel key={j} />)}
              </div>
            </div>
          ))}
        </>
      )}

      {/* 데이터 표시 */}
      {!loading && !fetchError && allData && (
        <>
          {allData.failedCount > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#b45309', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(251,191,36,0.08)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
              ⚠ {allData.failedCount}개 파일을 불러오지 못했습니다.
            </div>
          )}

          {/* ═══ 선택 기간 집계 뷰 ═══ */}
          {(allData.undated > 0 || allData.totalMonths > allData.windowMonths) && (
            <div style={{ fontSize: '0.72rem', color: '#b45309', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(251,191,36,0.08)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
              ⚠ {[
                allData.totalMonths > allData.windowMonths ? `허가일자 기준 최근 ${allData.windowMonths}개월만 조회(전체 ${allData.totalMonths}개월 중)` : '',
                allData.undated > 0 ? `허가일자 미기재 ${allData.undated}건 제외` : '',
              ].filter(Boolean).join(' · ')}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <SummaryCard
              label="유효 허가 품목" value={fmtNum(viewData.meta.totalCount)} unit="품목"
              sub={`전체 허가 ${fmtNum(viewData.meta.approvedCount)} · ${fmtNum(viewData.companyBreakdown.length)}개사`}
              color="#2563eb"
            />
            <SummaryCard
              label="허가 후 취소" value={fmtNum(viewData.meta.cancelledCount)} unit="품목"
              sub={viewData.meta.cancelledCount > 0 ? '취소일자 기재 건' : '취소 없음'}
              color="#dc2626"
            />
            <SummaryCard
              label="최다 집중 성분"
              value={viewData.meta.topIngredientTotalCount ? fmtNum(viewData.meta.topIngredientTotalCount) : '-'}
              unit={viewData.meta.topIngredientTotalCount ? '건' : undefined}
              sub={viewData.meta.topIngredientName || '괄호 성분 없음'}
              color="#7c3aed"
            />
            <SummaryCard
              label="최다 허가 회사"
              value={viewData.companyBreakdown[0] ? fmtNum(viewData.companyBreakdown[0].count) : '-'}
              unit={viewData.companyBreakdown[0] ? '품목' : undefined}
              sub={viewData.companyBreakdown[0]?.name ?? '회사명 컬럼 미탐지'}
              color="#059669"
            />
          </div>

          <MonthlyTrend trend={viewData.monthlyTrend} />

          <DrilldownCompanyTable
            title={`회사별 허가현황 (성분수 순, ${viewData.meta.monthCount}개월)`}
            drilldownRows={viewData.drilldownRows}
          />

          {viewData.topIngredients.length > 0 && (
            <DrilldownIngredientTable
              title={`성분별 허가현황 TOP 10 (${viewData.meta.monthCount}개월)`}
              rows={viewData.topIngredients}
              drilldownRows={viewData.drilldownRows}
            />
          )}

          <ApprovalTypeTable title="허가심사유형별 분포" rows={viewData.approvalTypeBreakdown} />

          {viewData.meta.totalCount === 0 && (
            <div style={{ ...CARD, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.85rem' }}>
              선택한 월에 허가 데이터가 없습니다.
            </div>
          )}
        </>
      )}
    </>
  );
}
