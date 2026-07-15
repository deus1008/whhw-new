'use client';

import { useState, useEffect, useCallback } from 'react';

/* ── 타입 ── */
type SubItem   = { sub: string; ingredients: string[] };
type GroupItem = { group: string; subs: SubItem[] };

type DrugItem = {
  id: number | null;
  disease_group: string;
  sub_category: string | null;
  treatment_class: string | null;
  ingredient_name: string | null;
  product_name: string | null;
  manufacturer: string | null;
  distributor: string | null;
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

/* ── 질환군 아이콘 ── */
const GROUP_ICONS: Record<string, string> = {
  '순환기계(심혈관질환)': '❤️',
  '소화기계(위장질환)': '🫁',
  '대사성질환(당뇨)': '💉',
  '근골격계 및 통증': '🦴',
  '신경/정신계(뇌질환)': '🧠',
  '비뇨기계': '🔵',
  '감염성질환': '🦠',
  '호흡기계': '🫀',
  '안과': '👁️',
  '순환기계(기타)': '🩸',
  '피부질환': '🩹',
  '갑상선질환': '⚡',
  '류마티스/자가면역질환': '🛡️',
};

export default function DiseaseLearningClient({ groups }: { groups: GroupItem[] }) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(
    groups.length > 0 ? groups[0].group : null
  );
  const [selectedSub, setSelectedSub] = useState<string | null>(
    groups.length > 0 && groups[0].subs.length > 0 ? groups[0].subs[0].sub : null
  );
  const [selectedIngr, setSelectedIngr] = useState<string | null>(null);   // 3단계: 성분
  // 펼침 상태 — 선택과 분리(접어도 보고 있는 목록은 그대로 유지)
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(groups.length > 0 ? [groups[0].group] : []),
  );
  const [openSubs, setOpenSubs] = useState<Set<string>>(() => {
    const g = groups[0];
    const s = g?.subs[0];
    return new Set(g && s ? [`${g.group}|${s.sub}`] : []);
  });
  const [drugs, setDrugs] = useState<DrugItem[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'original' | 'generic'>('all');
  const [search, setSearch] = useState('');
  const [expandedMech, setExpandedMech] = useState(false);

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
    setSelectedSub(g.subs[0]?.sub ?? null);
    setSelectedIngr(null);
    setFilter('all');
    setSearch('');
    setExpandedMech(false);
  }
  function selectSub(sub: string | null) {
    setSelectedSub(sub);
    setSelectedIngr(null);   // 중분류 변경 시 성분 선택 해제
    setFilter('all');
    setSearch('');
  }

  /** 질환군 열기/닫기 — 열 때는 선택도 함께(닫아도 보고 있던 목록은 유지) */
  function toggleGroup(g: GroupItem) {
    const isOpen = openGroups.has(g.group);
    setOpenGroups(prev => {
      const n = new Set(prev);
      if (isOpen) n.delete(g.group); else n.add(g.group);
      return n;
    });
    if (!isOpen || selectedGroup !== g.group) {
      selectGroup(g);
      const first = g.subs[0]?.sub;
      if (first) setOpenSubs(prev => new Set(prev).add(`${g.group}|${first}`));
    }
  }

  /** 중분류 열기/닫기 — 열 때는 선택도 함께 */
  function toggleSub(group: string, sub: string) {
    const key = `${group}|${sub}`;
    const isOpen = openSubs.has(key);
    setOpenSubs(prev => {
      const n = new Set(prev);
      if (isOpen) n.delete(key); else n.add(key);
      return n;
    });
    if (!isOpen || selectedSub !== sub) selectSub(sub);
  }

  // 성분(3단계) + 필터 + 검색
  const displayed = drugs.filter(d => {
    if (selectedIngr && (d.ingredient_name ?? '').trim() !== selectedIngr) return false;
    if (filter === 'original' && !d.is_original) return false;
    if (filter === 'generic'  &&  d.is_original) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        d.product_name?.toLowerCase().includes(q) ||
        d.ingredient_name?.toLowerCase().includes(q) ||
        d.manufacturer?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // 성분별 그룹 (ingredient_name 기준)
  const ingredientGroups = new Map<string, DrugItem[]>();
  for (const d of displayed) {
    const key = d.ingredient_name?.trim() ?? '기타';
    if (!ingredientGroups.has(key)) ingredientGroups.set(key, []);
    ingredientGroups.get(key)!.push(d);
  }

  // 통계
  const origCount    = drugs.filter(d =>  d.is_original).length;
  const genericCount = drugs.filter(d => !d.is_original).length;
  const ubistTotal   = drugs.reduce((s, d) => {
    if (!d.ubist_monthly) return s;
    return s + Object.values(d.ubist_monthly).reduce((a, b) => a + b, 0);
  }, 0);
  const mechText = drugs.find(d => d.mechanism)?.mechanism ?? null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1rem', marginTop: '1.25rem' }}>

      {/* ── 사이드바: 질환군 ─────────────────────────────────────────────── */}
      <div style={{
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
                  <span style={{ fontSize: '0.9rem' }}>{GROUP_ICONS[g.group] ?? '💊'}</span>
                  <span style={{ flex: 1, lineHeight: 1.3 }}>{g.group}</span>
                  {g.subs.length > 0 && (
                    <span style={{ fontSize: '0.6rem', opacity: 0.6, flexShrink: 0 }}>{groupOpen ? '▾' : '▸'}</span>
                  )}
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
                            <span style={{ fontSize: '0.6rem', opacity: 0.7, flexShrink: 0 }}>
                              {ingredients.length > 0 ? (subOpen ? '▾' : '▸') : '·'}
                            </span>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
                          </button>

                          {/* 3단계: 성분 (펼친 중분류만) */}
                          {subOpen && ingredients.length > 0 && (
                            <div style={{ marginLeft: '10px', borderLeft: '1.5px solid rgba(255,255,255,0.08)',
                              paddingLeft: '7px', marginTop: '1px', marginBottom: '3px',
                              display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <button
                                onClick={() => setSelectedIngr(null)}
                                style={{
                                  textAlign: 'left', padding: '0.22rem 0.4rem', borderRadius: '5px',
                                  border: 'none', cursor: 'pointer', fontSize: '0.67rem', background: 'transparent',
                                  color: selectedIngr === null ? '#a5f3fc' : 'rgba(255,255,255,0.3)',
                                  fontWeight: selectedIngr === null ? 600 : 400,
                                }}
                              >
                                전체 성분 ({ingredients.length})
                              </button>
                              {ingredients.map(ing => (
                                <button
                                  key={ing}
                                  onClick={() => setSelectedIngr(ing === selectedIngr ? null : ing)}
                                  title={ing}
                                  style={{
                                    textAlign: 'left', padding: '0.22rem 0.4rem', borderRadius: '5px',
                                    border: 'none', cursor: 'pointer', fontSize: '0.67rem',
                                    background: selectedIngr === ing ? 'rgba(34,211,238,0.14)' : 'transparent',
                                    color: selectedIngr === ing ? '#67e8f9' : 'rgba(255,255,255,0.38)',
                                    fontWeight: selectedIngr === ing ? 600 : 400,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    transition: 'all 0.1s',
                                  }}
                                >
                                  {ing}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* 중분류 전체보기 */}
                    <button
                      onClick={() => selectSub(null)}
                      style={{
                        textAlign: 'left', padding: '0.3rem 0.5rem',
                        borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.12)', cursor: 'pointer',
                        fontSize: '0.68rem', background: 'transparent',
                        color: selectedSub === null ? '#fde68a' : 'rgba(255,255,255,0.25)',
                        marginTop: '2px',
                      }}
                    >
                      전체보기
                    </button>
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
                  <span style={{ fontSize: '1.3rem' }}>{GROUP_ICONS[selectedGroup] ?? '💊'}</span>
                  <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                    {selectedIngr ?? selectedSub ?? selectedGroup}
                  </h1>
                  {selectedIngr && (
                    <button onClick={() => setSelectedIngr(null)} title="성분 선택 해제"
                      style={{ fontSize: '0.66rem', color: '#67e8f9', background: 'rgba(34,211,238,0.12)',
                        border: '1px solid rgba(34,211,238,0.3)', borderRadius: '5px', padding: '1px 6px',
                        cursor: 'pointer', fontFamily: 'inherit', minHeight: 'auto' }}>
                      성분 ✕
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>
                  {[selectedGroup, selectedSub, selectedIngr].filter(Boolean).join(' › ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Stat label="전체" value={drugs.length} color="#93c5fd" />
                <Stat label="오리지널" value={origCount} color="#fbbf24" />
                <Stat label="제네릭" value={genericCount} color="#6ee7b7" />
                {ubistTotal > 0 && <Stat label={`처방액 ${periods.length}개월(천원)`} value={fmtThousand(ubistTotal)} color="#f9a8d4" />}
              </div>
            </div>

            {/* 작용기전 */}
            {mechText && (
              <div style={{
                background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
                borderRadius: '8px', padding: '0.6rem 0.9rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6,
                    overflow: 'hidden', display: expandedMech ? 'block' : '-webkit-box',
                    WebkitBoxOrient: 'vertical', WebkitLineClamp: expandedMech ? 'unset' : 2 } as React.CSSProperties}>
                    <span style={{ color: '#fbbf24', fontWeight: 600, fontSize: '0.75rem' }}>작용기전</span>
                    {'  '}{mechText}
                  </div>
                  <button
                    onClick={() => setExpandedMech(p => !p)}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                      fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0, paddingTop: '2px' }}
                  >
                    {expandedMech ? '접기' : '더보기'}
                  </button>
                </div>
              </div>
            )}
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
          {(['all', 'original', 'generic'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.78rem', cursor: 'pointer',
                fontFamily: 'inherit', border: '1px solid',
                borderColor: filter === f ? (f === 'original' ? 'rgba(251,191,36,0.4)' : f === 'generic' ? 'rgba(110,231,183,0.4)' : 'rgba(147,197,253,0.4)') : 'rgba(255,255,255,0.12)',
                background: filter === f ? (f === 'original' ? 'rgba(251,191,36,0.12)' : f === 'generic' ? 'rgba(110,231,183,0.12)' : 'rgba(147,197,253,0.12)') : 'rgba(255,255,255,0.03)',
                color: filter === f ? (f === 'original' ? '#fbbf24' : f === 'generic' ? '#6ee7b7' : '#93c5fd') : 'rgba(255,255,255,0.4)',
              }}
            >
              {f === 'all' ? '전체' : f === 'original' ? '오리지널' : '제네릭'}
            </button>
          ))}
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
              <IngredientGroup key={ingr} ingredient={ingr} items={items} periods={periods} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 성분별 그룹 카드 ── */
function IngredientGroup({ ingredient, items, periods }: { ingredient: string; items: DrugItem[]; periods: string[] }) {
  const [open, setOpen] = useState(true);
  const origCount    = items.filter(d =>  d.is_original).length;
  const genericCount = items.filter(d => !d.is_original).length;

  const fixedHeaders = ['제품명', '제조사', '판매사', '구분', '대조약', '규격', '약가(상한)', '급여', '수수료율'];
  const periodHeaders = periods.map(fmtPeriod);

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
        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
          오리지널 {origCount} / 제네릭 {genericCount} / 총 {items.length}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {fixedHeaders.map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
                {periodHeaders.map((h, i) => (
                  <th key={periods[i]} style={{ ...TH, textAlign: 'right', color: 'rgba(165,243,252,0.55)' }}>
                    처방액(천원)<br /><span style={{ fontSize: '0.65rem' }}>{h}</span>
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
function DrugRow({ drug: d, even, periods }: { drug: DrugItem; even: boolean; periods: string[] }) {
  const isGibyo = d.pay_type?.includes('급여') && !d.pay_type?.includes('비');
  return (
    <tr style={{ background: even ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
      <td style={TD}>
        <div style={{ fontWeight: d.is_original ? 600 : 400, color: d.is_original ? '#fde68a' : '#e2e8f0', display: 'flex', alignItems: 'center', gap: '5px' }}>
          {d.product_name ?? '-'}
          {d.from_price_db && (
            <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', padding: '0 3px', flexShrink: 0 }}>
              보험DB
            </span>
          )}
        </div>
        {d.atc_code && (
          <div style={{ fontSize: '0.65rem', color: 'rgba(147,197,253,0.7)', marginTop: '1px' }}>
            ATC: {d.atc_code}
          </div>
        )}
      </td>
      <td style={{ ...TD, color: 'rgba(255,255,255,0.55)', fontSize: '0.73rem' }}>
        {d.manufacturer ?? '-'}
      </td>
      <td style={{ ...TD, color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem' }}>
        {d.distributor ?? '-'}
      </td>
      <td style={{ ...TD, textAlign: 'center' }}>
        <span style={{
          fontSize: '0.68rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 600,
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
      <td style={{ ...TD, color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem', maxWidth: '120px' }}>
        {d.is_original ? (
          <span style={{ fontSize: '0.65rem', color: 'rgba(251,191,36,0.5)' }}>─</span>
        ) : (
          <span title={d.reference_drug ?? undefined}
            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.reference_drug ?? '미확인'}
          </span>
        )}
      </td>
      <td style={{ ...TD, color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center' }}>
        {d.standard ?? '-'}
      </td>
      <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ color: d.max_price ? '#e2e8f0' : 'rgba(255,255,255,0.25)', fontSize: '0.75rem' }}>
          {fmtPrice(d.max_price)}
        </span>
      </td>
      <td style={{ ...TD, textAlign: 'center' }}>
        {d.pay_type ? (
          <span style={{
            fontSize: '0.67rem', padding: '1px 7px', borderRadius: '10px',
            background: isGibyo ? 'rgba(52,211,153,0.12)' : 'rgba(156,163,175,0.12)',
            color: isGibyo ? '#6ee7b7' : 'rgba(255,255,255,0.35)',
            border: `1px solid ${isGibyo ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.1)'}`,
          }}>
            {d.pay_type === '-' ? '정보없음' : d.pay_type}
          </span>
        ) : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.72rem' }}>-</span>}
      </td>
      <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
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
          <td key={p} style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
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
