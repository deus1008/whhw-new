'use client';

import { useState, useEffect, useCallback } from 'react';
import { DRUG_FORMS, type DrugForm } from '@/lib/drug-form';

type FormFilter = 'all' | DrugForm;

/** 성분 설명 — 식약처 허가 효능효과 기반 요약(ingredient_info) */
type IngredientInfo = { description: string; drug_class: string | null; grounded: boolean };

const FORM_COLOR: Record<string, { border: string; bg: string; fg: string }> = {
  all:    { border: 'rgba(147,197,253,0.4)', bg: 'rgba(147,197,253,0.12)', fg: '#93c5fd' },
  정제:   { border: 'rgba(110,231,183,0.4)', bg: 'rgba(110,231,183,0.12)', fg: '#6ee7b7' },
  캡슐제: { border: 'rgba(251,191,36,0.4)',  bg: 'rgba(251,191,36,0.12)',  fg: '#fbbf24' },
  주사제: { border: 'rgba(244,114,182,0.4)', bg: 'rgba(244,114,182,0.12)', fg: '#f472b6' },
  기타:   { border: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.7)' },
};

/* ── 타입 ── */
type SubItem   = { sub: string; ingredients: string[] };
type GroupItem = { group: string; subs: SubItem[] };

type DrugItem = {
  id: number | null;
  disease_group: string;
  sub_category: string | null;
  treatment_class: string | null;
  ingredient_name: string | null;
  strength: string | null;        // 4단계: 함량 (예: 10mg, 5mg/10mg)
  product_name: string | null;
  manufacturer: string | null;    // 제조사(제조원)
  distributor: string | null;     // 판매사(허가업체)
  standard: string | null;
  pay_type: string | null;
  is_original: boolean;
  mechanism: string | null;
  note: string | null;
  atc_code: string | null;
  atc_name: string | null;
  max_price: number | null;
  reference_drug: string | null;
  permit_kind: string | null;
  approval_date: string | null;
  ubist_monthly: Record<string, number> | null; // period('YYYY-MM') → amount
  commission_rate: number | null;
  form?: DrugForm;         // 제형 (정제/캡슐제/주사제/기타)
  from_price_db?: boolean; // drug_prices 테이블에서 보강된 항목
};

/* ── 유틸 ── */
// 처방액 표시: 천원 단위(원 → ÷1000 반올림, 콤마)
function fmtThousand(n: number | null): string {
  if (n == null) return '-';
  return Math.round(n / 1000).toLocaleString();
}
function fmtPrice(n: number | null): string {
  if (n == null) return '-';
  return n.toLocaleString() + '원';
}
function fmtPeriod(p: string): string {
  // '2026-05' → '26.05'
  const [yr, mo] = p.split('-');
  return `${yr.slice(2)}.${mo}`;
}

/* 열 고정폭(px) — 자동폭 실측값 기준 조정 */
const PROD_W  = 190;  // 제품명: 319 → 70% → 85%
const GUBUN_W = 85;   // 구분:    65 → 130% (제네릭 뱃지 줄바꿈 방지)
const DOSE_W  = 60;   // 함량

/* 숫자 열 — 데이터 실폭에 맞춘 고정폭. 헤더 그룹화 + 좁은 좌우 패딩 기준 */
const PRICE_W = 74;   // 약가(상한): 최대 "12,345원"
const RATE_W  = 68;   // 수수료율:   최대 "100.0%"
const UBIST_W = 58;   // 처방액 월별: 최대 6자리 + 콤마

/**
 * table-layout:fixed 에서 폭을 지정하지 않은 열은 남는 폭을 균등하게 나눠 갖는다.
 * 판매사·제조사만 폭을 비워 두어, 숫자 열에서 줄인 만큼을 두 열이 정확히 반씩 흡수한다.
 * (좁은 화면에서는 아래 minWidth 까지만 줄고 그 아래로는 가로 스크롤)
 */
