'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveTrend, deleteTrend, addCompany, removeCompany, restoreCompany, moveCompany, addSource, removeSource, crawlNow, type TrendInput } from '@/app/competitor-intel/actions';

export type Company = { id: string; name: string; display_order: number };
export type Source  = { id: string; name: string; base_url: string | null; display_order: number };
export type Trend = {
  id: string; company_name: string; trend_type: string; title: string;
  summary: string | null; content: string | null; source_name: string | null; url: string | null;
  event_date: string | null; is_field: boolean; supplement: string | null;
  author_id: string | null; author_name: string | null; crawled: boolean; created_at: string;
};

const TYPES = ['신제품출시', '정책변경', '이슈사항', '현장동향', '기타'] as const;
const TYPE_STYLE: Record<string, { c: string; bg: string }> = {
  '신제품출시': { c: '#6ee7b7', bg: 'rgba(52,211,153,0.14)' },
  '정책변경':   { c: '#93c5fd', bg: 'rgba(59,130,246,0.14)' },
  '이슈사항':   { c: '#fca5a5', bg: 'rgba(248,113,113,0.14)' },
  '현장동향':   { c: '#fcd34d', bg: 'rgba(251,191,36,0.14)' },
  '기타':       { c: '#cbd5e1', bg: 'rgba(148,163,184,0.14)' },
};
const fmtYmd = (s?: string | null) => (s ? s.replace(/-/g, '.').slice(2) : '');

