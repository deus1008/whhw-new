'use client';

import { useMemo, useState } from 'react';

// ── 서버에서 전달되는 데이터 ──────────────────────────────
export type SalesReportData = {
  today: string;
  visits: {
    id: string; uid: string; date: string; customer: string; type: string;
    purpose: string; productsText: string; content: string; nextAction: string; followUp: string;
  }[];
  products: { visitId: string; name: string }[];
  managers: Record<string, string>;
  byCso: { cso: string; month: string; amount: number }[];
  byProduct: { product: string; month: string; amount: number }[];
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

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
  const [selMonth, setSelMonth] = useState<string>(''); // '' = 전체 기간
  const sel = perManager.find(m => m.uid === selUid) ?? perManager[0];
  const monthLabel = selMonth ? `${mLabel(selMonth)} (${selMonth.slice(0, 4)}년 ${selMonth.slice(4, 6)}월)` : '전체 기간';

  // ── 선택 지역장 × 선택 월 활동(고객·품목) ─────────────
  const selActivity = useMemo(() => {
    const customers = new Map<string, number>();
    const products = new Map<string, number>();
    let visits = 0;
    if (!sel) return { customers, products, visits };
    const scopeVisitIds = new Set<string>();
    for (const v of data.visits) {
      if (v.uid !== sel.uid) continue;
      if (selMonth && ym(v.date) !== selMonth) continue;
      visits += 1;
      scopeVisitIds.add(v.id);
      if (v.customer) customers.set(v.customer, (customers.get(v.customer) ?? 0) + 1);
    }
    for (const p of data.products) {
      if (!scopeVisitIds.has(p.visitId) || !p.name) continue;
      products.set(p.name, (products.get(p.name) ?? 0) + 1);
    }
    return { customers, products, visits };
  }, [data, sel, selMonth]);

  // 선택 지역장이 실제 방문한 월(월 선택지)
  const selManagerMonths = useMemo(
    () => (sel ? Object.keys(sel.byMonth).filter(m => m.length === 6).sort() : []),
    [sel],
  );

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

  const today = data.today || new Date().toISOString().slice(0, 10);

  // ── 지역장별 효과성 상세(전 기간) ─────────────────────
  type Cust = { name: string; type: string; dates: string[] };
  type MgrM = {
    uid: string; name: string; visits: number;
    custs: Map<string, Cust>; days: Map<string, number>;
    followUp: number; nextAction: number; purpose: number;
    plannedTotal: number; plannedMet: number;
  };
  const mgr = useMemo(() => {
    const map = new Map<string, MgrM>();
    const ensure = (uid: string): MgrM => {
      let m = map.get(uid);
      if (!m) { m = { uid, name: data.managers[uid] ?? '(미상)', visits: 0, custs: new Map(), days: new Map(), followUp: 0, nextAction: 0, purpose: 0, plannedTotal: 0, plannedMet: 0 }; map.set(uid, m); }
      return m;
    };
    for (const v of data.visits) {
      if (!v.uid) continue;
      const m = ensure(v.uid);
      m.visits++;
      m.days.set(v.date, (m.days.get(v.date) ?? 0) + 1);
      if (v.followUp) m.followUp++;
      if (v.nextAction.trim()) m.nextAction++;
      if (v.purpose.trim()) m.purpose++;
      if (!m.custs.has(v.customer)) m.custs.set(v.customer, { name: v.customer, type: v.type, dates: [] });
      m.custs.get(v.customer)!.dates.push(v.date);
    }
    // 사전 계획(follow_up_date) 이행: 계획 이후 같은 거래처를 실제 재방문했는지
    for (const v of data.visits) {
      if (!v.uid || !v.followUp) continue;
      const m = map.get(v.uid); if (!m) continue;
      m.plannedTotal++;
      const dates = m.custs.get(v.customer)?.dates ?? [];
      if (dates.some(d => d > v.date && d >= v.followUp)) m.plannedMet++;
    }
    return map;
  }, [data]);

  const NEGLECT_DAYS = 45;
  const kpis = useMemo(() => {
    const out = [] as {
      uid: string; name: string; visits: number; custCount: number; repeat: number; once: number;
      top5Share: number; avgInterval: number | null; neglected: number; activeDays: number;
      perDay: number; maxPerDay: number; planRate: number; planMetRate: number | null; issue: number;
    }[];
    for (const m of mgr.values()) {
      if (m.visits === 0) continue;
      const cs = [...m.custs.values()];
      const repeat = cs.filter(c => c.dates.length > 1).length;
      const top5 = cs.map(c => c.dates.length).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
      const intervals = cs.filter(c => c.dates.length > 1).map(c => { const s = [...c.dates].sort(); return daysBetween(s[0], s[s.length - 1]) / (c.dates.length - 1); });
      const avgInterval = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null;
      const neglected = cs.filter(c => { const s = [...c.dates].sort(); return daysBetween(s[s.length - 1], today) > NEGLECT_DAYS; }).length;
      const issue = cs.filter(c => { const t = matchCustomer(c.name); const d = t ? trendDelta(t) : null; return d != null && d < 0; }).length;
      out.push({
        uid: m.uid, name: m.name, visits: m.visits, custCount: cs.length, repeat, once: cs.length - repeat,
        top5Share: m.visits ? (top5 / m.visits) * 100 : 0, avgInterval, neglected,
        activeDays: m.days.size, perDay: m.days.size ? m.visits / m.days.size : 0, maxPerDay: Math.max(0, ...[...m.days.values()]),
        planRate: m.visits ? (m.followUp / m.visits) * 100 : 0, planMetRate: m.plannedTotal ? (m.plannedMet / m.plannedTotal) * 100 : null, issue,
      });
    }
    return out.sort((a, b) => b.visits - a.visits);
  }, [mgr, csoTrend, rxMonths, today]);

  // 선택 지역장 심화(전 기간)
  const selM = mgr.get(selUid);
  const selCadence = useMemo(() => {
    if (!selM) return [];
    return [...selM.custs.values()].map(c => {
      const s = [...c.dates].sort();
      const interval = c.dates.length > 1 ? Math.round(daysBetween(s[0], s[s.length - 1]) / (c.dates.length - 1)) : null;
      return { name: c.name, type: c.type, visits: c.dates.length, first: s[0], last: s[s.length - 1], interval, since: daysBetween(s[s.length - 1], today) };
    }).sort((a, b) => b.since - a.since);
  }, [selM, today]);

  const selIssue = useMemo(() => {
    if (!selM) return [];
    return [...selM.custs.values()].map(c => {
      const t = matchCustomer(c.name);
      const d = t ? trendDelta(t) : null;
      const vs = data.visits.filter(v => v.uid === selUid && v.customer === c.name).sort((a, b) => (a.date < b.date ? 1 : -1));
      const s = [...c.dates].sort();
      const lv = vs[0];
      return { name: c.name, delta: d, since: daysBetween(s[s.length - 1], today), last: s[s.length - 1], purpose: lv?.purpose ?? '', content: lv?.content ?? '', products: lv?.productsText ?? '' };
    }).filter(r => r.delta != null && r.delta < 0).sort((a, b) => (a.delta! - b.delta!));
  }, [selM, selUid, csoTrend, rxMonths, today]);

  const selKpi = kpis.find(k => k.uid === selUid);

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

      {/* ── 섹션 0: 지역장 효과성 요약 ── */}
      <Section title="⭐ 지역장 영업활동 효과성 요약" desc={`전 기간 · 커버리지·방문주기·편중도·계획성·이슈 대응 (기준일 ${today}) · 지역장명 클릭 시 상세`}>
        <div className="resp-table" style={{ overflowX: 'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>지역장</th>
                <th style={th} title="담당(방문) 거래처 수">거래처</th>
                <th style={th} title="반복 방문 / 1회만 방문">반복·1회</th>
                <th style={th} title="상위 5개 거래처가 전체 방문에서 차지하는 비중(높을수록 편중)">상위5집중</th>
                <th style={th} title="반복 거래처 평균 방문 간격">평균주기</th>
                <th style={th} title={`마지막 방문 ${NEGLECT_DAYS}일 초과 경과 거래처`}>방치</th>
                <th style={th} title="방문한 날 수 / 하루 평균 방문 / 하루 최다">활동일·밀도</th>
                <th style={th} title="다음방문 예정일(follow-up) 작성 비율">계획성</th>
                <th style={th} title="계획된 재방문 실제 이행률">계획이행</th>
                <th style={th} title="EDI 처방 하락(이슈) 거래처 수">이슈처</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map(k => (
                <tr key={k.uid} style={k.uid === selUid ? { background: 'rgba(103,232,249,0.08)' } : undefined}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                    <button onClick={() => { setSelUid(k.uid); setSelMonth(''); }} style={linkBtn}>{k.name}</button>
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: '#0891b2' }}>{k.custCount}</td>
                  <td style={td}>{k.repeat}·<span style={{ color: k.once > k.repeat ? '#dc2626' : '#64748b' }}>{k.once}</span></td>
                  <td style={{ ...td, color: k.top5Share >= 40 ? '#dc2626' : '#111827', fontWeight: k.top5Share >= 40 ? 700 : 400 }}>{k.top5Share.toFixed(0)}%</td>
                  <td style={td}>{k.avgInterval == null ? '—' : `${k.avgInterval.toFixed(0)}일`}</td>
                  <td style={{ ...td, color: k.neglected > 0 ? '#c2410c' : '#64748b', fontWeight: k.neglected > 0 ? 700 : 400 }}>{k.neglected}</td>
                  <td style={td}>{k.activeDays}일 · {k.perDay.toFixed(1)}/일 · 최다{k.maxPerDay}</td>
                  <td style={{ ...td, color: k.planRate < 20 ? '#dc2626' : '#111827' }}>{k.planRate.toFixed(0)}%</td>
                  <td style={td}>{k.planMetRate == null ? '—' : `${k.planMetRate.toFixed(0)}%`}</td>
                  <td style={{ ...td, color: k.issue > 0 ? '#dc2626' : '#64748b', fontWeight: k.issue > 0 ? 700 : 400 }}>{k.issue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="resp-cards">
          {kpis.map(k => (
            <div key={k.uid} className="mcard">
              <div className="mcard-head">
                <button onClick={() => { setSelUid(k.uid); setSelMonth(''); }} style={linkBtn}>{k.name}</button>
                <span className="mcard-badge" style={{ color: '#0891b2', background: 'rgba(8,145,178,0.1)' }}>거래처 {k.custCount}</span>
              </div>
              <div className="mcard-row"><span className="mcard-k">반복·1회</span><span className="mcard-v">{k.repeat} · {k.once}</span></div>
              <div className="mcard-row"><span className="mcard-k">상위5 집중</span><span className="mcard-v" style={{ color: k.top5Share >= 40 ? '#dc2626' : undefined }}>{k.top5Share.toFixed(0)}%</span></div>
              <div className="mcard-row"><span className="mcard-k">평균 방문주기</span><span className="mcard-v">{k.avgInterval == null ? '—' : `${k.avgInterval.toFixed(0)}일`}</span></div>
              <div className="mcard-row"><span className="mcard-k">방치({NEGLECT_DAYS}일+)</span><span className="mcard-v" style={{ color: k.neglected > 0 ? '#c2410c' : undefined }}>{k.neglected}</span></div>
              <div className="mcard-row"><span className="mcard-k">활동일·밀도</span><span className="mcard-v">{k.activeDays}일 · {k.perDay.toFixed(1)}/일</span></div>
              <div className="mcard-row"><span className="mcard-k">계획성·이행</span><span className="mcard-v">{k.planRate.toFixed(0)}% · {k.planMetRate == null ? '—' : `${k.planMetRate.toFixed(0)}%`}</span></div>
              <div className="mcard-row"><span className="mcard-k">이슈처(처방↓)</span><span className="mcard-v" style={{ color: k.issue > 0 ? '#dc2626' : undefined }}>{k.issue}</span></div>
            </div>
          ))}
        </div>
        <p style={{ ...noteSm, marginTop: '0.6rem' }}>
          · <b>상위5집중 40%↑</b>=특정 거래처 편중, <b>1회 방문&gt;반복</b>=넓고 얕은 커버리지, <b>방치</b>=마지막 방문 {NEGLECT_DAYS}일 초과, <b>계획성</b>=다음방문일 작성률, <b>이슈처</b>=EDI 처방 하락 거래처. 거래처(CSO법인·딜러)엔 지역정보가 없어 지역분포·지리적 동선효율은 별도 지역 데이터 추가 후 제공 가능합니다.
        </p>
      </Section>

      {/* ── 섹션 1: 지역장별 월간 활동력 ── */}
      <Section title="① 지역장별 월간 활동력" desc="지역장 × 월 방문 건수">
        <div className="resp-table" style={{ overflowX: 'auto' }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>지역장</th>
                {visitMonths.map(m => <th key={m} style={th}>{mLabel(m)}</th>)}
                <th style={{ ...th, color: '#0891b2' }}>합계</th>
                <th style={th}>고객</th>
                <th style={th}>품목</th>
              </tr>
            </thead>
            <tbody>
              {perManager.map(m => (
                <tr key={m.uid} style={m.uid === selUid ? { background: 'rgba(103,232,249,0.08)' } : undefined}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                    <button onClick={() => { setSelUid(m.uid); setSelMonth(''); }} style={linkBtn}>{m.name}</button>
                  </td>
                  {visitMonths.map(mo => {
                    const active = m.uid === selUid && mo === selMonth;
                    const hasVal = !!m.byMonth[mo];
                    return (
                      <td key={mo}
                        onClick={() => { setSelUid(m.uid); setSelMonth(hasVal ? mo : ''); }}
                        title={hasVal ? `${m.name} · ${mLabel(mo)} 활동 보기` : undefined}
                        style={{ ...td, cursor: 'pointer', ...(active ? { background: 'rgba(180,83,9,0.14)', fontWeight: 700, color: '#b45309' } : {}) }}>
                        {hasVal ? m.byMonth[mo] : <span style={{ opacity: 0.25 }}>·</span>}
                      </td>
                    );
                  })}
                  <td style={{ ...td, color: '#0891b2', fontWeight: 700 }}>{m.visits}</td>
                  <td style={td}>{m.customers.size}</td>
                  <td style={td}>{m.products.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="resp-cards">
          {perManager.map(m => (
            <div key={m.uid} className="mcard">
              <div className="mcard-head">
                <button onClick={() => setSelUid(m.uid)} style={linkBtn}>{m.name}</button>
                <span className="mcard-badge" style={{ color: '#0891b2', background: 'rgba(8,145,178,0.1)' }}>합계 {m.visits}</span>
              </div>
              {visitMonths.map(mo => {
                const active = m.uid === selUid && mo === selMonth;
                return (
                  <div key={mo} className="mcard-row" onClick={() => { setSelUid(m.uid); setSelMonth(mo); }}
                    style={{ cursor: 'pointer', ...(active ? { background: 'rgba(180,83,9,0.1)' } : {}) }}>
                    <span className="mcard-k" style={active ? { color: '#b45309', fontWeight: 700 } : undefined}>{mLabel(mo)}</span>
                    <span className="mcard-v">{m.byMonth[mo] ? m.byMonth[mo] : '·'}</span>
                  </div>
                );
              })}
              <div className="mcard-row"><span className="mcard-k">고객</span><span className="mcard-v">{m.customers.size}</span></div>
              <div className="mcard-row"><span className="mcard-k">품목</span><span className="mcard-v">{m.products.size}</span></div>
            </div>
          ))}
        </div>
      </Section>

      {/* 지역장·월 선택 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>지역장 선택</span>
        <select value={selUid} onChange={e => { setSelUid(e.target.value); setSelMonth(''); }} style={selectStyle}>
          {perManager.map(m => (
            <option key={m.uid} value={m.uid} style={{ color: '#111827', background: '#ffffff' }}>
              {m.name} ({m.visits}건)
            </option>
          ))}
        </select>
        <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600, marginLeft: '0.4rem' }}>분석 월</span>
        <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={selectStyle}>
          <option value="" style={{ color: '#111827', background: '#ffffff' }}>전체 기간</option>
          {selManagerMonths.map(mo => (
            <option key={mo} value={mo} style={{ color: '#111827', background: '#ffffff' }}>
              {mo.slice(0, 4)}년 {mo.slice(4, 6)}월 ({sel?.byMonth[mo] ?? 0}건)
            </option>
          ))}
        </select>
        {selMonth && (
          <button onClick={() => setSelMonth('')} style={{ ...linkBtn, textDecoration: 'none', color: '#b45309' }}>✕ 월 필터 해제</button>
        )}
        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
          {sel?.name} · {monthLabel} · 방문 {selActivity.visits}건 · 고객 {selActivity.customers.size} · 품목 {selActivity.products.size}
        </span>
      </div>

      {sel && (
        <>
          {/* ── 섹션 2: 반복 방문 고객 ── */}
          <Section title="② 반복 방문 고객" desc={`${sel.name} · ${monthLabel} · 방문 횟수 상위 · EDI 처방 매칭 시 최근추세 표시`}>
            <RankTable
              rows={[...selActivity.customers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
                .map(([name, cnt]) => ({ name, cnt, trend: matchCustomer(name) }))}
              unit="회 방문" trendDelta={trendDelta} rxMonths={rxMonths} colName="고객(CSO)"
            />
          </Section>

          {/* ── 섹션 3: 소개 품목 랭킹 ── */}
          <Section title="③ 소개 품목 랭킹" desc={`${sel.name} · ${monthLabel} · 소개 횟수 상위 · EDI 처방 매칭 시 최근추세 표시`}>
            <RankTable
              rows={[...selActivity.products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
                .map(([name, cnt]) => ({ name, cnt, trend: matchProduct(name) }))}
              unit="회 소개" trendDelta={trendDelta} rxMonths={rxMonths} colName="품목"
            />
          </Section>

          {/* ── 섹션 4: 만난 고객 처방 변화 ── */}
          <Section title="④ 만난 고객 처방 변화" desc={`${sel.name}이(가) ${monthLabel}에 만난 고객 중 EDI 처방 매칭되는 CSO의 월별 처방금액(억원)`}>
            <TrendMatrix
              rxMonths={rxMonths} visitMonths={selMonth ? [selMonth] : visitMonths}
              rows={[...selActivity.customers.keys()]
                .map(name => ({ name, cnt: selActivity.customers.get(name) ?? 0, trend: matchCustomer(name) }))
                .filter(r => r.trend)
                .sort((a, b) => sumTrend(b.trend!, rxMonths) - sumTrend(a.trend!, rxMonths))
                .slice(0, 15)}
              unmatched={[...selActivity.customers.keys()].filter(n => !matchCustomer(n)).length}
              colName="고객(CSO)"
            />
          </Section>

          {/* ── 섹션 5: 소개 품목 처방 변화 ── */}
          <Section title="⑤ 소개 품목 처방 변화" desc={`${sel.name}이(가) ${monthLabel}에 소개한 품목 중 EDI 처방 매칭되는 품목의 월별 처방금액(억원)`}>
            <TrendMatrix
              rxMonths={rxMonths} visitMonths={selMonth ? [selMonth] : visitMonths}
              rows={[...selActivity.products.keys()]
                .map(name => ({ name, cnt: selActivity.products.get(name) ?? 0, trend: matchProduct(name) }))
                .filter(r => r.trend)
                .sort((a, b) => sumTrend(b.trend!, rxMonths) - sumTrend(a.trend!, rxMonths))
                .slice(0, 15)}
              unmatched={[...selActivity.products.keys()].filter(n => !matchProduct(n)).length}
              colName="품목"
            />
          </Section>

          {/* ── 섹션 6: 거래처 방문주기 & 방치 진단 (전 기간) ── */}
          <Section title="⑥ 거래처 방문주기 · 방치 진단" desc={`${sel.name} · 전 기간 · 거래처별 방문 간격과 마지막 방문 경과 (경과일 오래된 순)`}>
            {selKpi && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.7rem', fontSize: '0.78rem', color: '#334155' }}>
                <span style={pill}>담당 거래처 <b>{selKpi.custCount}</b></span>
                <span style={pill}>반복 <b>{selKpi.repeat}</b> · 1회 <b style={{ color: selKpi.once > selKpi.repeat ? '#dc2626' : '#111827' }}>{selKpi.once}</b></span>
                <span style={pill}>상위5 집중 <b style={{ color: selKpi.top5Share >= 40 ? '#dc2626' : '#111827' }}>{selKpi.top5Share.toFixed(0)}%</b></span>
                <span style={pill}>평균 방문주기 <b>{selKpi.avgInterval == null ? '—' : `${selKpi.avgInterval.toFixed(0)}일`}</b></span>
                <span style={pill}>방치({NEGLECT_DAYS}일+) <b style={{ color: selKpi.neglected > 0 ? '#c2410c' : '#111827' }}>{selKpi.neglected}</b></span>
              </div>
            )}
            <div className="resp-table" style={{ overflowX: 'auto' }}>
              <table style={tbl}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>거래처</th>
                    <th style={th}>유형</th>
                    <th style={th}>방문</th>
                    <th style={th}>평균주기</th>
                    <th style={th}>첫 방문</th>
                    <th style={th}>마지막</th>
                    <th style={th}>경과일</th>
                  </tr>
                </thead>
                <tbody>
                  {selCadence.slice(0, 40).map(c => (
                    <tr key={c.name} style={c.since > NEGLECT_DAYS ? { background: 'rgba(251,146,60,0.07)' } : undefined}>
                      <td style={{ ...td, textAlign: 'left', color: '#111827' }}>{c.name}</td>
                      <td style={td}>{c.type}</td>
                      <td style={{ ...td, fontWeight: 700, color: '#0891b2' }}>{c.visits}</td>
                      <td style={td}>{c.interval == null ? <span style={{ opacity: 0.5 }}>1회</span> : `${c.interval}일`}</td>
                      <td style={td}>{c.first?.slice(2)}</td>
                      <td style={td}>{c.last?.slice(2)}</td>
                      <td style={{ ...td, fontWeight: 700, color: c.since > NEGLECT_DAYS ? '#c2410c' : '#64748b' }}>{c.since}일</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="resp-cards">
              {selCadence.slice(0, 40).map(c => (
                <div key={c.name} className="mcard" style={c.since > NEGLECT_DAYS ? { borderColor: 'rgba(251,146,60,0.4)' } : undefined}>
                  <div className="mcard-head"><span className="mcard-title">{c.name}</span><span className="mcard-sub">{c.type}</span></div>
                  <div className="mcard-row"><span className="mcard-k">방문·주기</span><span className="mcard-v">{c.visits}회 · {c.interval == null ? '1회' : `${c.interval}일`}</span></div>
                  <div className="mcard-row"><span className="mcard-k">마지막·경과</span><span className="mcard-v" style={{ color: c.since > NEGLECT_DAYS ? '#c2410c' : undefined }}>{c.last?.slice(2)} · {c.since}일</span></div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 섹션 7: 사전 계획성 & 이행 (전 기간) ── */}
          <Section title="⑦ 사전 계획성 · 후속 이행" desc={`${sel.name} · 전 기간 · 다음방문 예정일(follow-up)·후속조치 작성과 실제 이행`}>
            {selKpi && selM ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem' }}>
                <MiniStat label="계획성(다음방문일 작성)" value={`${selKpi.planRate.toFixed(0)}%`} tone={selKpi.planRate < 20 ? 'bad' : 'ok'} sub={`${selM.followUp}/${selM.visits}건`} />
                <MiniStat label="계획 재방문 이행률" value={selKpi.planMetRate == null ? '—' : `${selKpi.planMetRate.toFixed(0)}%`} tone={selKpi.planMetRate != null && selKpi.planMetRate < 50 ? 'bad' : 'ok'} sub={`${selM.plannedMet}/${selM.plannedTotal}건 이행`} />
                <MiniStat label="후속조치 작성" value={`${selM.visits ? Math.round((selM.nextAction / selM.visits) * 100) : 0}%`} tone="neutral" sub={`${selM.nextAction}/${selM.visits}건`} />
                <MiniStat label="방문목적 작성" value={`${selM.visits ? Math.round((selM.purpose / selM.visits) * 100) : 0}%`} tone="neutral" sub={`${selM.purpose}/${selM.visits}건`} />
              </div>
            ) : <Empty />}
            <p style={{ ...noteSm, marginTop: '0.6rem' }}>계획성=다음 방문 예정일을 남긴 비율(사전 계획성 지표) · 이행률=예정일 이후 해당 거래처를 실제 재방문한 비율.</p>
          </Section>

          {/* ── 섹션 8: 이슈 거래처(처방 하락) 대응 ── */}
          <Section title="⑧ 이슈 거래처(처방 하락) 대응 메시지" desc={`${sel.name} · EDI 처방 최근추세 하락 거래처의 최근 방문 메시지(목적·내용·소개품목)`}>
            {selIssue.length === 0 ? (
              <Empty text="처방 하락(이슈)으로 매칭되는 거래처가 없습니다." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {selIssue.slice(0, 15).map(r => (
                  <div key={r.name} style={{ border: '1px solid rgba(220,38,38,0.18)', background: 'rgba(220,38,38,0.03)', borderRadius: 10, padding: '0.7rem 0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#111827' }}>{r.name}</span>
                      <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.78rem' }}>
                        <Delta v={r.delta!} />
                        <span style={{ color: r.since > NEGLECT_DAYS ? '#c2410c' : '#64748b' }}>최근방문 {r.last?.slice(2)} ({r.since}일 전)</span>
                      </span>
                    </div>
                    {r.purpose && <div style={{ fontSize: '0.79rem', color: '#334155', marginTop: '0.35rem' }}><b style={{ color: '#0891b2' }}>목적</b> {r.purpose}</div>}
                    {r.content && <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.2rem', whiteSpace: 'pre-wrap' }}><b style={{ color: '#7c3aed' }}>내용</b> {r.content}</div>}
                    {r.products && <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.2rem' }}><b style={{ color: '#b45309' }}>소개품목</b> {r.products}</div>}
                  </div>
                ))}
              </div>
            )}
            <p style={{ ...noteSm, marginTop: '0.6rem' }}>처방 하락 거래처에 <b>어떤 메시지로 방문했는지</b>를 최근 방문 기록으로 확인합니다. 경과일이 큰 하락처는 즉시 대응이 필요합니다.</p>
          </Section>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'ok' | 'bad' | 'neutral' }) {
  const color = tone === 'bad' ? '#dc2626' : tone === 'ok' ? '#059669' : '#111827';
  return (
    <div style={{ background: '#ffffff', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10, padding: '0.6rem 0.7rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.1rem' }}>{sub}</div>}
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
  const unitLabel = unit.includes('방문') ? '방문' : '소개';
  return (
    <>
      <div className="resp-table" style={{ overflowX: 'auto' }}>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', width: '40%' }}>{colName}</th>
              <th style={th}>{unitLabel}</th>
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
                  <td style={{ ...td, fontWeight: 700, color: '#0891b2' }}>{r.cnt}</td>
                  <td style={td}>
                    {r.trend
                      ? <span style={badge('#059669', 'rgba(52,211,153,0.14)')}>매칭</span>
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

      <div className="resp-cards">
        {rows.map(r => {
          const d = trendDelta(r.trend);
          const recent = r.trend ? (r.trend[rxMonths[rxMonths.length - 1]] ?? 0) : 0;
          return (
            <div key={r.name} className="mcard">
              <div className="mcard-head">
                <span className="mcard-title">{r.name}</span>
                {r.trend
                  ? <span style={badge('#059669', 'rgba(52,211,153,0.14)')}>매칭</span>
                  : <span style={badge('#64748b', 'rgba(100,116,139,0.12)')}>미매칭</span>}
              </div>
              <div className="mcard-row"><span className="mcard-k">{unitLabel}</span><span className="mcard-v" style={{ color: '#0891b2' }}>{r.cnt}</span></div>
              <div className="mcard-row"><span className="mcard-k">최근 처방(억)</span><span className="mcard-v">{r.trend ? eok(recent) : '—'}</span></div>
              <div className="mcard-row"><span className="mcard-k">최근추세</span><span className="mcard-v">{d == null ? '—' : <Delta v={d} />}</span></div>
            </div>
          );
        })}
      </div>
    </>
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
      <div className="resp-table" style={{ overflowX: 'auto' }}>
        <table style={tbl}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', minWidth: '120px' }}>{colName}</th>
              {rxMonths.map(m => (
                <th key={m} style={{ ...th, ...(visitSet.has(m) ? { color: '#b45309' } : {}) }}>
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

      <div className="resp-cards">
        {rows.map(r => (
          <div key={r.name} className="mcard">
            <div className="mcard-head">
              <span className="mcard-title">{r.name}</span>
              <span className="mcard-sub">({r.cnt})</span>
            </div>
            {rxMonths.map(m => {
              const v = r.trend?.[m] ?? 0;
              return (
                <div key={m} className="mcard-row" style={visitSet.has(m) ? { background: 'rgba(251,191,36,0.08)' } : undefined}>
                  <span className="mcard-k" style={visitSet.has(m) ? { color: '#b45309' } : undefined}>{mLabel(m)}{visitSet.has(m) ? '★' : ''}</span>
                  <span className="mcard-v">{v > 0 ? eok(v) : '·'}</span>
                </div>
              );
            })}
          </div>
        ))}
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
    <section style={{ background: '#f8fafc', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '14px', padding: '1.1rem 1.2rem' }}>
      <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: '#111827' }}>{title}</h3>
      {desc && <p style={{ margin: '0.25rem 0 0.9rem', fontSize: '0.8rem', color: '#94a3b8' }}>{desc}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '12px', padding: '0.75rem 0.9rem', textAlign: 'center' }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827' }}>{value}</div>
    </div>
  );
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return <span style={{ color: up ? '#059669' : '#dc2626', fontWeight: 700 }}>{up ? '▲' : '▼'} {Math.abs(v).toFixed(0)}%</span>;
}

function Empty({ text = '데이터가 없습니다.' }: { text?: string }) {
  return <p style={{ fontSize: '0.85rem', color: '#64748b', padding: '0.5rem 0' }}>{text}</p>;
}

const note: React.CSSProperties = { fontSize: '0.8rem', color: '#94a3b8', background: 'rgba(103,232,249,0.06)', border: '1px solid rgba(103,232,249,0.18)', borderRadius: '10px', padding: '0.6rem 0.8rem', lineHeight: 1.5 };
const noteSm: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b' };
const pill: React.CSSProperties = { background: '#ffffff', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 999, padding: '0.2rem 0.7rem' };
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' };
const th: React.CSSProperties = { padding: '0.45rem 0.5rem', textAlign: 'center', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid rgba(148,163,184,0.2)', whiteSpace: 'nowrap', fontSize: '0.76rem' };
const td: React.CSSProperties = { padding: '0.4rem 0.5rem', textAlign: 'center', color: '#64748b', borderBottom: '1px solid rgba(148,163,184,0.08)', whiteSpace: 'nowrap' };
const selectStyle: React.CSSProperties = { padding: '0.4rem 0.7rem', borderRadius: '8px', background: '#ffffff', color: '#111827', border: '1px solid rgba(148,163,184,0.3)', fontSize: '0.85rem', fontWeight: 600 };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '0.82rem', fontWeight: 600, minHeight: 'auto', textDecoration: 'underline' };
function badge(color: string, bg: string): React.CSSProperties {
  return { color, background: bg, padding: '0.1rem 0.5rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 };
}
