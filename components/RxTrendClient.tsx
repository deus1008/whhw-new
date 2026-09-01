'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { RxTrendRow } from '@/app/api/rx-trend/route';

type Meta = { periods: string[]; specialties: string[] };

// 금액: 백만원 단위, 소수점 없이(정수).
function fmtWon(v: number): string {
  if (!v) return '-';
  return Math.round(v / 1e6).toLocaleString();
}
function fmtPeriod(p: string): string {
  const m = p.match(/^(\d{4})-(\d{2})$/); return m ? `${m[1]}.${m[2]}` : p;
}
function pct(part: number, whole: number): string {
  if (!whole) return '-';
  return `${Math.round((part / whole) * 100)}%`;
}
function growth(cur: number, prev: number): { txt: string; cls: string } {
  if (!(prev > 0)) return { txt: '-', cls: '' };
  const g = Math.round(((cur - prev) / prev) * 100);
  return { txt: `${g > 0 ? '+' : ''}${g}%`, cls: g >= 0 ? 'rxt-up' : 'rxt-down' };
}

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
    <div className="rxt-root">
      {/* 필터 */}
      <div className="rxt-card rxt-filter">
        <label>기준월</label>
        <select className="rxt-select" value={period} onChange={e => setPeriod(e.target.value)}>
          {meta.periods.map(p => <option key={p} value={p}>{fmtPeriod(p)}</option>)}
        </select>
        <label>진료과</label>
        <select className="rxt-select" value={specialty} onChange={e => setSpecialty(e.target.value)} disabled={meta.specialties.length === 0}>
          <option value="">{meta.specialties.length ? '전체 진료과' : '진료과 데이터 없음'}</option>
          {meta.specialties.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="rxt-btn" onClick={run} disabled={loading || !period}>
          {loading ? '⏳ 집계 중…' : '🔍 분석'}
        </button>
        {rows && rows.length > 0 && (
          <button className="rxt-btn no-print" onClick={() => window.print()}>🖨 인쇄</button>
        )}
        {rows && prev && (
          <span className="rxt-note">
            {fmtPeriod(prev)}(전년동월) vs {fmtPeriod(period)}(당월) · 상위 {rows.length}성분 · 금액 단위: 백만원
          </span>
        )}
      </div>

      {/* 인쇄 전용 요약 헤더 */}
      {rows && rows.length > 0 && (
        <div className="rxt-print-head">
          진료과별 다처방 성분 · 기준월 {fmtPeriod(period)}{specialty ? ` · ${specialty}` : ' · 전체 진료과'}
          {prev ? ` · ${fmtPeriod(prev)}(전년동월) 대비` : ''} · 상위 {rows.length}성분 · 금액 단위: 백만원
        </div>
      )}

      {/* 결과 */}
      {rows === null ? (
        <div className="rxt-card rxt-empty">기준월·진료과를 선택하고 <b>분석</b>을 누르세요.</div>
      ) : rows.length === 0 ? (
        <div className="rxt-card rxt-empty">데이터가 없습니다.</div>
      ) : (
        <>
          {/* PC: 넓은 표 */}
          <div className="rxt-card rxt-tablewrap">
            <table className="rxt-table">
              <thead>
                <tr>
                  <th className="c">순위</th>
                  <th className="l">성분명</th>
                  <th>전년동월</th>
                  <th>당월</th>
                  <th className="c">증감율</th>
                  <th className="l rxt-sep-aju">아주약품 품목</th>
                  <th>처방액</th>
                  <th>M/S</th>
                  <th>성장율</th>
                  <th className="l rxt-sep-ref">대조약</th>
                  <th>처방액</th>
                  <th>M/S</th>
                  <th>성장율</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const g = growth(r.cur, r.prev);
                  const ga = growth(r.aju, r.aju_prev);
                  const gr = growth(r.ref, r.ref_prev);
                  return (
                    <tr key={r.ingredient}>
                      <td className="c">{i + 1}</td>
                      <td className="l name">{r.ingredient}</td>
                      <td>{fmtWon(r.prev)}</td>
                      <td className="num">{fmtWon(r.cur)}</td>
                      <td className={`c ${g.cls}`}>{g.txt}</td>
                      <td className="l rxt-sep-aju rxt-aju">{r.aju_product ?? '—'}</td>
                      <td>{fmtWon(r.aju)}</td>
                      <td>{pct(r.aju, r.cur)}</td>
                      <td className={`c ${ga.cls}`}>{ga.txt}</td>
                      <td className="l rxt-sep-ref rxt-ref">{r.ref_product ?? '—'}</td>
                      <td>{fmtWon(r.ref)}</td>
                      <td>{pct(r.ref, r.cur)}</td>
                      <td className={`c ${gr.cls}`}>{gr.txt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일: 성분별 카드 세로 나열 */}
          <div className="rxt-cards">
            {rows.map((r, i) => {
              const g = growth(r.cur, r.prev);
              const ga = growth(r.aju, r.aju_prev);
              const gr = growth(r.ref, r.ref_prev);
              return (
                <div key={r.ingredient} className="rxt-card rxt-item">
                  <div className="rxt-item-head">
                    <span className="rxt-rank">{i + 1}</span>
                    <span className="rxt-item-name">{r.ingredient}</span>
                  </div>
                  <div className="rxt-row"><span className="k">전년동월</span><span className="v">{fmtWon(r.prev)}</span></div>
                  <div className="rxt-row"><span className="k">당월</span><span className="v">{fmtWon(r.cur)}</span></div>
                  <div className="rxt-row"><span className="k">증감율</span><span className={`v ${g.cls}`}>{g.txt}</span></div>

                  <div className="rxt-block">
                    <div className="rxt-block-title rxt-aju">아주약품</div>
                    <div className="rxt-row"><span className="k">품목</span><span className="v rxt-aju">{r.aju_product ?? '—'}</span></div>
                    <div className="rxt-row"><span className="k">처방액</span><span className="v">{fmtWon(r.aju)}</span></div>
                    <div className="rxt-row"><span className="k">M/S</span><span className="v">{pct(r.aju, r.cur)}</span></div>
                    <div className="rxt-row"><span className="k">성장율</span><span className={`v ${ga.cls}`}>{ga.txt}</span></div>
                  </div>

                  <div className="rxt-block">
                    <div className="rxt-block-title rxt-ref">대조약</div>
                    <div className="rxt-row"><span className="k">품목</span><span className="v rxt-ref">{r.ref_product ?? '—'}</span></div>
                    <div className="rxt-row"><span className="k">처방액</span><span className="v">{fmtWon(r.ref)}</span></div>
                    <div className="rxt-row"><span className="k">M/S</span><span className="v">{pct(r.ref, r.cur)}</span></div>
                    <div className="rxt-row"><span className="k">성장율</span><span className={`v ${gr.cls}`}>{gr.txt}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
