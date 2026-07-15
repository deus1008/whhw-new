'use client';

import { useState, useMemo } from 'react';
import { saveIngredientInfo, setReviewed } from '@/app/disease-learning/admin/ingredients/actions';

export type ReviewItem = {
  ingredient: string;
  description: string;
  drugClass: string;
  grounded: boolean;
  permitSamples: number;
  reviewed: boolean;
  context: string;
};

type Tab = 'todo' | 'ungrounded' | 'done' | 'all';

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'todo',       label: '미검수',       hint: '아직 확인하지 않은 성분' },
  { key: 'ungrounded', label: '허가사항 미연동', hint: '식약처 근거 없이 작성됨 — 우선 확인' },
  { key: 'done',       label: '검수완료',      hint: '' },
  { key: 'all',        label: '전체',         hint: '' },
];

export default function IngredientReviewClient({ items }: { items: ReviewItem[] }) {
  const [rows, setRows] = useState(items);
  const [tab, setTab] = useState<Tab>('ungrounded');
  const [q, setQ] = useState('');

  const counts = useMemo(() => ({
    todo: rows.filter(r => !r.reviewed).length,
    ungrounded: rows.filter(r => !r.grounded).length,
    done: rows.filter(r => r.reviewed).length,
    all: rows.length,
  }), [rows]);

  const shown = useMemo(() => rows.filter(r => {
    if (tab === 'todo' && r.reviewed) return false;
    if (tab === 'ungrounded' && r.grounded) return false;
    if (tab === 'done' && !r.reviewed) return false;
    const s = q.trim().toLowerCase();
    if (s && !`${r.ingredient} ${r.drugClass} ${r.context}`.toLowerCase().includes(s)) return false;
    return true;
  }), [rows, tab, q]);

  function patch(ingredient: string, p: Partial<ReviewItem>) {
    setRows(prev => prev.map(r => (r.ingredient === ingredient ? { ...r, ...p } : r)));
  }

  return (
    <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{
        background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)',
        borderRadius: '10px', padding: '0.7rem 0.95rem', fontSize: '0.78rem',
        color: 'rgba(255,255,255,0.6)', lineHeight: 1.6,
      }}>
        설명은 <b style={{ color: '#fbbf24' }}>식약처 허가 효능효과</b>를 근거로 AI가 요약한 것입니다.
        영업 현장에 나가는 내용이므로 검수 후 <b style={{ color: '#fbbf24' }}>검수완료</b>로 표시해주세요.
        <span style={{ color: 'rgba(251,191,36,0.85)' }}> 허가사항 미연동</span> 항목은 허가 원문 없이
        일반 약리 지식으로만 작성돼 우선 확인이 필요합니다.
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} title={t.hint}
            style={{
              padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.78rem', cursor: 'pointer',
              fontFamily: 'inherit', border: '1px solid',
              borderColor: tab === t.key ? 'rgba(147,197,253,0.4)' : 'rgba(255,255,255,0.12)',
              background: tab === t.key ? 'rgba(147,197,253,0.12)' : 'rgba(255,255,255,0.03)',
              color: tab === t.key ? '#93c5fd' : 'rgba(255,255,255,0.4)',
            }}>
            {t.label}<span style={{ marginLeft: 5, opacity: 0.6, fontSize: '0.7rem' }}>{counts[t.key]}</span>
          </button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="성분·계열·질환군 검색"
          style={{
            flex: 1, minWidth: '180px', padding: '0.45rem 0.8rem',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: '#e2e8f0', fontSize: '0.82rem',
            outline: 'none', fontFamily: 'inherit',
          }} />
      </div>

      {shown.length === 0 ? (
        <div style={{
          padding: '2.5rem', textAlign: 'center', color: 'rgba(255,255,255,0.35)',
          border: '1px dashed rgba(255,255,255,0.12)', borderRadius: '12px', fontSize: '0.85rem',
        }}>
          해당 항목이 없습니다.
        </div>
      ) : (
        shown.map(r => <Card key={r.ingredient} item={r} onPatch={patch} />)
      )}
    </div>
  );
}

function Card({ item, onPatch }: { item: ReviewItem; onPatch: (i: string, p: Partial<ReviewItem>) => void }) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(item.description);
  const [cls, setCls] = useState(item.drugClass);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const r = await saveIngredientInfo(item.ingredient, desc, cls, true);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? '저장 실패'); return; }
    onPatch(item.ingredient, { description: desc.trim(), drugClass: cls.trim(), reviewed: true });
    setEditing(false);
  }

  async function toggleReviewed() {
    setBusy(true); setErr(null);
    const next = !item.reviewed;
    const r = await setReviewed(item.ingredient, next);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? '저장 실패'); return; }
    onPatch(item.ingredient, { reviewed: next });
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${item.reviewed ? 'rgba(110,231,183,0.2)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '12px', padding: '0.8rem 1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#93c5fd' }}>{item.ingredient}</span>
        {item.drugClass && (
          <span style={{
            fontSize: '0.65rem', color: '#c4b5fd', background: 'rgba(167,139,250,0.14)',
            border: '1px solid rgba(167,139,250,0.25)', borderRadius: '10px', padding: '1px 7px',
          }}>{item.drugClass}</span>
        )}
        {item.grounded ? (
          <span style={{ fontSize: '0.65rem', color: 'rgba(110,231,183,0.9)' }}
            title={`식약처 허가 효능효과 ${item.permitSamples}건을 근거로 작성됨`}>
            허가사항 {item.permitSamples}건
          </span>
        ) : (
          <span style={{ fontSize: '0.65rem', color: 'rgba(251,191,36,0.85)' }}
            title="허가 원문 없이 일반 약리 지식으로 작성됨">⚠ 허가사항 미연동</span>
        )}
        {item.context && (
          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.28)' }}>{item.context}</span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {!editing && (
            <button onClick={() => setEditing(true)} disabled={busy} style={btn('#93c5fd')}>수정</button>
          )}
          <button onClick={toggleReviewed} disabled={busy}
            style={btn(item.reviewed ? '#6ee7b7' : 'rgba(255,255,255,0.45)')}>
            {item.reviewed ? '✓ 검수완료' : '검수완료로 표시'}
          </button>
        </span>
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input value={cls} onChange={e => setCls(e.target.value)} placeholder="약효 계열"
            style={input()} />
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
            style={{ ...input(), resize: 'vertical', lineHeight: 1.6 }} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={save} disabled={busy} style={btn('#6ee7b7')}>
              {busy ? '저장 중…' : '저장하고 검수완료'}
            </button>
            <button onClick={() => { setDesc(item.description); setCls(item.drugClass); setEditing(false); }}
              disabled={busy} style={btn('rgba(255,255,255,0.4)')}>취소</button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.78rem', lineHeight: 1.65, color: 'rgba(255,255,255,0.62)' }}>
          {item.description}
        </div>
      )}
      {err && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#fca5a5' }}>{err}</div>}
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    padding: '0.28rem 0.7rem', borderRadius: '7px', fontSize: '0.72rem', cursor: 'pointer',
    fontFamily: 'inherit', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)', color,
  };
}
function input(): React.CSSProperties {
  return {
    width: '100%', padding: '0.45rem 0.7rem', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
    color: '#e2e8f0', fontSize: '0.78rem', outline: 'none', fontFamily: 'inherit',
  };
}