const MFR_MIN = 90;
function tableMinWidth(monthCount: number): number {
  return PROD_W + DOSE_W + GUBUN_W + PRICE_W + RATE_W + monthCount * UBIST_W + MFR_MIN * 2;
}

/* 처방액 합계(정렬용) */
function ubistSum(d: DrugItem): number {
  return Object.values(d.ubist_monthly ?? {}).reduce((a, b) => a + b, 0);
}

/* ── 헤더 클릭 정렬 ── */
type SortKey = 'product' | 'strength' | 'distributor' | 'manufacturer' | 'orig' | 'price' | 'rate' | 'ubist';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;   // null = 기본 정렬

const SORT_OF: Record<string, SortKey> = {
  '제품명': 'product', '함량': 'strength', '판매사': 'distributor', '제조사': 'manufacturer',
  '구분': 'orig', '약가(상한)': 'price', '수수료율': 'rate',
};
const ko = (s: string | null) => (s ?? '').localeCompare('', 'ko') === 0 ? '' : (s ?? '');

/** 정렬 비교기 — 지정 키 우선, 동률이면 기본 규칙(함량→오리지널→약가→처방액)으로 폴백 */
function cmpBy(key: SortKey, dir: 'asc' | 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return (a: DrugItem, b: DrugItem): number => {
    let r = 0;
    switch (key) {
      case 'product':      r = ko(a.product_name).localeCompare(ko(b.product_name), 'ko'); break;
      case 'strength':     r = cmpStrength(a.strength, b.strength); break;
      case 'distributor':  r = ko(a.distributor).localeCompare(ko(b.distributor), 'ko'); break;
      case 'manufacturer': r = ko(a.manufacturer).localeCompare(ko(b.manufacturer), 'ko'); break;
      case 'orig':         r = Number(b.is_original) - Number(a.is_original); break;
      case 'price':        r = (a.max_price ?? -1) - (b.max_price ?? -1); break;
      case 'rate':         r = (a.commission_rate ?? -1) - (b.commission_rate ?? -1); break;
      case 'ubist':        r = ubistSum(a) - ubistSum(b); break;
    }
    if (r !== 0) return r * sign;
    return defaultCmp(a, b);
  };
}

/** 기본 정렬: 함량 오름차순 → 오리지널 먼저 → 약가 높은순 → 처방액 높은순 → 제품명 */
function defaultCmp(a: DrugItem, b: DrugItem): number {
  return (
    cmpStrength(a.strength, b.strength) ||
    (Number(b.is_original) - Number(a.is_original)) ||
    ((b.max_price ?? -1) - (a.max_price ?? -1)) ||
    (ubistSum(b) - ubistSum(a)) ||
    ko(a.product_name).localeCompare(ko(b.product_name), 'ko')
  );
}

/* ── 함량 비교: "10mg" → [10], "5mg/10mg" → [5,10] (숫자 오름차순) ── */
function strengthNums(s: string | null): number[] {
  return (s ?? '').split('/').map(x => parseFloat(x) || 0);
}
function cmpStrength(a: string | null, b: string | null): number {
  const A = strengthNums(a), B = strengthNums(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] ?? 0) - (B[i] ?? 0);
    if (d) return d;
  }
  return 0;
}


