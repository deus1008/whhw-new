'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

type FileEntry = {
  source_file: string;
  row_count:   number;
  uploaded_at: string;
};

export default function DrugPriceUpload() {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMsg,   setUploadMsg]   = useState('');
  const [uploadCount, setUploadCount] = useState<{ inserted: number; total: number } | null>(null);

  const [files,        setFiles]        = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [confirmFile,  setConfirmFile]  = useState<string | null>(null); // 삭제 확인 대상
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  /* ── 파일 목록 로드 ── */
  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res  = await fetch('/api/drug-prices');
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch {
      // 무시
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  /* ── 업로드 ── */
  async function handleFile(file: File) {
    setUploadState('uploading');
    setUploadMsg('');
    setUploadCount(null);

    const form = new FormData();
    form.append('file', file);

    try {
      const res  = await fetch('/api/drug-prices', { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok || data.error) {
        setUploadState('error');
        setUploadMsg(data.error ?? '업로드 실패');
      } else {
        setUploadState('done');
        setUploadCount({ inserted: data.inserted, total: data.total });
        setUploadMsg(`"${data.fileName}" 업로드 완료`);
        fetchFiles();
      }
    } catch {
      setUploadState('error');
      setUploadMsg('서버 오류가 발생했습니다.');
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

  /* ── 삭제 ── */
  async function handleDelete(fileName: string) {
    setDeletingFile(fileName);
    setConfirmFile(null);
    try {
      const res  = await fetch(`/api/drug-prices?file=${encodeURIComponent(fileName)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error ?? '삭제 실패');
      } else {
        fetchFiles();
      }
    } catch {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setDeletingFile(null);
    }
  }

  /* ── 색상 ── */
  const uColor  = uploadState === 'done' ? '#6ee7b7' : uploadState === 'error' ? '#f87171' : '#93c5fd';
  const uBg     = uploadState === 'done' ? 'rgba(52,211,153,0.06)' : uploadState === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(59,130,246,0.06)';
  const uBorder = uploadState === 'done' ? 'rgba(52,211,153,0.22)' : uploadState === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)';

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
        marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        💊 약가 파일 관리
      </h2>

      {/* ── 업로드된 파일 목록 ── */}
      <div style={{ marginBottom: '1.2rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
          업로드된 파일
        </p>

        {loadingFiles ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>⏳ 불러오는 중…</p>
        ) : files.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            업로드된 파일이 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {files.map(f => (
              <div key={f.source_file} style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8,
                padding: '0.55rem 0.8rem',
              }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1, wordBreak: 'break-all', minWidth: '160px' }}>
                  📄 {f.source_file}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#6ee7b7', whiteSpace: 'nowrap' }}>
                  {f.row_count.toLocaleString()}건
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(f.uploaded_at).toLocaleDateString('ko-KR')}
                </span>

                {/* 삭제 확인 UI */}
                {confirmFile === f.source_file ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.72rem', color: '#fca5a5' }}>삭제할까요?</span>
                    <button
                      onClick={() => handleDelete(f.source_file)}
                      disabled={deletingFile === f.source_file}
                      style={btnStyle('danger')}
                    >
                      {deletingFile === f.source_file ? '삭제 중…' : '확인'}
                    </button>
                    <button onClick={() => setConfirmFile(null)} style={btnStyle('muted')}>
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmFile(f.source_file)}
                    disabled={!!deletingFile}
                    style={btnStyle('danger')}
                  >
                    삭제
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 구분선 ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: '1rem' }} />

      {/* ── 업로드 설명 ── */}
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.8rem', lineHeight: 1.6 }}>
        HIRA 약제급여목록 Excel(xlsx/csv)을 업로드하면 의약품 검색 시 우선 조회됩니다.<br />
        같은 파일명으로 재업로드하면 기존 데이터가 자동으로 교체됩니다.
      </p>

      {/* ── 드롭존 ── */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => uploadState !== 'uploading' && inputRef.current?.click()}
        style={{
          border: `2px dashed ${uBorder}`,
          borderRadius: 10,
          padding: '1.2rem',
          textAlign: 'center',
          cursor: uploadState === 'uploading' ? 'not-allowed' : 'pointer',
          background: uBg,
          transition: 'all 0.15s',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleChange}
          disabled={uploadState === 'uploading'}
        />
        {uploadState === 'uploading' ? (
          <p style={{ color: '#93c5fd', fontSize: '0.88rem', margin: 0 }}>⏳ 업로드 중… (대용량 파일은 시간이 걸릴 수 있습니다)</p>
        ) : (
          <>
            <p style={{ fontSize: '1.4rem', margin: '0 0 0.3rem' }}>📂</p>
            <p style={{ fontSize: '0.85rem', color: uColor, fontWeight: 600, margin: '0 0 0.2rem' }}>
              파일을 드래그하거나 클릭하여 선택
            </p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>xlsx / xls / csv</p>
          </>
        )}
      </div>

      {/* ── 업로드 결과 ── */}
      {uploadMsg && (
        <div style={{
          marginTop: '0.7rem', padding: '0.55rem 0.85rem', borderRadius: 8,
          background: uBg, border: `1px solid ${uBorder}`,
          fontSize: '0.8rem', color: uColor,
        }}>
          {uploadState === 'done' ? '✓' : '⚠'} {uploadMsg}
          {uploadCount && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.8 }}>
              ({uploadCount.inserted.toLocaleString()}건 저장 / 전체 {uploadCount.total.toLocaleString()}행)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 버튼 스타일 헬퍼 ── */
function btnStyle(variant: 'danger' | 'muted'): React.CSSProperties {
  if (variant === 'danger') return {
    padding: '0.28rem 0.65rem',
    borderRadius: 6,
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid rgba(239,68,68,0.28)',
    background: 'rgba(239,68,68,0.1)',
    color: '#fca5a5',
    flexShrink: 0,
  };
  return {
    padding: '0.28rem 0.65rem',
    borderRadius: 6,
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--text-muted)',
    flexShrink: 0,
  };
}
