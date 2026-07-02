'use client';

import { useState } from 'react';
import Link from 'next/link';

type SyncResult = Record<string, unknown>;

function useSync(url: string) {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<SyncResult | null>(null);

  async function run() {
    setStatus('running');
    setResult(null);
    try {
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json();
      setResult(json);
      setStatus(res.ok ? 'done' : 'error');
    } catch (e) {
      setResult({ error: String(e) });
      setStatus('error');
    }
  }

  return { status, result, run };
}

const BTN = (active: boolean): React.CSSProperties => ({
  padding: '0.55rem 1.2rem', borderRadius: '10px', fontSize: '0.85rem',
  fontWeight: 600, cursor: active ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
  background: active ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.1)'}`,
  color: active ? '#93c5fd' : 'rgba(255,255,255,0.3)',
  opacity: active ? 1 : 0.7,
});

function ResultBox({ result, status }: { result: SyncResult | null; status: string }) {
  if (!result) return null;
  const isError = status === 'error' || result.error;
  return (
    <div style={{
      marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.78rem',
      background: isError ? 'rgba(239,68,68,0.08)' : 'rgba(52,211,153,0.08)',
      border: `1px solid ${isError ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.2)'}`,
      color: isError ? '#f87171' : '#6ee7b7',
      whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.6,
    }}>
      {JSON.stringify(result, null, 2)}
    </div>
  );
}

export default function DiseaseAdminPage() {
  const importDrugs = useSync('/api/admin/import-disease-drugs');
  const syncHira    = useSync('/api/admin/sync-hira');

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link href="/disease-learning" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', textDecoration: 'none' }}>
          ← 질환학습
        </Link>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', margin: 0 }}>질환학습 데이터 관리</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Step 1 */}
        <SyncCard
          step={1}
          title="질환DB 임포트"
          desc="public/data/질환별의약품_DB.xlsx → disease_drugs 테이블 일괄 적재. 기존 데이터를 삭제 후 재적재합니다. 대조약은 동일 성분 내 오리지널 제품으로 자동 표시됩니다."
          warning={null}
          onRun={importDrugs.run}
          status={importDrugs.status}
          result={importDrugs.result}
        />

        {/* Step 2 */}
        <SyncCard
          step={2}
          title="HIRA 동기화"
          desc="건강보험심사평가원 보험의약품정보서비스 API → ATC 코드, 품목기준코드를 disease_drugs에 업데이트합니다. 서비스 승인 여부를 먼저 확인하고, 미승인 시 즉시 안내 메시지를 반환합니다 (약가·급여여부는 Step 1에서 이미 적재됩니다)."
          warning={null}
          onRun={syncHira.run}
          status={syncHira.status}
          result={syncHira.result}
        />

        {/* 안내 */}
        <div style={{
          padding: '1rem 1.25rem',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
        }}>
          <h3 style={{ fontSize: '0.85rem', color: '#fde68a', fontWeight: 600, margin: '0 0 0.5rem' }}>
            실행 순서
          </h3>
          <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', lineHeight: 2 }}>
            <li>Step 1 — 질환DB 임포트 (엑셀 파일 기반, API 키 불필요)</li>
            <li>Step 2 — HIRA 동기화 (ATC 코드·약가 보강, DRUG_API_KEY 사용)</li>
          </ol>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
            대조약명은 엑셀 데이터 내 오리지널 여부(오리지널여부=오리지널)를 기준으로 동일 성분 제네릭에 자동 표시됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function SyncCard({
  step, title, desc, warning, onRun, status, result,
}: {
  step: number;
  title: string;
  desc: string;
  warning: string | null;
  onRun: () => void;
  status: 'idle' | 'running' | 'done' | 'error';
  result: SyncResult | null;
}) {
  const canRun = status !== 'running';
  return (
    <div style={{
      padding: '1rem 1.25rem',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'rgba(96,165,250,0.2)', color: '#93c5fd',
              fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{step}</span>
            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff' }}>{title}</span>
            {status === 'done' && <span style={{ fontSize: '0.72rem', color: '#6ee7b7' }}>✓ 완료</span>}
            {status === 'running' && <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>⏳ 진행 중…</span>}
          </div>
          <p style={{ margin: '0 0 6px 30px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
            {desc}
          </p>
          {warning && (
            <div style={{
              margin: '0 0 0 30px', padding: '6px 10px', borderRadius: '6px',
              background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)',
              fontSize: '0.72rem', color: 'rgba(251,146,60,0.8)', lineHeight: 1.5,
            }}>
              ⚠️ {warning}
            </div>
          )}
        </div>
        <button onClick={canRun ? onRun : undefined} style={BTN(canRun)} disabled={!canRun}>
          {status === 'running' ? '실행 중…' : '실행'}
        </button>
      </div>
      <ResultBox result={result} status={status} />
    </div>
  );
}
