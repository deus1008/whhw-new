'use client';

import { useMemo, useState } from 'react';

// ── 서버에서 전달되는 데이터 ──────────────────────────────
export type SalesReportData = {
  visits: { id: string; uid: string; date: string; customer: string; type: string }[];
  products: { visitId: string; name: string }[];
  managers: Record<string, string>;
  byCso: { cso: string; month: string; amount: number }[];
  byProduct: { product: string; month: string; amount: number }[];
};

const norm = (s: string) => (s || '').replace(/[\s()]/g, '').toLowerCase();
const ym = (date: string) => (date || '').slice(0, 4) + (date || '').slice(5, 7); // YYYY-MM-DD → YYYYMM
const eok = (n: number) => (n / 1e8).toFixed(n >= 1e8 ? 1 : 2);
const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
const mLabel = (m: string) => `${m.slice(2, 4)}.${m.slice(4, 6)}`;

type Trend = Record<string, number>; // month → amount

export default function SalesReportClient({ data }: { data: SalesReportData }) {
  // ── 처방 월 축 ────────────────────────────────────────
  const rxMonths = useMemo(() => {
    const s = new Set<string>();
    data.byCso.forEach(r => s.add(r.month));
    data.byProduct.forEach(r => s.add(r.month));
    return [...s].sort();
  }, [data]);

  // ── CSO 처방 추세 인덱스 (정규화 exact 매칭) ──────────
  const csoTrend = useMemo(() => {
    const m = new Map<string, Trend>();
    for (const r of data.byCso) {
      const k = norm(r.cso);
      const t = m.get(k) ?? {};
      t[r.month] = (t[r.month] ?? 0) + r.amount;
      m.set(k, t);
    }
    return m;
  }, [data]);

  // ── 품목 처방 추세 인덱스 (접두 매칭용) ───────────────
  const rxProdIndex = useMemo(() => {
    const byProd = new Map<string, Trend>();
    for (const r of data.byProduct) {
      const t = byProd.get(r.product) ?? {};
      t[r.month] = (t[r.month] ?? 0) + r.amount;
      byProd.set(r.product, t);
    }
    return [...byProd.entries()].map(([product, trend]) => ({ product, n: norm(product), trend }));
  }, [data]);

  const matchCustomer = (name: string): Trend | null => csoTrend.get(norm(name)) ?? null;

  const matchProduct = (name: string): Trend | null => {
    const n = norm(name);
    if (n.length < 2) return null;
    const merged: Trend = {};
    let hit = false;
    for (const rp of rxProdIndex) {
      if (rp.n.startsWith(n) || n.startsWith(rp.n)) {
        hit = true;
        for (const [mo, amt] of Object.entries(rp.trend)) merged[mo] = (merged[mo] ?? 0) + amt;
      }
    }
    return hit ? merged : null;
  };

  // ── 방문 → uid·월 매핑 ────────────────────────────────
  const visitMap = useMemo(() => {
    const m = new Map<string, { uid: string; month: string }>();
    for (const v of data.visits) m.set(v.id, { uid: v.uid, month: ym(v.date) });
    return m;
  }, [data]);

  // ── 지역장별 집계 ─────────────────────────────────────
  const perManager = useMemo(() => {
    type M = {
      uid: string; name: string; visits: number;
      customers: Map<string, number>; products: Map<string, number>;
      byMonth: Record<string, number>;
    };
    const map = new Map<string, M>();
    const ensure = (uid: string): M => {
      let m = map.get(uid);
      if (!m) {
        m = { uid, name: data.managers[uid] ?? '(미상)', visits: 0, customers: new Map(), products: new Map(), byMonth: {} };
        map.set(uid, m);
      }
      return m;
    };
    for (const v of data.visits) {
      if (!v.uid) continue;
      const m = ensure(v.uid);
      m.visits += 1;
      const mo = ym(v.date);
      m.byMonth[mo] = (m.byMonth[mo] ?? 0) + 1;
      if (v.customer) m.customers.set(v.customer, (m.customers.get(v.customer) ?? 0) + 1);
    }
    for (const p of data.products) {
      const vm = visitMap.get(p.visitId);
      if (!vm?.uid || !p.name) continue;
      const m = ensure(vm.uid);
      m.products.set(p.name, (m.products.get(p.name) ?? 0) + 1);
    }
    return [...map.values()].sort((a, b) => b.visits - a.visits);
  }, [data, visitMap]);

  // ── 방문 월 축 ────────────────────────────────────────
  const visitMonths = useMemo(() => {
    const s = new Set<string>();
    data.visits.forEach(v => { const m = ym(v.date); if (m.length === 6) s.add(m); });
    return [...s].sort();
  }, [data]);

  const [selUid, setSelUid] = useState<string>(perManager[0]?.uid ?? '');
  const sel = perManager.find(m => m.uid === selUid) ?? perManager[0];

  // ── 전체 요약 ─────────────────────────────────────────
  const totals = useMemo(() => {
    const custs = new Set<string>(); const prods = new Set<string>();
    data.visits.forEach(v => v.customer && custs.add(v.customer));
    data.products.forEach(p => p.name && prods.add(p.name));
    return { visits: data.visits.length, customers: custs.size, products: prods.size, managers: perManager.length };
  }, [data, perManager]);

  // 최근추세: 처방 월 순서에서 최근3 vs 이전3 평균 변화율
  const trendDelta = (t: Trend | null): number | null => {
    if (!t) return null;
    const vals = rxMonths.map(m => t[m] ?? 0);
    const nz = vals.filter(v => v > 0);
    if (nz.length < 4) return null;
    const recent = vals.slice(-3).filter(v => v > 0);
    const prev = vals.slice(-6, -3).filter(v => v > 0);
    if (!recent.length || !prev.length) return null;
    const ra = recent.reduce((a, b) => a + b, 0) / recent.length;
    const pa = prev.reduce((a, b) => a + b, 0) / prev.length;
    if (pa === 0) return null;
    return ((ra - pa) / pa) * 100;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      {/* 안내 */}
      <div style={note}>
        영업활동(방문) 통계와 EDI 처방실적 연계 분석 · 관리자 전용 ·
        처방 기간 {rxMonths.length ? `${mLabel(rxMonths[0])}~${mLabel(rxMonths[rxMonths.length - 1])}` : '—'} ·
        방문 기간 {visitMonths.length ? `${mLabel(visitMonths[0])}~${mLabel(visitMonths[visitMonths.length - 1])}` : '—'}
      </div>

      {/* 요약 스탯 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.7rem' }}>
        <Stat label="지역장" value={`${totals.managers}명`} />
        <Stat label="총 방문" value={`${totals.visits.toLocaleString()}건`} />
        <Stat label="방문 고객" value={`${totals.customers}개사`} />
        <Stat label="소개 품목" value={`${totals.products}개`} />
      </div>

      {/* ── 섹션 1: 지역장별 월간 활동력 ── */}
      <Section title="① 지역장별 월간 활동력" desc="지역장 × 월 방문 건수">
        <div style={{ overflowX: 'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>지역장</th>
                {visitMonths.map(m => <th key={m} style={th}>{mLabel(m)}</th>)}
                <th style={{ ...th, color: '#67e8f9' }}>합계</th>
                <th style={th}>고객</th>
                <th style={th}>품목</th>
              </tr>
            </thead>
            <tbody>
              {perManager.map(m => (
                <tr key={m.uid} style={m.uid === selUid ? { background: 'rgba(103,232,249,0.08)' } : undefined}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                    <button onClick={() => setSelUid(m.uid)} style={linkBtn}>{m.name}</button>
                  </td>
                  {visitMonths.map(mo => (
                    <td key={mo} style={td}>{m.byMonth[mo] ? m.byMonth[mo] : <span style={{ opacity: 0.25 }}>·</span>}</td>
                  ))}
                  <td style={{ ...td, color: '#67e8f9', fontWeight: 700 }}>{m.visits}</td>
                  <td style={td}>{m.customers.size}</td>
                  <td style={td}>{m.products.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 지역장 선택 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>지역장 선택</span>
        <select value={selUid} onChange={e => setSelUid(e.target.value)} style={selectStyle}>
          {perManager.map(m => (
            <option key={m.uid} value={m.uid} style={{ color: '#e2e8f0', background: '#1a2030' }}>
              {m.name} ({m.visits}건)
            </option>
          ))}
        </select>
      </div>

      {sel && (
        <>
          {/* ── 섹션 2: 반복 방문 고객 ── */}
          <Section title="② 반복 방문 고객" desc={`${sel.name} · 방문 횟수 상위 · EDI 처방 매칭 시 최근추세 표시`}>
            <RankTable
              rows={[...sel.customers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
                .map(([name, cnt]) => ({ name, cnt, trend: matchCustomer(name) }))}
              unit="회 방문" trendDelta={trendDelta} rxMonths={rxMonths} colName="고객(CSO)"
            />
          </Section>

          {/* ── 섹션 3: 소개 품목 랭킹 ── */}
          <Section title="③ 소개 품목 랭킹" desc={`${sel.name} · 소개 횟수 상위 · EDI 처방 매칭 시 최근추세 표시`}>
            <RankTable
              rows={[...sel.products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
                .map(([name, cnt]) => ({ name, cnt, trend: matchProduct(name) }))}
              unit="회 소개" trendDelta={trendDelta} rxMonths={rxMonths} colName="품목"
            />
          </Section>

          {/* ── 섹션 4: 만난 고객 처방 변화 ── */}
          <Section title="④ 만난 고객 처방 변화" desc={`${sel.name}이(가) 만난 고객 중 EDI 처방 매칭되는 CSO의 월별 처방금액(억원)`}>
            <TrendMatrix
              rxMonths={rxMonths} visitMonths={visitMonths}
              rows={[...sel.customers.keys()]
                .map(name => ({ name, cnt: sel.customers.get(name) ?? 0, trend: matchCustomer(name) }))
                .filter(r => r.trend)
                .sort((a, b) => sumTrend(b.trend!, rxMonths) - sumTrend(a.trend!, rxMonths))
                .slice(0, 15)}
              unmatched={[...sel.customers.keys()].filter(n => !matchCustomer(n)).length}
              colName="고객(CSO)"
            />
          </Section>

          {/* ── 섹션 5: 소개 품목 처방 변화 ── */}
          <Section title="⑤ 소개 품목 처방 변화" desc={`${sel.name}이(가) 소개한 품목 중 EDI 처방 매칭되는 품목의 월별 처방금액(억원)`}>
            <TrendMatrix
              rxMonths={rxMonths} visitMonths={visitMonths}
              rows={[...sel.products.keys()]
                .map(name => ({ name, cnt: sel.products.get(name) ?? 0, trend: matchProduct(name) }))
                .filter(r => r.trend)
                .sort((a, b) => sumTrend(b.trend!, rxMonths) - sumTrend(a.trend!, rxMonths))
                .slice(0, 15)}
              unmatched={[...sel.products.keys()].filter(n => !matchProduct(n)).length}
              colName="품목"
            />
          </Section>
        </>
      )}
    </div>
  );
}

function sumTrend(t: Trend, months: string[]) { return months.reduce((a, m) => a + (t[m] ?? 0), 0); }

// ── 랭킹 테이블 (섹션 2·3) ────────────────────────────
function RankTable({ rows, unit, trendDelta, rxMonths, colName }: {
  rows: { name: string; cnt: number; trend: Trend | null }[];
  unit: string; trendDelta: (t: Trend | null) => number | null; rxMonths: string[]; colName: string;
}) {
  if (!rows.length) return <Empty />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tbl}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', width: '40%' }}>{colName}</th>
            <th style={th}>{unit.includes('방문') ? '방문' : '소개'}</th>
            <th style={th}>EDI 처방</th>
            <th style={th}>최근 처방(억)</th>
            <th style={th}>최근추세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const d = trendDelta(r.trend);
            const recent = r.trend ? (r.trend[rxMonths[rxMonths.length - 1]] ?? 0) : 0;
            return (
              <tr key={r.name}>
                <td style={{ ...td, textAlign: 'left' }}>{r.name}</td>
                <td style={{ ...td, fontWeight: 700, color: '#67e8f9' }}>{r.cnt}</td>
                <td style={td}>
                  {r.trend
                    ? <span style={badge('#6ee7b7', 'rgba(52,211,153,0.14)')}>매칭</span>
                    : <span style={badge('#64748b', 'rgba(100,116,139,0.12)')}>미매칭</span>}
                </td>
                <td style={td}>{r.trend ? eok(recent) : '—'}</td>
                <td style={td}>{d == null ? '—' : <Delta v={d} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 처방 추세 매트릭스 (섹션 4·5) ─────────────────────
function TrendMatrix({ rxMonths, visitMonths, rows, unmatched, colName }: {
  rxMonths: string[]; visitMonths: string[];
  rows: { name: string; cnt: number; trend: Trend | null }[];
  unmatched: number; colName: string;
}) {
  if (!rows.length) return (
    <>
      <Empty text="EDI 처방에 매칭되는 항목이 없습니다." />
      {unmatched > 0 && <p style={{ ...noteSm, marginTop: '0.5rem' }}>미매칭 {unmatched}개는 활동 통계에만 반영됩니다.</p>}
    </>
  );
  const visitSet = new Set(visitMonths);
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', minWidth: '120px' }}>{colName}</th>
              {rxMonths.map(m => (
                <th key={m} style={{ ...th, ...(visitSet.has(m) ? { color: '#fbbf24' } : {}) }}>
                  {mLabel(m)}{visitSet.has(m) ? '★' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name}>
                <td style={{ ...td, textAlign: 'left' }}>{r.name} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>({r.cnt})</span></td>
                {rxMonths.map(m => {
                  const v = r.trend?.[m] ?? 0;
                  return <td key={m} style={{ ...td, ...(visitSet.has(m) ? { background: 'rgba(251,191,36,0.06)' } : {}) }}>
                    {v > 0 ? eok(v) : <span style={{ opacity: 0.2 }}>·</span>}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ ...noteSm, marginTop: '0.5rem' }}>
        ★ = 방문 발생 월(노랑) · 단위 억원 · 매칭 {rows.length}개
        {unmatched > 0 ? ` · 미매칭 ${unmatched}개(활동 통계만)` : ''}
      </p>
    </>
  );
}

// ── 소품 ──────────────────────────────────────────────
function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'rgba(15,20,35,0.55)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '14px', padding: '1.1rem 1.2rem' }}>
      <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: '#e2e8f0' }}>{title}</h3>
      {desc && <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.8rem', color: '#94a3b8' }}>{desc}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'rgba(15,20,35,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '12px', padding: '0.75rem 0.9rem', textAlign: 'center' }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#e2e8f0' }}>{value}</div>
    </div>
  );
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return <span style={{ color: up ? '#6ee7b7' : '#fca5a5', fontWeight: 700 }}>{up ? '▲' : '▼'} {Math.abs(v).toFixed(0)}%</span>;
}

function Empty({ text = '데이터가 없습니다.' }: { text?: string }) {
  return <p style={{ fontSize: '0.85rem', color: '#64748b', padding: '0.5rem 0' }}>{text}</p>;
}

const note: React.CSSProperties = { fontSize: '0.8rem', color: '#94a3b8', background: 'rgba(103,232,249,0.06)', border: '1px solid rgba(103,232,249,0.18)', borderRadius: '10px', padding: '0.6rem 0.8rem', lineHeight: 1.5 };
const noteSm: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b' };
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' };
const th: React.CSSProperties = { padding: '0.45rem 0.5rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid rgba(148,163,184,0.2)', whiteSpace: 'nowrap', fontSize: '0.76rem' };
const td: React.CSSProperties = { padding: '0.4rem 0.5rem', textAlign: 'center', color: '#cbd5e1', borderBottom: '1px solid rgba(148,163,184,0.08)', whiteSpace: 'nowrap' };
const selectStyle: React.CSSProperties = { padding: '0.4rem 0.7rem', borderRadius: '8px', background: '#1a2030', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.3)', fontSize: '0.85rem', fontWeight: 600 };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: 0, fontSize: '0.82rem', fontWeight: 600, minHeight: 'auto', textDecoration: 'underline' };
function badge(color: string, bg: string): React.CSSProperties {
  return { color, background: bg, padding: '0.1rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 };
}