export default function CompetitorIntelClient({ companies, deletedCompanies = [], sources, trends, isAdmin, currentUserId }: {
  companies: Company[]; deletedCompanies?: Company[]; sources: Source[]; trends: Trend[]; isAdmin: boolean; currentUserId: string;
}) {
  const router = useRouter();
  const [sel, setSel]       = useState<string>('ALL');
  const [typeF, setTypeF]   = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TrendInput | null>(null);   // null = 폼 닫힘
  const [manageMedia, setManageMedia] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState('');

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of trends) m[t.company_name] = (m[t.company_name] ?? 0) + 1;
    return m;
  }, [trends]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trends.filter(t => {
      if (sel !== 'ALL' && t.company_name !== sel) return false;
      if (typeF && t.trend_type !== typeF) return false;
      if (q) {
        const hay = `${t.title} ${t.summary ?? ''} ${t.content ?? ''} ${t.company_name} ${t.source_name ?? ''} ${t.author_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [trends, sel, typeF, search]);

  // 월별 그룹
  const groups = useMemo(() => {
    const m = new Map<string, Trend[]>();
    for (const t of view) {
      const key = t.event_date ? t.event_date.slice(0, 7) : (t.created_at?.slice(0, 7) ?? '기타');
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [view]);

  function refresh(msg?: string) { if (msg) setNotice(msg); router.refresh(); }
  function run(fn: () => Promise<{ error?: string }>, okMsg?: string) {
    start(async () => { const r = await fn(); if (r.error) setNotice('⚠ ' + r.error); else refresh(okMsg); });
  }

  function openNew() {
    setEditing({ company_name: sel !== 'ALL' ? sel : (companies[0]?.name ?? ''), trend_type: '기타', title: '', is_field: false, event_date: new Date().toISOString().slice(0, 10) });
  }

  // 폼 공용 props (상단 신규 폼 / 카드 위치 인라인 수정 폼 공유)
  const formProps = {
    companies, sources, pending,
    onCancel: () => setEditing(null),
    onSave: (v: TrendInput) => start(async () => {
      const r = await saveTrend(v);
      if (r.error) setNotice('⚠ ' + r.error);
      else { setEditing(null); refresh('저장되었습니다.'); }
    }),
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: '1rem', alignItems: 'start' }}>
      {/* ── 사이드바 ── */}
      <div style={{ ...card, position: 'sticky', top: '1rem', padding: '0.7rem 0.55rem' }}>
        <p style={sideHdr}>대상 업체</p>
        <button onClick={() => setSel('ALL')} style={sideBtn(sel === 'ALL')}>
          전체 <span style={{ opacity: 0.5, fontSize: '0.72rem' }}>{trends.length}</span>
        </button>
        {companies.map((c, i) => (
          <div key={c.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setSel(c.name)} style={{ ...sideBtn(sel === c.name), flex: 1, minWidth: 0 }}>
              {c.name} <span style={{ opacity: 0.5, fontSize: '0.72rem' }}>{counts[c.name] ?? 0}</span>
            </button>
            {isAdmin && (
              <>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.9 }}>
                  <button title="위로" disabled={pending || i === 0} onClick={() => run(() => moveCompany(c.id, 'up'))}
                    style={{ ...ordBtn, opacity: i === 0 ? 0.15 : 0.5 }}>▲</button>
                  <button title="아래로" disabled={pending || i === companies.length - 1} onClick={() => run(() => moveCompany(c.id, 'down'))}
                    style={{ ...ordBtn, opacity: i === companies.length - 1 ? 0.15 : 0.5 }}>▼</button>
                </span>
                <button title="삭제" onClick={() => { if (confirm(`${c.name} 삭제?\n(동향 기록은 보존되며 관리자가 복원할 수 있습니다)`)) run(() => removeCompany(c.id)); }}
                  style={xBtn}>✕</button>
              </>
            )}
          </div>
        ))}
        {isAdmin && <AddInline placeholder="+ 회사 추가" onAdd={(v) => run(() => addCompany(v))} />}

        {/* 삭제된 업체 복원 (관리자) */}
        {isAdmin && deletedCompanies.length > 0 && (
          <>
            <button onClick={() => setShowTrash(t => !t)}
              style={{ ...sideHdr, marginTop: '0.7rem', cursor: 'pointer', background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: '0 0.4rem' }}>
              🗑 삭제된 업체 ({deletedCompanies.length}) {showTrash ? '▾' : '▸'}
            </button>
            {showTrash && deletedCompanies.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.15rem 0.3rem' }}>
                <span style={{ flex: 1, fontSize: '0.76rem', color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>{c.name}</span>
                <button title="복원" disabled={pending}
                  onClick={() => run(() => restoreCompany(c.id), `${c.name} 복원되었습니다.`)}
                  style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 6, color: '#6ee7b7', cursor: 'pointer', fontSize: '0.66rem', padding: '0.1rem 0.4rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  ↩ 복원
                </button>
              </div>
            ))}
          </>
        )}

        {/* 매체 관리 */}
        <button onClick={() => setManageMedia(m => !m)} style={{ ...sideHdr, marginTop: '0.8rem', cursor: 'pointer', background: 'none', border: 'none', width: '100%', textAlign: 'left', padding: '0 0.4rem' }}>
          뉴스 매체 ({sources.length}) {manageMedia ? '▾' : '▸'}
        </button>
        {manageMedia && (
          <div style={{ padding: '0 0.2rem' }}>
            {sources.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)', padding: '0.2rem 0.3rem' }}>
                {s.base_url ? <a href={s.base_url} target="_blank" rel="noreferrer" style={{ color: '#93c5fd', textDecoration: 'none', flex: 1 }}>{s.name}</a> : <span style={{ flex: 1 }}>{s.name}</span>}
                {isAdmin && <button title="삭제" onClick={() => run(() => removeSource(s.id))} style={xBtn}>✕</button>}
              </div>
            ))}
            {isAdmin && <AddInline placeholder="+ 매체 추가(이름 | URL)" onAdd={(v) => { const [n, u] = v.split('|').map(x => x.trim()); run(() => addSource(n, u ?? '')); }} />}
          </div>
        )}
      </div>

      {/* ── 메인 ── */}
      <div>
        {notice && (
          <div style={{ marginBottom: '0.6rem', padding: '0.5rem 0.8rem', borderRadius: 8, fontSize: '0.8rem',
            background: notice.startsWith('⚠') ? 'rgba(248,113,113,0.12)' : 'rgba(52,211,153,0.12)',
            color: notice.startsWith('⚠') ? '#fca5a5' : '#6ee7b7' }}>{notice}</div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {sel === 'ALL' ? '전체 동향' : sel} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>{view.length}건</span>
          </h2>
          <div style={{ flex: 1 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 검색"
            style={{ minWidth: 160, padding: '0.4rem 0.7rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
          {isAdmin && (
            <button disabled={pending} onClick={() => start(async () => { setNotice('뉴스 수집 중…(최대 1~2분)'); const r = await crawlNow(); setNotice((r.error ? '⚠ ' + r.error : r.message) ?? ''); router.refresh(); })}
              style={ghostBtn} title="자동수집 매체에서 최신 기사 수집">🔄 뉴스 수집</button>
          )}
          <button onClick={openNew} style={primaryBtn}>+ 동향 추가</button>
        </div>

        {/* 유형 필터 */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
          <Chip active={!typeF} onClick={() => setTypeF(null)}>전체유형</Chip>
          {TYPES.map(t => <Chip key={t} active={typeF === t} color={TYPE_STYLE[t].c} onClick={() => setTypeF(typeF === t ? null : t)}>{t}</Chip>)}
        </div>

        {/* 신규 추가 폼 — 상단 (기존 기사 수정은 해당 카드 위치에서 인라인으로 열림) */}
        {editing && !editing.id && <TrendForm value={editing} {...formProps} />}

        {/* 타임라인 */}
        {groups.length === 0 ? (
          <div style={{ ...card, padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🗞️</p>등록된 동향이 없습니다. 우측 상단 &ldquo;+ 동향 추가&rdquo;로 기록하세요.
          </div>
        ) : groups.map(([month, items]) => (
          <div key={month} style={{ marginBottom: '1.2rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a5b4fc', margin: '0 0 0.5rem', paddingLeft: '0.2rem' }}>
              {month === '기타' ? '날짜미상' : `${month.slice(0, 4)}년 ${month.slice(5, 7)}월`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {items.map(t => (
                editing?.id === t.id
                  // 수정 중인 기사는 그 자리에서 폼으로 전환 (스크롤 불필요)
                  ? <TrendForm key={t.id} value={editing} {...formProps} />
                  : <TrendCard key={t.id} t={t} showCompany={sel === 'ALL'}
                      canEdit={isAdmin || t.author_id === currentUserId}
                      onEdit={() => setEditing({ id: t.id, company_name: t.company_name, trend_type: t.trend_type, title: t.title, summary: t.summary ?? '', content: t.content ?? '', source_name: t.source_name ?? '', url: t.url ?? '', event_date: t.event_date, is_field: t.is_field, supplement: t.supplement ?? '' })}
                      onDelete={() => { if (confirm('삭제하시겠습니까?')) run(() => deleteTrend(t.id), '삭제되었습니다.'); }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 동향 카드 ── */
function TrendCard({ t, showCompany, canEdit, onEdit, onDelete }: {
  t: Trend; showCompany: boolean; canEdit: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ts = TYPE_STYLE[t.trend_type] ?? TYPE_STYLE['기타'];
  return (
    <div style={{ ...card, padding: '0.7rem 0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)', minWidth: 46 }}>{fmtYmd(t.event_date) || '—'}</span>
        <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 4, color: ts.c, background: ts.bg }}>{t.trend_type}</span>
        {t.is_field && <span style={{ fontSize: '0.64rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4, color: '#fcd34d', background: 'rgba(251,191,36,0.14)' }}>현장</span>}
        {t.crawled && <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>자동수집</span>}
        {showCompany && <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#93c5fd' }}>{t.company_name}</span>}
        <div style={{ flex: 1 }} />
        {canEdit && <>
          <button onClick={onEdit} style={miniBtn}>수정</button>
          <button onClick={onDelete} style={{ ...miniBtn, color: '#fca5a5' }}>삭제</button>
        </>}
      </div>
      <div onClick={() => (t.content || t.supplement) && setOpen(o => !o)} style={{ cursor: (t.content || t.supplement) ? 'pointer' : 'default', marginTop: '0.35rem' }}>
        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</p>
        {t.summary && <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>{t.summary}</p>}
      </div>
      {open && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap' }}>
          {t.content && <div>{t.content}</div>}
          {t.supplement && <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.7rem', borderRadius: 8, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <b style={{ color: '#a5b4fc', fontSize: '0.72rem' }}>보완내용</b><br />{t.supplement}</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.7rem', marginTop: '0.4rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', flexWrap: 'wrap' }}>
        {t.source_name && <span>📰 {t.source_name}</span>}
        {t.url && <a href={t.url} target="_blank" rel="noreferrer" style={{ color: '#93c5fd', textDecoration: 'none' }}>기사 링크 ↗</a>}
        {t.author_name && <span>✍ {t.author_name}</span>}
      </div>
    </div>
  );
}

/* ── 추가/수정 폼 ── */
function TrendForm({ value, companies, sources, pending, onSave, onCancel }: {
  value: TrendInput; companies: Company[]; sources: Source[]; pending: boolean;
  onSave: (v: TrendInput) => void; onCancel: () => void;
}) {
  const [v, setV] = useState<TrendInput>(value);
  const set = (patch: Partial<TrendInput>) => setV(p => ({ ...p, ...patch }));
  return (
    <div style={{ ...card, padding: '0.9rem 1rem', marginBottom: '0.9rem', border: '1px solid rgba(99,102,241,0.3)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <label style={lbl}>회사
          <select value={v.company_name} onChange={e => set({ company_name: e.target.value })} style={inp}>
            {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </label>
        <label style={lbl}>유형
          <select value={v.trend_type} onChange={e => set({ trend_type: e.target.value })} style={inp}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={lbl}>일자
          <input type="date" value={v.event_date ?? ''} onChange={e => set({ event_date: e.target.value })} style={inp} />
        </label>
        <label style={{ ...lbl, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: '1.1rem' }}>
          <input type="checkbox" checked={!!v.is_field} onChange={e => set({ is_field: e.target.checked })} />
          현장청취(지역장)
        </label>
      </div>
      {!v.is_field && (
        <label style={{ ...lbl, marginBottom: '0.5rem' }}>매체
          <select value={v.source_name ?? ''} onChange={e => set({ source_name: e.target.value })} style={inp}>
            <option value="">(선택)</option>
            {sources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </label>
      )}
      <input value={v.title} onChange={e => set({ title: e.target.value })} placeholder="제목 *" style={{ ...inp, width: '100%', marginBottom: '0.5rem', fontWeight: 600 }} />
      <input value={v.summary ?? ''} onChange={e => set({ summary: e.target.value })} placeholder="핵심 요약" style={{ ...inp, width: '100%', marginBottom: '0.5rem' }} />
      <textarea value={v.content ?? ''} onChange={e => set({ content: e.target.value })} placeholder="상세 내용" rows={3} style={{ ...inp, width: '100%', marginBottom: '0.5rem', resize: 'vertical' }} />
      {!v.is_field && <input value={v.url ?? ''} onChange={e => set({ url: e.target.value })} placeholder="기사 URL" style={{ ...inp, width: '100%', marginBottom: '0.5rem' }} />}
      <textarea value={v.supplement ?? ''} onChange={e => set({ supplement: e.target.value })} placeholder="보완내용 (기사에서 확인 못한 추가 파악 내용)" rows={2} style={{ ...inp, width: '100%', marginBottom: '0.6rem', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={ghostBtn}>취소</button>
        <button onClick={() => onSave(v)} disabled={pending || !v.title.trim()} style={primaryBtn}>{pending ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  );
}

/* ── 인라인 추가 입력 ── */
function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <input value={v} placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }}
      style={{ width: '100%', marginTop: '0.3rem', padding: '0.35rem 0.5rem', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: '0.74rem', outline: 'none', boxSizing: 'border-box' }} />
  );
}

function Chip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.28rem 0.7rem', borderRadius: 100, fontSize: '0.76rem', fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
      background: active ? (color ? color + '22' : 'rgba(59,130,246,0.9)') : 'transparent',
      border: `1px solid ${active ? (color ?? 'rgba(59,130,246,0.9)') + '70' : 'rgba(255,255,255,0.14)'}`,
      color: active ? (color ?? '#fff') : 'rgba(255,255,255,0.5)',
    }}>{children}</button>
  );
}

/* ── 스타일 ── */
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 };
const sideHdr: React.CSSProperties = { fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '0 0.4rem', margin: '0 0 0.4rem' };
const sideBtn = (active: boolean): React.CSSProperties => ({
  width: '100%', textAlign: 'left', padding: '0.4rem 0.55rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.8rem', marginBottom: 2,
  background: active ? 'rgba(59,130,246,0.16)' : 'transparent', color: active ? '#93c5fd' : 'rgba(255,255,255,0.6)', fontWeight: active ? 700 : 400, fontFamily: 'inherit',
});
const xBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '0.7rem', padding: '0 0.2rem' };
const ordBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.5rem', padding: 0, lineHeight: 1, fontFamily: 'inherit' };
const miniBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.7rem', padding: '0.12rem 0.5rem', fontFamily: 'inherit' };
const primaryBtn: React.CSSProperties = { padding: '0.42rem 1rem', borderRadius: 8, background: 'rgba(59,130,246,0.9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' };
const ghostBtn: React.CSSProperties = { padding: '0.42rem 1rem', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' };
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' };
const inp: React.CSSProperties = { padding: '0.4rem 0.6rem', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
