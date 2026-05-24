'use client';

import {
  useState, useRef, useTransition,
  DragEvent, ChangeEvent,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { deleteDocument } from '@/app/documents/actions';
import type { Document } from '@/app/documents/page';

/* ── 허용 형식 ──────────────────────────────────────────── */
const ALLOWED_EXTS = new Set(['pdf', 'docx', 'xlsx', 'xls']);
const MAX_BYTES    = 50 * 1024 * 1024; // 50 MB

const FILE_META: Record<string, { label: string; color: string; bg: string; bd: string }> = {
  pdf:  { label: 'PDF',  color: '#fca5a5', bg: 'rgba(239,68,68,0.12)',   bd: 'rgba(239,68,68,0.28)'   },
  docx: { label: 'DOCX', color: '#93c5fd', bg: 'rgba(59,130,246,0.12)',  bd: 'rgba(59,130,246,0.28)'  },
  xlsx: { label: 'XLSX', color: '#86efac', bg: 'rgba(34,197,94,0.12)',   bd: 'rgba(34,197,94,0.28)'   },
  xls:  { label: 'XLS',  color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)',  bd: 'rgba(16,185,129,0.28)'  },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; bd: string }> = {
  processing: { label: '대기',    color: '#fde68a', bg: 'rgba(251,191,36,0.12)', bd: 'rgba(251,191,36,0.28)' },
  running:    { label: '처리 중', color: '#93c5fd', bg: 'rgba(59,130,246,0.12)', bd: 'rgba(59,130,246,0.28)' },
  ready:      { label: '완료',    color: '#86efac', bg: 'rgba(34,197,94,0.12)',  bd: 'rgba(34,197,94,0.28)'  },
  error:      { label: '오류',    color: '#fca5a5', bg: 'rgba(239,68,68,0.12)',  bd: 'rgba(239,68,68,0.28)'  },
};

/* ── 유틸 ───────────────────────────────────────────────── */
function getExt(name: string) {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function validateFile(file: File): string | null {
  if (!ALLOWED_EXTS.has(getExt(file.name))) {
    return `"${file.name}": PDF, DOCX, XLSX, XLS만 허용됩니다.`;
  }
  if (file.size > MAX_BYTES) {
    return `"${file.name}": 50 MB 제한을 초과합니다 (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  }
  return null;
}

function Badge({ label, color, bg, bd }: { label: string; color: string; bg: string; bd: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: '100px',
      fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.03em',
      color, background: bg, border: `1px solid ${bd}`,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

/* ── 컴포넌트 ───────────────────────────────────────────── */
interface Props {
  initialDocuments: Document[];
  userId: string;
}

export default function DocumentsClient({ initialDocuments, userId }: Props) {
  const [documents, setDocuments]         = useState<Document[]>(initialDocuments);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [category, setCategory]           = useState('');
  const [isDragging, setIsDragging]       = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState('');
  const [confirmId, setConfirmId]         = useState<string | null>(null);
  const [deleteError, setDeleteError]     = useState('');
  const [isPending, startTransition]      = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  /* ── 파일 추가 ────────────────────────────────────────── */
  function addFiles(incoming: File[]) {
    const existingNames = new Set(selectedFiles.map(f => f.name));
    const errors: string[] = [];
    const valid: File[]    = [];

    for (const file of incoming) {
      if (existingNames.has(file.name)) continue;
      const err = validateFile(file);
      if (err) errors.push(err);
      else valid.push(file);
    }

    setUploadError(errors.join('\n'));
    setSelectedFiles(prev => [...prev, ...valid]);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  }

  function removeSelectedFile(name: string) {
    setSelectedFiles(prev => prev.filter(f => f.name !== name));
  }

  /* ── 업로드 ───────────────────────────────────────────── */
  async function handleUpload() {
    if (selectedFiles.length === 0 || uploading) return;
    setUploading(true);
    setUploadError('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUploadError('인증 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
      setUploading(false);
      return;
    }

    const uploaded: Document[] = [];
    const failed:   string[]   = [];

    for (const file of selectedFiles) {
      const ext         = getExt(file.name);
      // 한글·공백·특수문자를 Storage key에서 제거: UUID + 확장자만 사용
      const safeKey     = ext ? `${crypto.randomUUID()}.${ext}` : crypto.randomUUID();
      const storagePath = `${user.id}/${safeKey}`;

      try {
        const { error: storageErr } = await supabase.storage
          .from('documents')
          .upload(storagePath, file, { upsert: false });

        if (storageErr) throw new Error(`Storage 업로드 실패: ${storageErr.message}`);

        const { data: doc, error: dbErr } = await supabase
          .from('documents')
          .insert({
            filename:    file.name,
            file_type:   ext,
            storage_path: storagePath,
            category:    category.trim() || null,
            uploaded_by: user.id,
            status:      'processing',
          })
          .select()
          .single();

        if (dbErr) {
          // 테이블 삽입 실패 시 Storage 파일도 롤백
          await supabase.storage.from('documents').remove([storagePath]);
          throw new Error(`DB 저장 실패: ${dbErr.message}`);
        }

        uploaded.push(doc as Document);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '알 수 없는 오류';
        console.error('[DocumentsClient upload error]', err);
        failed.push(`"${file.name}": ${msg}`);
      }
    }

    if (uploaded.length > 0) {
      setDocuments(prev => [...[...uploaded].reverse(), ...prev]);
    }
    if (failed.length > 0) {
      setUploadError(failed.join('\n'));
    }

    const uploadedNames = new Set(uploaded.map(d => d.filename));
    setSelectedFiles(prev => prev.filter(f => !uploadedNames.has(f.name)));
    if (failed.length === 0) setCategory('');

    setUploading(false);

    // 업로드 성공한 문서 자동 처리 시작
    for (const doc of uploaded) {
      triggerProcess(doc.id);
    }
  }

  /* ── RAG 처리 트리거 ──────────────────────────────────── */
  async function triggerProcess(docId: string) {
    setProcessingIds(prev => new Set(prev).add(docId));

    try {
      const res = await fetch('/api/documents/process', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId: docId }),
      });

      const data = await res.json() as { ok?: boolean; error?: string; chunks?: number };

      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setDocuments(prev => prev.map(d =>
        d.id === docId ? { ...d, status: 'ready', error_message: null } : d
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '처리 실패';
      console.error('[DocumentsClient process error]', err);
      setDocuments(prev => prev.map(d =>
        d.id === docId ? { ...d, status: 'error', error_message: msg } : d
      ));
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }

  /* ── 삭제 ─────────────────────────────────────────────── */
  function handleDelete(doc: Document) {
    setDeleteError('');
    startTransition(async () => {
      const fd = new FormData();
      fd.set('documentId',  doc.id);
      fd.set('storagePath', doc.storage_path);
      try {
        await deleteDocument(fd);
        setDocuments(prev => prev.filter(d => d.id !== doc.id));
        setConfirmId(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '삭제 실패';
        console.error('[DocumentsClient delete error]', err);
        setDeleteError(msg);
      }
    });
  }

  /* ── 렌더 ─────────────────────────────────────────────── */
  return (
    <div>
      {/* 업로드 영역 */}
      <div className="auth-card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={sectionTitle}>
          파일 업로드
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.4rem' }}>
            PDF · DOCX · XLSX · XLS · 최대 50 MB
          </span>
        </h2>

        {/* 드롭존 */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            ...dropZone,
            borderColor:       isDragging ? 'rgba(79,142,247,0.6)' : 'rgba(255,255,255,0.12)',
            background:        isDragging ? 'rgba(79,142,247,0.07)' : 'rgba(255,255,255,0.02)',
            boxShadow:         isDragging ? '0 0 0 3px rgba(79,142,247,0.15)' : 'none',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
            {isDragging ? '여기에 놓으세요' : '클릭하거나 파일을 드래그하여 추가'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* 선택된 파일 미리보기 */}
        {selectedFiles.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {selectedFiles.map(f => {
              const meta = FILE_META[getExt(f.name)] ?? FILE_META['pdf'];
              return (
                <div key={f.name} style={selectedFileRow}>
                  <Badge {...meta} />
                  <span style={{ flex: 1, fontSize: '0.85rem', wordBreak: 'break-all' }}>{f.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {(f.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); removeSelectedFile(f.name); }}
                    style={removeBtn}
                    aria-label="제거"
                  >×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* 업로드 에러 */}
        {uploadError && (
          <div className="auth-error" style={{ marginTop: '0.8rem', whiteSpace: 'pre-line' }}>
            {uploadError}
          </div>
        )}

        {/* 카테고리 + 업로드 버튼 */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 500 }}>
              카테고리 (선택)
            </label>
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="예: 거래처명, 2025-Q1 …"
              className="auth-input"
              style={{ marginBottom: 0 }}
              disabled={uploading}
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || uploading}
            style={{
              ...uploadBtn,
              opacity: selectedFiles.length === 0 || uploading ? 0.45 : 1,
              cursor:  selectedFiles.length === 0 || uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? (
              <><span style={spinner} />업로드 중…</>
            ) : (
              `업로드 (${selectedFiles.length}개)`
            )}
          </button>
        </div>
      </div>

      {/* 문서 목록 */}
      <div className="auth-card">
        <h2 style={{ ...sectionTitle, marginBottom: '1.2rem' }}>
          업로드된 문서
          <span style={{
            marginLeft: '0.5rem',
            background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.25)',
            borderRadius: '100px', padding: '2px 10px',
            fontSize: '0.73rem', fontWeight: 600, color: '#93c5fd',
          }}>
            {documents.length}
          </span>
        </h2>

        {deleteError && (
          <div className="auth-error" style={{ marginBottom: '0.8rem' }}>{deleteError}</div>
        )}

        {documents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>업로드된 문서가 없습니다.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {documents.map(doc => {
              const fileMeta    = FILE_META[doc.file_type] ?? { label: doc.file_type.toUpperCase(), color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', bd: 'rgba(148,163,184,0.2)' };
              const isRunning   = processingIds.has(doc.id);
              const statusKey   = isRunning ? 'running' : doc.status;
              const statusMeta  = STATUS_META[statusKey] ?? STATUS_META['error'];
              const isConfirm   = confirmId === doc.id;
              const isError     = !isRunning && doc.status === 'error';

              return (
                <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={docRow}>
                    {/* 파일명 */}
                    <span style={{ flex: 1, fontSize: '0.87rem', wordBreak: 'break-all', color: 'var(--text-primary)', minWidth: '120px' }}>
                      {doc.filename}
                    </span>

                    {/* 형식 배지 */}
                    <Badge {...fileMeta} />

                    {/* 카테고리 */}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', minWidth: '60px', textAlign: 'center' }}>
                      {doc.category ?? '—'}
                    </span>

                    {/* 날짜 */}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                    </span>

                    {/* 상태 배지 (처리 중이면 스피너 포함) */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      {isRunning && <span style={{ ...spinner, width: '10px', height: '10px', borderWidth: '1.5px', borderColor: 'rgba(147,197,253,0.35)', borderTopColor: '#93c5fd' }} />}
                      <Badge label={statusMeta.label} color={statusMeta.color} bg={statusMeta.bg} bd={statusMeta.bd} />
                    </span>

                    {/* 재처리 버튼 (오류인 경우) */}
                    {isError && (
                      <button
                        onClick={() => triggerProcess(doc.id)}
                        style={retryBtn}
                      >
                        재처리
                      </button>
                    )}

                    {/* 삭제 */}
                    {isConfirm ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>삭제?</span>
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={isPending}
                          style={{ ...confirmDeleteBtn, opacity: isPending ? 0.5 : 1 }}
                        >
                          {isPending ? '…' : '확인'}
                        </button>
                        <button
                          onClick={() => { setConfirmId(null); setDeleteError(''); }}
                          disabled={isPending}
                          style={cancelBtn}
                        >
                          취소
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setConfirmId(doc.id); setDeleteError(''); }}
                        disabled={isRunning}
                        style={{ ...deleteBtn, opacity: isRunning ? 0.4 : 1 }}
                      >
                        삭제
                      </button>
                    )}
                  </div>

                  {/* 오류 메시지 (에러인 경우에만 표시) */}
                  {isError && doc.error_message && (
                    <p style={{
                      margin: '0 0.9rem 0.3rem',
                      fontSize: '0.74rem',
                      color: '#fca5a5',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}>
                      ↳ {doc.error_message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ── 스타일 상수 ─────────────────────────────────────────── */
const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 700,
  marginBottom: '1rem',
  background: 'linear-gradient(135deg, #ffffff 0%, #a8c4ff 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap',
};

const dropZone: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '2rem 1rem',
  borderRadius: '14px',
  border: '1.5px dashed',
  cursor: 'pointer',
  transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
  userSelect: 'none',
};

const selectedFileRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  padding: '0.5rem 0.8rem',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '8px',
};

const removeBtn: React.CSSProperties = {
  flexShrink: 0, width: '20px', height: '20px',
  borderRadius: '50%', border: '1px solid rgba(239,68,68,0.3)',
  background: 'rgba(239,68,68,0.1)', color: '#fca5a5',
  fontSize: '0.85rem', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
};

const uploadBtn: React.CSSProperties = {
  padding: '0.68rem 1.4rem', borderRadius: '10px',
  border: 'none', fontFamily: 'inherit',
  background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))',
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  flexShrink: 0, height: '40px', boxSizing: 'border-box',
};

const spinner: React.CSSProperties = {
  width: '14px', height: '14px', flexShrink: 0,
  border: '2px solid rgba(255,255,255,0.35)',
  borderTopColor: '#fff', borderRadius: '50%',
  display: 'inline-block',
  animation: 'spin 0.7s linear infinite',
};

const docRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.6rem',
  padding: '0.7rem 0.9rem',
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '10px', flexWrap: 'wrap',
};

const retryBtn: React.CSSProperties = {
  padding: '0.28rem 0.7rem', borderRadius: '6px',
  border: '1px solid rgba(251,191,36,0.3)',
  background: 'rgba(251,191,36,0.1)', color: '#fde68a',
  fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', flexShrink: 0,
};

const deleteBtn: React.CSSProperties = {
  padding: '0.28rem 0.7rem', borderRadius: '6px',
  border: '1px solid rgba(239,68,68,0.22)',
  background: 'rgba(239,68,68,0.09)', color: '#fca5a5',
  fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', flexShrink: 0,
};

const confirmDeleteBtn: React.CSSProperties = {
  padding: '0.28rem 0.65rem', borderRadius: '6px',
  border: '1px solid rgba(239,68,68,0.3)',
  background: 'rgba(239,68,68,0.18)', color: '#fca5a5',
  fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
};

const cancelBtn: React.CSSProperties = {
  padding: '0.28rem 0.65rem', borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
  fontSize: '0.74rem', fontWeight: 500, cursor: 'pointer',
  fontFamily: 'inherit',
};
