'use client';

import { useState, useRef } from 'react';

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export default function DrugPriceUpload() {
  const [state, setState]       = useState<UploadState>('idle');
  const [message, setMessage]   = useState('');
  const [fileName, setFileName] = useState('');
  const [count, setCount]       = useState<{ inserted: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setFileName(file.name);
    setState('uploading');
    setMessage('');
    setCount(null);

    const form = new FormData();
    form.append('file', file);

    try {
      const res  = await fetch('/api/drug-prices', { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok || data.error) {
        setState('error');
        setMessage(data.error ?? '업로드 실패');
      } else {
        setState('done');
        setCount({ inserted: data.inserted, total: data.total });
        setMessage(`"${data.fileName}" 업로드 완료`);
      }
    } catch {
      setState('error');
      setMessage('서버 오류가 발생했습니다.');
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const color    = state === 'done' ? '#6ee7b7' : state === 'error' ? '#f87171' : '#93c5fd';
  const bgColor  = state === 'done' ? 'rgba(52,211,153,0.06)' : state === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(59,130,246,0.06)';
  const bdColor  = state === 'done' ? 'rgba(52,211,153,0.22)' : state === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: '1.2rem 1.4rem',
      marginBottom: '1.5rem',
    }}>
      <h2 style={{
        fontSize: '1rem', fontWeight: 700, color: '#93c5fd',
        marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        💊 약가 파일 관리
      </h2>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>
        HIRA 약가목록조회 API에서 다운로드한 Excel 파일(xlsx/csv)을 업로드하면<br />
        의약품 검색 시 업로드 파일 데이터를 우선 조회합니다.<br />
        지원 컬럼: <code style={{ fontSize: '0.7rem', opacity: 0.8 }}>품목명, 상한가, 급여구분, 규격, 단위, 시행일, 제조업체</code>
      </p>

      {/* 드롭존 */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${bdColor}`,
          borderRadius: 10,
          padding: '1.4rem',
          textAlign: 'center',
          cursor: state === 'uploading' ? 'not-allowed' : 'pointer',
          background: bgColor,
          transition: 'all 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleChange}
          disabled={state === 'uploading'}
        />

        {state === 'uploading' ? (
          <p style={{ color: '#93c5fd', fontSize: '0.88rem' }}>⏳ 업로드 중…</p>
        ) : (
          <>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>📂</p>
            <p style={{ fontSize: '0.85rem', color, fontWeight: 600 }}>
              {fileName || '파일을 드래그하거나 클릭하여 선택'}
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              xlsx / xls / csv
            </p>
          </>
        )}
      </div>

      {/* 결과 메시지 */}
      {message && (
        <div style={{
          marginTop: '0.75rem', padding: '0.6rem 0.9rem', borderRadius: 8,
          background: bgColor, border: `1px solid ${bdColor}`,
          fontSize: '0.8rem', color,
        }}>
          {state === 'done' ? '✓' : '⚠'} {message}
          {count && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.8 }}>
              ({count.inserted.toLocaleString()}건 저장 / 전체 {count.total.toLocaleString()}행)
            </span>
          )}
        </div>
      )}

      {/* 안내 */}
      <div style={{
        marginTop: '0.8rem', padding: '0.6rem 0.9rem', borderRadius: 8,
        background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)',
        fontSize: '0.73rem', color: '#fde68a', lineHeight: 1.7,
      }}>
        <strong>⚠ 사전 준비:</strong> Supabase SQL Editor에서
        <code style={{ margin: '0 4px', background: 'rgba(0,0,0,0.25)', padding: '0 4px', borderRadius: 3 }}>
          supabase/migrations/20260529_drug_prices.sql
        </code>
        을 먼저 실행해야 합니다.
      </div>
    </div>
  );
}
