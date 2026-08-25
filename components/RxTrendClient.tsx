'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { RxTrendRow } from '@/app/api/rx-trend/route';

type Meta = { periods: string[]; specialties: string[] };

function fmtWon(v: number): string {
  if (!v) return '-';
  if (v >= 1e8) return `${(v / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })}억`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
  return v.toLocaleString();
}
function fmtPeriod(p: string): string {
  const m = p.match(/^(\d{4})-(\d{2})$/); return m ? `${m[1]}.${m[2]}` : p;
}
function pct(part: number, whole: number): string {
  if (!whole) return '-';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '1rem 1.1rem', marginBottom: '1rem' };
const sel: React.CSSProperties = { padding: '0.4rem 0.7rem', borderRadius: 8, fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer' };
const th: React.CSSProperties = { padding: '0.5rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' };
const td: React.CSSProperties = { padding: '0.5rem 0.6rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)', whiteSpace: 'nowrap' };

export default function RxTrendClient() {
  const [meta, setMeta] = useState<Meta>({ periods: [], specialties: [] });
  const [period, setPeriod] = useState('');
  const [specialty, setSpecialty] = useState(''); // 전체
  const [rows, setRows] = useState<RxTrendRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [prev, setPrev] = useState('');

  useEffect(() => {
    fetch('/api/rx-trend?meta=1').then(r => r.json()).then((m: Meta) => {
      setMeta(m);
      if (m.periods?.length) setPeriod(m.periods[0]);
    }).catch(() => {});
  }, []);

  const run = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ period, limit: '50' });
      if (specialty) p.set('specialty', specialty);
      const res = await fetch(`/api/rx-trend?${p}`);
      const d = await res.json();
      setRows(d.rows ?? []); setPrev(d.prev ?? '');
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [period, specialty]);

  return (
    <div>
      {/* 필터 */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>기준월</label>
        <select value={period} onChange={e => setPeriod(e.target.value)} style={sel}>
          {meta.periods.map(p => <option key={p} value={p}>{fmtPeriod(p)}</option>)}
        </select>
        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>진료과</label>
        <select value={specialty} onChange={e => setSpecialty(e.target.value)} style={sel} disabled={meta.specialties.length === 0}>
          <option value="">{meta.specialties.length ? '전체 진료과' : '진료과 데이터 없음'}</option>
          {meta.specialties.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={run} disabled={loading || !period}
          style={{ padding: '0.5rem 1.3rem', borderRadius: 9, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit' }}>
          {loading ? '⏳ 집계 중…' : '🔍 분석'}
        </button>
        {rows && prev && (
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            {fmtPeriod(prev)}(전년동월) vs {fmtPeriod(period)}(당월) · 상위 {rows.length}성분
          </span>
        )}
      </div>

      {/* 결과 */}
      {rows === null ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>
          기준월·종별·진료과를 선택하고 <b style={{ color: '#7eb3ff' }}>분석</b>을 누르세요.
        </div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>데이터가 없습니다.</div>
      ) : (
        <div style={{ ...card, overflowX: 'auto', padding: '0.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'center' }}>순위</th>
                <th style={{ ...th, textAlign: 'left' }}>성분명</th>
                <th style={{ ...th, textAlign: 'right' }}>전년동월</th>
                <th style={{ ...th, textAlign: 'right' }}>당월</th>
                <th style={{ ...th, textAlign: 'center' }}>증감율</th>
                <th style={{ ...th, textAlign: 'left', borderLeft: '1px solid rgba(96,165,250,0.25)' }}>아주약품 품목</th>
                <th style={{ ...th, textAlign: 'right' }}>처방액</th>
                <th style={{ ...th, textAlign: 'right' }}>M/S</th>
                <th style={{ ...th, textAlign: 'left', borderLeft: '1px solid rgba(167,139,250,0.25)' }}>대조약</th>
                <th style={{ ...th, textAlign: 'right' }}>처방액</th>
                <th style={{ ...th, textAlign: 'right' }}>M/S</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const g = r.prev > 0 ? Math.round(((r.cur - r.prev) / r.prev) * 100) : null;
                const gcol = g === null ? 'var(--text-muted)' : g >= 0 ? '#60a5fa' : '#f87171';
                return (
                  <tr key={r.ingredient} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : undefined }}>
                    <td style={{ ...td, textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: 'normal', maxWidth: 220 }}>{r.ingredient}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{fmtWon(r.prev)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#7eb3ff' }}>{fmtWon(r.cur)}</td>
                    <td style={{ ...td, textAlign: 'center', color: gcol, fontWeight: 700 }}>{g === null ? '-' : `${g > 0 ? '+' : ''}${g}%`}</td>
                    <td style={{ ...td, borderLeft: '1px solid rgba(96,165,250,0.15)', color: r.aju_product ? '#93c5fd' : 'var(--text-muted)', whiteSpace: 'normal', maxWidth: 160 }}>{r.aju_product ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtWon(r.aju)}</td>
                    <td style={{ ...td, textAlign: 'right', color: r.aju ? '#34d399' : 'var(--text-muted)', fontWeight: r.aju ? 600 : 400 }}>{pct(r.aju, r.cur)}</td>
                    <td style={{ ...td, borderLeft: '1px solid rgba(167,139,250,0.15)', color: r.ref_product ? '#c4b5fd' : 'var(--text-muted)', whiteSpace: 'normal', maxWidth: 160 }}>{r.ref_product ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtWon(r.ref)}</td>
                    <td style={{ ...td, textAlign: 'right', color: r.ref ? '#a78bfa' : 'var(--text-muted)' }}>{pct(r.ref, r.cur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