export default function DiseaseLearningClient({ groups }: { groups: GroupItem[] }) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    groups.length > 0 ? groups[0].group : null
  );
  // null = 질환군 전체(1단계 선택 상태). 중분류를 고르면 그때 좁혀진다.
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const [selectedIngr, setSelectedIngr] = useState<string | null>(null);       // 3단계: 성분
  const [selectedStrength, setSelectedStrength] = useState<string | null>(null); // 4단계: 함량
  const [openIngrs, setOpenIngrs] = useState<Set<string>>(new Set());            // 4단계 펼침
  const [sort, setSort] = useState<SortState>(null);                             // 헤더 클릭 정렬

  /** 헤더 클릭: 미정렬 → asc → desc → 기본 */
  function toggleSort(key: SortKey) {
    setSort(prev =>
      !prev || prev.key !== key ? { key, dir: 'asc' }
      : prev.dir === 'asc' ? { key, dir: 'desc' }
      : null,
    );
  }
  // 펼침 상태 — 선택과 분리(접어도 보고 있는 목록은 그대로 유지)
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(groups.length > 0 ? [groups[0].group] : []),
  );
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const [drugs, setDrugs] = useState<DrugItem[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FormFilter>('all');
  const [search, setSearch] = useState('');
  const [infoMap, setInfoMap] = useState<Record<string, IngredientInfo>>({});

  const currentGroup = groups.find(g => g.group === selectedGroup);

  const fetchDrugs = useCallback(async (group: string, sub: string | null) => {
    setLoading(true);
    setDrugs([]);
    try {
      const params = new URLSearchParams({ mode: 'drugs', group });
      if (sub) params.set('sub', sub);
      const res = await fetch(`/api/disease-learning?${params}`);
      const json = await res.json();
      setDrugs(json.drugs ?? []);
      setPeriods(json.periods ?? []);
      setInfoMap(json.info ?? {});
    } catch {
      setDrugs([]);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGroup) fetchDrugs(selectedGroup, selectedSub);
  }, [selectedGroup, selectedSub, fetchDrugs]);

  function selectGroup(g: GroupItem) {
    setSelectedGroup(g.group);
    setSelectedSub(null);        // 1단계 선택 = 질환군 전체
    setSelectedIngr(null);
    setSelectedStrength(null);
    setFilter('all');
    setSearch('');
  }
  function selectSub(sub: string | null) {
    setSelectedSub(sub);
    setSelectedIngr(null);       // 중분류 변경 시 성분·함량 선택 해제
    setSelectedStrength(null);
    setFilter('all');
    setSearch('');
  }

  /** 성분 선택(3단계) — 함량 선택 해제 */
  function selectIngr(ing: string | null) {
    setSelectedIngr(ing);
    setSelectedStrength(null);
  }

  /** 함량 선택(4단계) — 부모 성분도 함께 선택(성분 미선택 상태로 함량만 남는 것 방지) */
  function selectStrength(ing: string, st: string | null) {
    setSelectedIngr(ing);
    setSelectedStrength(st !== null && st === selectedStrength && selectedIngr === ing ? null : st);
  }

  /** 성분 클릭 — 다른 성분이면 '선택 + 함량 펼치기', 이미 선택된 성분이면 '해제 + 접기'(= 중분류 전체) */
  function toggleIngr(ing: string) {
    const willSelect = selectedIngr !== ing;
    setOpenIngrs(prev => {
      const n = new Set(prev);
      if (willSelect) n.add(ing); else n.delete(ing);
      return n;
    });
    selectIngr(willSelect ? ing : null);
  }

  // 4단계: 현재 로드된 약품에서 성분별 함량 목록(숫자 오름차순)
  const strengthsByIngr = new Map<string, string[]>();
  for (const d of drugs) {
    const k = (d.ingredient_name ?? '').trim();
    const st = (d.strength ?? '').trim();
    if (!k || !st) continue;
    if (!strengthsByIngr.has(k)) strengthsByIngr.set(k, []);
    const arr = strengthsByIngr.get(k)!;
    if (!arr.includes(st)) arr.push(st);
  }
  for (const arr of strengthsByIngr.values()) arr.sort(cmpStrength);

  /** 질환군 열기/닫기 — 열 때는 선택도 함께(닫아도 보고 있던 목록은 유지) */
  /**
   * 질환군 클릭 — 항상 '질환군 전체'로 돌아온다(별도 전체보기 버튼 없음).
   *  - 다른 질환군:            선택 + 펼치기
   *  - 이미 선택 + 중분류 선택됨: 중분류 해제(= 전체), 펼침 유지
   *  - 이미 선택 + 전체 상태:    펼치기/접기 토글
   */
  function toggleGroup(g: GroupItem) {
    const isCurrent = selectedGroup === g.group;
    const resetToAll = isCurrent && selectedSub !== null;
    setOpenGroups(prev => {
      const n = new Set(prev);
      if (!isCurrent || resetToAll || !prev.has(g.group)) n.add(g.group); else n.delete(g.group);
      return n;
    });
    if (!isCurrent) selectGroup(g);
    else if (resetToAll) selectSub(null);
  }

  /** 중분류 클릭 — 다른 중분류면 '선택 + 열기', 이미 선택된 것이면 열기/접기 토글 */
  function toggleSub(group: string, sub: string) {
    const key = `${group}|${sub}`;
    const willSelect = selectedSub !== sub;
    setOpenSubs(prev => {
      const n = new Set(prev);
      if (willSelect || !prev.has(key)) n.add(key); else n.delete(key);
      return n;
    });
    if (willSelect) selectSub(sub);
  }

  // 선택영역 = 메뉴 선택(성분 3단계·함량 4단계) + 검색 — 상단 집계는 이 범위 기준
  const scoped = drugs.filter(d => {
    if (selectedIngr && (d.ingredient_name ?? '').trim() !== selectedIngr) return false;
    if (selectedStrength && (d.strength ?? '') !== selectedStrength) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return !!(
        d.product_name?.toLowerCase().includes(q) ||
        d.ingredient_name?.toLowerCase().includes(q) ||
        d.manufacturer?.toLowerCase().includes(q) ||
        d.distributor?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // 선택영역에 실제로 존재하는 제형만 칩으로 노출(0건 칩 방지) — 정제·캡슐제·주사제·기타 순
  const formChips = ([...DRUG_FORMS, '기타'] as DrugForm[])
    .map(form => ({ form, n: scoped.filter(d => d.form === form).length }))
    .filter(x => x.n > 0);

  // 표시 목록 = 선택영역 + 제형 칩 필터
  const displayed = scoped.filter(d => {
    if (filter !== 'all' && d.form !== filter) return false;
    return true;
  });

  // 성분별 그룹 (ingredient_name 기준)
  //  정렬: 동일성분 → 동일함량(오름차순) → 오리지널 먼저 → 약가 높은 순 → (약가 동일 시) 처방액 높은 순
  const ingredientGroups = new Map<string, DrugItem[]>();
  for (const d of displayed) {
    const key = d.ingredient_name?.trim() ?? '기타';
    if (!ingredientGroups.has(key)) ingredientGroups.set(key, []);
    ingredientGroups.get(key)!.push(d);
  }
  // 헤더 클릭 정렬이 있으면 그 기준, 없으면 기본 정렬
  const cmp = sort ? cmpBy(sort.key, sort.dir) : defaultCmp;
  for (const list of ingredientGroups.values()) list.sort(cmp);

  // 통계 — 실제 리스트에 나온 것(displayed = 선택영역 + 검색 + 제형 칩)만 집계
  const origCount    = displayed.filter(d =>  d.is_original).length;
  const genericCount = displayed.filter(d => !d.is_original).length;
  const ubistTotal   = displayed.reduce((s, d) => s + ubistSum(d), 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', marginTop: '1.25rem' }}>

      {/* ── 사이드바: 질환군 ─────────────────────────────────────────────── */}
      <div className="tree-menu" style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px', padding: '0.75rem 0.5rem', alignSelf: 'start',
        position: 'sticky', top: '1rem',
      }}>
        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
          질환군 ({groups.length})
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {groups.map(g => {
            const isActive  = g.group === selectedGroup;
            const groupOpen = openGroups.has(g.group);
            return (
              <div key={g.group}>
                <button
                  onClick={() => toggleGroup(g)}
                  title={groupOpen ? '접기' : '펼치기'}
                  style={{
                    width: '100%', textAlign: 'left', padding: '0.45rem 0.6rem',
                    borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.78rem',
                    background: isActive ? 'rgba(251,191,36,0.15)' : 'transparent',
                    color: isActive ? '#fbbf24' : 'rgba(255,255,255,0.55)',
                    fontWeight: isActive ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 0.12s',
                  }}
                >
                  {g.subs.length > 0 && (
                    <span style={{ fontSize: '0.65rem', opacity: 0.7, flexShrink: 0 }}>{groupOpen ? '▼' : '▶'}</span>
                  )}
                  <span style={{ flex: 1, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.group}</span>
                </button>

                {/* 2단계: 중분류 (펼친 질환군만) */}
                {groupOpen && g.subs.length > 0 && (
                  <div style={{ marginLeft: '12px', borderLeft: '1.5px solid rgba(251,191,36,0.2)',
                    paddingLeft: '8px', marginTop: '2px', marginBottom: '4px',
                    display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {g.subs.map(({ sub, ingredients }) => {
                      const subActive = selectedSub === sub;
                      const subOpen   = openSubs.has(`${g.group}|${sub}`);
                      return (
                        <div key={sub}>
                          <button
                            onClick={() => toggleSub(g.group, sub)}
                            style={{
                              width: '100%', textAlign: 'left', padding: '0.3rem 0.5rem',
                              borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.72rem',
                              background: subActive ? 'rgba(251,191,36,0.12)' : 'transparent',
                              color: subActive ? '#fde68a' : 'rgba(255,255,255,0.4)',
                              fontWeight: subActive ? 600 : 400,
                              display: 'flex', alignItems: 'center', gap: 4,
                              transition: 'all 0.1s',
                            }}
                            title={subOpen ? '접기' : '펼치기'}
                          >
                            {ingredients.length > 0
                              ? <span style={{ fontSize: '0.58rem', opacity: 0.7, flexShrink: 0 }}>{subOpen ? '▼' : '▶'}</span>
                              : <span style={{ width: 7, flexShrink: 0 }} />}
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
                          </button>

                          {/* 3단계: 성분 (펼친 중분류만) */}
                          {subOpen && ingredients.length > 0 && (
                            <div style={{ marginLeft: '10px', borderLeft: '1.5px solid rgba(255,255,255,0.08)',
                              paddingLeft: '7px', marginTop: '1px', marginBottom: '3px',
                              display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              {ingredients.map(ing => {
                                const strengths = subActive ? (strengthsByIngr.get(ing) ?? []) : [];
                                const ingOpen = openIngrs.has(ing);
                                return (
                                  <div key={ing}>
                                    <button
                                      onClick={() => toggleIngr(ing)}
                                      title={ing}
                                      style={{
                                        width: '100%', textAlign: 'left', padding: '0.22rem 0.4rem', borderRadius: '5px',
                                        border: 'none', cursor: 'pointer', fontSize: '0.67rem',
                                        background: selectedIngr === ing ? 'rgba(34,211,238,0.14)' : 'transparent',
                                        color: selectedIngr === ing ? '#67e8f9' : 'rgba(255,255,255,0.38)',
                                        fontWeight: selectedIngr === ing ? 600 : 400,
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        transition: 'all 0.1s',
                                      }}
                                    >
                                      {strengths.length > 0
                                        ? <span style={{ fontSize: '0.54rem', opacity: 0.7, flexShrink: 0 }}>{ingOpen ? '▼' : '▶'}</span>
                                        : <span style={{ width: 6, flexShrink: 0 }} />}
                                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ing}</span>
                                    </button>

                                    {/* 4단계: 함량 */}
                                    {ingOpen && strengths.length > 0 && (
                                      <div style={{ marginLeft: '9px', borderLeft: '1.5px solid rgba(34,211,238,0.15)',
                                        paddingLeft: '6px', marginTop: '1px', marginBottom: '2px',
                                        display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                        {strengths.map(st => (
                                          <button
                                            key={st}
                                            onClick={() => selectStrength(ing, st)}
                                            style={{
                                              textAlign: 'left', padding: '0.18rem 0.35rem', borderRadius: '4px',
                                              border: 'none', cursor: 'pointer', fontSize: '0.63rem',
                                              background: selectedStrength === st ? 'rgba(167,139,250,0.16)' : 'transparent',
                                              color: selectedStrength === st ? '#c4b5fd' : 'rgba(255,255,255,0.34)',
                                              fontWeight: selectedStrength === st ? 600 : 400,
                                              whiteSpace: 'nowrap',
                                              display: 'flex', alignItems: 'center', gap: 3,
                                            }}
                                          >
                                            {st}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 메인 패널 ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

        {/* 헤더 + 통계 */}
        {selectedGroup && (
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '14px', padding: '1rem 1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                    {selectedStrength
                      ? [selectedIngr, selectedStrength].filter(Boolean).join(' ')   // 성분+함량
                      : (selectedIngr ?? selectedSub ?? selectedGroup)}
                  </h1>
                  {selectedIngr && (
                    <button onClick={() => selectIngr(null)} title="성분 선택 해제"
                      style={{ fontSize: '0.66rem', color: '#67e8f9', background: 'rgba(34,211,238,0.12)',
                        border: '1px solid rgba(34,211,238,0.3)', borderRadius: '5px', padding: '1px 6px',
                        cursor: 'pointer', fontFamily: 'inherit', minHeight: 'auto' }}>
                      성분 ✕
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>
                  {[selectedGroup, selectedSub, selectedIngr, selectedStrength].filter(Boolean).join(' › ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Stat label="전체" value={displayed.length} color="#93c5fd" />
                <Stat label="오리지널" value={origCount} color="#fbbf24" />
                <Stat label="제네릭" value={genericCount} color="#6ee7b7" />
                {ubistTotal > 0 && <Stat label={`처방액 ${periods.length}개월(천원)`} value={fmtThousand(ubistTotal)} color="#f9a8d4" />}
              </div>
            </div>

          </div>
        )}

        {/* 검색 + 필터 바 */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="제품명 / 성분명 / 제조사 검색"
            style={{
              flex: 1, minWidth: '180px', padding: '0.45rem 0.8rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#e2e8f0', fontSize: '0.82rem',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          {/* 제형 칩 — 선택영역에 실제로 있는 제형만, 건수와 함께 */}
          {(['all', ...formChips.map(c => c.form)] as const).map(f => {
            const on = filter === f;
            const c  = FORM_COLOR[f] ?? FORM_COLOR.기타;
            const n  = f === 'all' ? scoped.length : formChips.find(x => x.form === f)!.n;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.78rem', cursor: 'pointer',
                  fontFamily: 'inherit', border: '1px solid',
                  borderColor: on ? c.border : 'rgba(255,255,255,0.12)',
                  background:  on ? c.bg     : 'rgba(255,255,255,0.03)',
                  color:       on ? c.fg     : 'rgba(255,255,255,0.4)',
                }}
              >
                {f === 'all' ? '전체' : f}
                <span style={{ marginLeft: 5, opacity: 0.6, fontSize: '0.7rem' }}>{n}</span>
              </button>
            );
          })}
          {(search || filter !== 'all') && (
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>
              {displayed.length}개
            </span>
          )}
        </div>

        {/* 의약품 테이블 */}
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>
            불러오는 중…
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>
            {drugs.length === 0 ? '데이터가 없습니다.' : '검색 결과가 없습니다.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Array.from(ingredientGroups.entries()).map(([ingr, items]) => (
              <IngredientGroup key={ingr} ingredient={ingr} items={items} periods={periods} info={infoMap[ingr]}
                sort={sort} onSort={toggleSort} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 성분별 그룹 카드 ── */
function IngredientGroup({ ingredient, items, periods, sort, onSort, info }: {
  ingredient: string; items: DrugItem[]; periods: string[];
  sort: SortState; onSort: (k: SortKey) => void; info?: IngredientInfo;
}) {
  const [open, setOpen] = useState(true);
  const origCount    = items.filter(d =>  d.is_original).length;
  const genericCount = items.filter(d => !d.is_original).length;

  // w 미지정(판매사·제조사) = 남는 폭을 균등 분배받는 열
  const fixedHeaders: { label: string; w?: number; num?: boolean }[] = [
    { label: '제품명', w: PROD_W }, { label: '함량', w: DOSE_W },
    { label: '판매사' }, { label: '제조사' },
    { label: '구분', w: GUBUN_W },
    { label: '약가(상한)', w: PRICE_W, num: true }, { label: '수수료율', w: RATE_W, num: true },
  ];
  const periodHeaders = periods.map(fmtPeriod);
  const ubistOn = sort?.key === 'ubist';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      {/* 성분명 헤더 */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          width: '100%', textAlign: 'left', padding: '0.65rem 1rem',
          background: 'rgba(255,255,255,0.04)', border: 'none',
          borderBottom: open ? '1px solid rgba(255,255,255,0.07)' : 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
        }}
      >
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#93c5fd' }}>{ingredient}</span>
        {info?.drug_class && (
          <span style={{
            fontSize: '0.65rem', color: '#c4b5fd', background: 'rgba(167,139,250,0.14)',
            border: '1px solid rgba(167,139,250,0.25)', borderRadius: '10px',
            padding: '1px 7px', whiteSpace: 'nowrap',
          }}>{info.drug_class}</span>
        )}
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
          오리지널 {origCount} / 제네릭 {genericCount} / 총 {items.length}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* 성분 설명 — 식약처 효능효과 기반 요약 */}
      {info?.description && (
        <div style={{
          padding: '0.55rem 1rem 0.6rem', background: 'rgba(147,197,253,0.04)',
          borderBottom: open ? '1px solid rgba(255,255,255,0.07)' : 'none',
          fontSize: '0.75rem', lineHeight: 1.65, color: 'rgba(255,255,255,0.6)',
        }}>
          {info.description}
          {!info.grounded && (
            <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'rgba(251,191,36,0.75)' }}
              title="식약처 허가사항에서 해당 성분을 찾지 못해 일반 약리 지식으로 작성됨 — 검수 필요">
              ⚠ 허가사항 미연동
            </span>
          )}
        </div>
      )}

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%', minWidth: tableMinWidth(periods.length), tableLayout: 'fixed',
            borderCollapse: 'collapse', fontSize: '0.78rem',
          }}>
            <colgroup>
              {fixedHeaders.map(h => <col key={h.label} style={h.w ? { width: h.w } : undefined} />)}
              {periods.map(p => <col key={p} style={{ width: UBIST_W }} />)}
            </colgroup>
            <thead>
              {/* 1행: 고정 열(2행 병합) + 처방액 그룹 라벨 / 2행: 월 */}
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {fixedHeaders.map(h => {
                  const k = SORT_OF[h.label];
                  const on = sort?.key === k;
                  return (
                    <th key={h.label} rowSpan={2}
                      onClick={k ? () => onSort(k) : undefined}
                      title={k ? '클릭하여 정렬' : undefined}
                      style={{
                        ...(h.num ? TH_NUM : TH),
                        cursor: k ? 'pointer' : 'default', userSelect: 'none',
                        color: on ? '#a5f3fc' : TH.color,
                      }}>
                      {h.label}{k && <span style={{ marginLeft: 3, opacity: on ? 1 : 0.3 }}>{on ? (sort!.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>}
                    </th>
                  );
                })}
                {periods.length > 0 && (
                  <th colSpan={periods.length} onClick={() => onSort('ubist')} title="클릭하여 정렬"
                    style={{ ...TH_NUM, textAlign: 'center', cursor: 'pointer', userSelect: 'none',
                      paddingBottom: '0.15rem', borderBottom: 'none',
                      color: ubistOn ? '#a5f3fc' : 'rgba(165,243,252,0.55)' }}>
                    처방액(천원)
                    <span style={{ marginLeft: 3, opacity: ubistOn ? 1 : 0.3 }}>
                      {ubistOn ? (sort!.dir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                )}
              </tr>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {periodHeaders.map((h, i) => (
                  <th key={periods[i]} onClick={() => onSort('ubist')} title="클릭하여 정렬"
                    style={{ ...TH_NUM, textAlign: 'right', paddingTop: 0,
                      fontSize: '0.65rem', cursor: 'pointer', userSelect: 'none',
                      color: ubistOn ? '#a5f3fc' : 'rgba(165,243,252,0.55)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((d, i) => (
                <DrugRow key={d.id} drug={d} even={i % 2 === 0} periods={periods} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── 의약품 테이블 행 ── */
function DrugRow({ drug: d, even, periods }: {
  drug: DrugItem; even: boolean; periods: string[];
}) {
  return (
    <tr style={{ background: even ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
      <td style={TD} title={d.product_name ?? undefined}>
        <div style={{
          fontWeight: d.is_original ? 600 : 400, color: d.is_original ? '#fde68a' : '#e2e8f0',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {d.product_name ?? '-'}
        </div>
        {d.atc_code && (
          <div style={{ fontSize: '0.65rem', color: 'rgba(147,197,253,0.7)', marginTop: '1px' }}>
            ATC: {d.atc_code}
          </div>
        )}
      </td>
      <td style={{ ...TD, textAlign: 'center', color: '#a5f3fc', fontSize: '0.73rem', whiteSpace: 'nowrap' }}>
        {d.strength ?? '-'}
      </td>
      <td style={{
        ...TD, color: 'rgba(255,255,255,0.55)', fontSize: '0.73rem',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={d.distributor ?? undefined}>
        {d.distributor ?? '-'}
      </td>
      <td style={{
        ...TD, color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={d.manufacturer ?? undefined}>
        {d.manufacturer ?? '-'}
      </td>
      <td style={{ ...TD, textAlign: 'center' }}>
        <span style={{
          fontSize: '0.68rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
          whiteSpace: 'nowrap', display: 'inline-block',
          background: d.is_original ? 'rgba(251,191,36,0.15)' : 'rgba(110,231,183,0.12)',
          color: d.is_original ? '#fbbf24' : '#6ee7b7',
          border: `1px solid ${d.is_original ? 'rgba(251,191,36,0.3)' : 'rgba(110,231,183,0.25)'}`,
        }}>
          {d.is_original ? '오리지널' : '제네릭'}
        </span>
        {d.permit_kind && (
          <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', marginTop: '2px' }}>
            {d.permit_kind}
          </div>
        )}
      </td>
      <td style={{ ...TD_NUM, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: d.max_price ? '#e2e8f0' : 'rgba(255,255,255,0.25)', fontSize: '0.75rem' }}>
          {fmtPrice(d.max_price)}
        </span>
      </td>
      <td style={{ ...TD_NUM, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {d.commission_rate != null ? (
          <span style={{ color: '#f9a8d4', fontSize: '0.78rem', fontWeight: 600 }}>
            {d.commission_rate.toFixed(1)}%
          </span>
        ) : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.72rem' }}>-</span>}
      </td>
      {/* 월별 처방액 (오래된 순) */}
      {periods.map(p => {
        const amt = d.ubist_monthly?.[p] ?? null;
        return (
          <td key={p} style={{ ...TD_NUM, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {amt != null ? (
              <span style={{ color: '#a5f3fc', fontSize: '0.78rem', fontWeight: 600 }}>
                {fmtThousand(amt)}
              </span>
            ) : <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.72rem' }}>-</span>}
          </td>
        );
      })}
    </tr>
  );
}

/* ── 통계 칩 ── */
function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>{label}</div>
    </div>
  );
}

/* ── 공통 스타일 ── */
const TH: React.CSSProperties = {
  padding: '0.4rem 0.75rem', textAlign: 'left', fontSize: '0.68rem',
  color: 'rgba(255,255,255,0.35)', fontWeight: 600, whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
};

const TD: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)',
  verticalAlign: 'middle',
};

/* 숫자 열 — 좌우 패딩을 줄여 데이터 실폭에 맞춤 */
const TH_NUM: React.CSSProperties = { ...TH, padding: '0.4rem 0.4rem' };
const TD_NUM: React.CSSProperties = { ...TD, padding: '0.5rem 0.4rem' };
