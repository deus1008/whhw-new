'use client';

import {
  useState, useRef, useTransition,
  DragEvent, ChangeEvent, useEffect,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { deleteDocument, renameFolder, getDownloadUrl } from '@/app/documents/actions';
import type { Document } from '@/app/documents/page';

/* ── 허용 형식 ──────────────────────────────────────────── */
const ALLOWED_EXTS = new Set(['pdf', 'docx', 'xlsx', 'xls', 'xlsb', 'html']);
const MAX_BYTES    = 200 * 1024 * 1024; // 200 MB

const FILE_META: Record<string, { label: string; color: string; bg: string; bd: string }> = {
  pdf:  { label: 'PDF',  color: '#fca5a5', bg: 'rgba(239,68,68,0.12)',   bd: 'rgba(239,68,68,0.28)'   },
  docx: { label: 'DOCX', color: '#93c5fd', bg: 'rgba(59,130,246,0.12)',  bd: 'rgba(59,130,246,0.28)'  },
  xlsx: { label: 'XLSX', color: '#86efac', bg: 'rgba(34,197,94,0.12)',   bd: 'rgba(34,197,94,0.28)'   },
  xls:  { label: 'XLS',  color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)',  bd: 'rgba(16,185,129,0.28)'  },
  xlsb: { label: 'XLSB', color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  bd: 'rgba(74,222,128,0.28)'  },
  html: { label: 'HTML', color: '#fdba74', bg: 'rgba(251,146,60,0.12)',  bd: 'rgba(251,146,60,0.28)'  },
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
    return `"${file.name}": PDF, DOCX, XLSX, XLS, XLSB, HTML만 허용됩니다.`;
  }
  if (file.size > MAX_BYTES) {
    return `"${file.name}": 200 MB 제한을 초과합니다 (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
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

/**
 * 파일명에서 정산월/처방월 정렬키를 추출.
 * 패턴: 판매대행수수료정산_YY.MM정산_YY.MM처방
 * 반환: "YYMM_YYMM" 형식 (정산월_처방월), 없으면 null
 */
function extractSettlementSortKey(filename: string): string | null {
  const m = filename.match(/(\d{2})\.(\d{2})정산_(\d{2})\.(\d{2})처방/);
  if (!m) return null;
  return `${m[1]}${m[2]}_${m[3]}${m[4]}`;
}

/** 고유 폴더 목록 추출 (null → '미분류') */
function extractFolders(docs: Document[]): string[] {
  const set = new Set<string>();
  for (const d of docs) set.add(d.category ?? '미분류');
  return Array.from(set).sort((a, b) => {
    if (a === '미분류') return 1;
    if (b === '미분류') return -1;
    return a.localeCompare(b, 'ko');
  });
}

/* ── 컴포넌트 ───────────────────────────────────────────── */
interface Props {
  initialDocuments: Document[];
  userId: string;
  isAdmin: boolean;
  companyId?: string | null;
}

export default function DocumentsClient({ initialDocuments, userId, isAdmin, companyId }: Props) {
  const [documents, setDocuments]         = useState<Document[]>(initialDocuments);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [folder, setFolder]               = useState('');
  const [newFolder, setNewFolder]         = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [activeFolder, setActiveFolder]   = useState<string | null>(null); // null = 전체
  const [isDragging, setIsDragging]       = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState('');
  const [confirmId, setConfirmId]         = useState<string | null>(null);
  const [deleteError, setDeleteError]     = useState('');
  const [isPending, startTransition]      = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  // 폴더 이름 변경 상태
  const [renamingFolder, setRenamingFolder] = useState<string | null | undefined>(undefined); // undefined = 비활성
  const [renameValue, setRenameValue]       = useState('');
  const [renameError, setRenameError]       = useState('');
  const [renameLoading, setRenameLoading]   = useState(false);
  const [noPermModal, setNoPermModal]       = useState(false);
  const fileInputRef                        = useRef<HTMLInputElement>(null);

  function requireAdmin(): boolean {
    if (!isAdmin) { setNoPermModal(true); return false; }
    return true;
  }

  // 폴더 목록 (문서가 추가/삭제될 때마다 재계산)
  const folders = extractFolders(documents);

  // activeFolder가 삭제된 경우 전체로 리셋
  useEffect(() => {
    if (activeFolder !== null && !folders.includes(activeFolder)) {
      setActiveFolder(null);
    }
  }, [folders, activeFolder]);

  // 페이지 로드 시 '처리 대기(processing)' 상태로 멈춘 문서만 자동 재시작
  // (ready + chunk_count===0 조건 제거 — RLS 오탐으로 무한 재처리 발생 방지)
  useEffect(() => {
    const stuckDocs = initialDocuments.filter(
      d => d.status === 'processing',
    );
    if (stuckDocs.length === 0) return;
    console.log(`[DocumentsClient] 처리 필요 문서 ${stuckDocs.length}개 자동 재개`);
    stuckDocs.forEach((doc, i) => {
      // 서버 부하 분산 및 TPM 한도 보호를 위해 5초 간격으로 순차 처리
      setTimeout(() => { triggerProcess(doc.id); }, i * 5_000);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 현재 탭에 표시할 문서 (정산월_처방월 패턴 파일은 해당 키 기준 내림차순, 나머지는 created_at 순 유지)
  const visibleDocs = (() => {
    const filtered = activeFolder === null
      ? documents
      : documents.filter(d => (d.category ?? '미분류') === activeFolder);
    return [...filtered].sort((a, b) => {
      const ka = extractSettlementSortKey(a.filename);
      const kb = extractSettlementSortKey(b.filename);
      if (ka && kb) return kb.localeCompare(ka); // 정산월 desc → 처방월 desc
      if (ka) return -1; // 정산 파일을 앞으로
      if (kb) return 1;
      return 0; // 나머지는 서버 순서(created_at desc) 유지
    });
  })();

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
    if (!requireAdmin()) return;
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (!requireAdmin()) { e.target.value = ''; return; }
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  }

  function removeSelectedFile(name: string) {
    setSelectedFiles(prev => prev.filter(f => f.name !== name));
  }

  // 최종 폴더명 계산
  function resolvedFolder(): string | null {
    if (showNewFolder) return newFolder.trim() || null;
    return folder || null;
  }

  /* ── 업로드 ───────────────────────────────────────────── */
  async function handleUpload() {
    if (!requireAdmin()) return;
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

    const categoryValue = resolvedFolder();
    const uploaded: Document[] = [];
    const failed:   string[]   = [];

    for (const file of selectedFiles) {
      const ext         = getExt(file.name);
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
            category:    categoryValue,
            uploaded_by: user.id,
            status:      'processing',
            summary:     null,
            company_id:  companyId ?? null,
          })
          .select()
          .single();

        if (dbErr) {
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
      // 업로드한 폴더로 탭 이동
      if (categoryValue) setActiveFolder(categoryValue);
    }
    if (failed.length > 0) setUploadError(failed.join('\n'));

    const uploadedNames = new Set(uploaded.map(d => d.filename));
    setSelectedFiles(prev => prev.filter(f => !uploadedNames.has(f.name)));
    if (failed.length === 0) {
      setFolder('');
      setNewFolder('');
      setShowNewFolder(false);

    }

    setUploading(false);

    for (const doc of uploaded) triggerProcess(doc.id);
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

      // HTML 에러 페이지가 반환될 경우 대비 (Vercel 타임아웃·메모리 초과 등)
      const text = await res.text();
      let data: { ok?: boolean; error?: string } = {};
      try { data = JSON.parse(text); } catch {
        throw new Error(`서버 오류 (HTTP ${res.status}) — 파일이 너무 크거나 지원하지 않는 형식일 수 있습니다.`);
      }
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

  /* ── 오류 파일 전체 재처리 ─────────────────────────── */
  async function handleBatchReprocess() {
    const errorDocs = visibleDocs.filter(
      d => (d.status === 'error' || d.status === 'running') && !processingIds.has(d.id),
    );
    for (const doc of errorDocs) {
      await triggerProcess(doc.id);
    }
  }

  /* ── 폴더 이름 변경 ──────────────────────────────────── */
  function startRename(dbKey: string | null, displayName: string) {
    setRenamingFolder(dbKey);
    setRenameValue(displayName === '미분류' ? '' : displayName);
    setRenameError('');
  }

  function cancelRename() {
    setRenamingFolder(undefined);
    setRenameValue('');
    setRenameError('');
  }

  async function handleRenameConfirm(oldDbKey: string | null) {
    if (!requireAdmin()) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenameError('이름을 입력하세요.'); return; }
    if (trimmed === (oldDbKey ?? '미분류')) { cancelRename(); return; }

    setRenameLoading(true);
    setRenameError('');

    const result = await renameFolder(oldDbKey, trimmed);
    setRenameLoading(false);

    if (result.error) {
      setRenameError(result.error);
      return;
    }

    // 로컬 상태 업데이트
    setDocuments(prev => prev.map(d => {
      const docFolder = d.category ?? null;
      if (docFolder === oldDbKey) return { ...d, category: trimmed };
      return d;
    }));
    if (activeFolder === (oldDbKey === null ? '미분류' : oldDbKey)) {
      setActiveFolder(trimmed);
    }
    cancelRename();
  }

  /* ── 삭제 ─────────────────────────────────────────────── */
  function handleDelete(doc: Document) {
    if (!requireAdmin()) return;
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
      {/* ── 업로드 영역 ── */}
      <div className="auth-card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={sectionTitle}>
          파일 업로드
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.4rem' }}>
            PDF · DOCX · XLSX · XLS · 최대 200 MB
          </span>
        </h2>

        {/* 드롭존 */}
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => { if (!requireAdmin()) return; fileInputRef.current?.click(); }}
          style={{
            ...dropZone,
            borderColor: isDragging ? 'rgba(79,142,247,0.6)' : 'rgba(255,255,255,0.12)',
            background:  isDragging ? 'rgba(79,142,247,0.07)' : 'rgba(255,255,255,0.02)',
            boxShadow:   isDragging ? '0 0 0 3px rgba(79,142,247,0.15)' : 'none',
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
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.xlsb,.html"
            onChange={handleFileChange} style={{ display: 'none' }} />
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
                  <button onClick={e => { e.stopPropagation(); removeSelectedFile(f.name); }}
                    style={removeBtn} aria-label="제거">×</button>
                </div>
              );
            })}
          </div>
        )}

        {uploadError && (
          <div className="auth-error" style={{ marginTop: '0.8rem', whiteSpace: 'pre-line' }}>
            {uploadError}
          </div>
        )}

        {/* 폴더 선택 + 업로드 버튼 */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* 폴더 선택 영역 */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 500 }}>
              📁 폴더 선택
            </label>
            {!showNewFolder ? (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <select
                  value={folder}
                  onChange={e => setFolder(e.target.value)}
                  disabled={uploading}
                  style={selectStyle}
                >
                  <option value="">— 폴더 없음 (미분류) —</option>
                  {folders.filter(f => f !== '미분류').map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { if (!requireAdmin()) return; setShowNewFolder(true); setFolder(''); }}
                  disabled={uploading}
                  style={newFolderBtn}
                  title="새 폴더 만들기"
                >
                  + 새 폴더
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="text"
                  value={newFolder}
                  onChange={e => setNewFolder(e.target.value)}
                  placeholder="새 폴더 이름 입력"
                  className="auth-input"
                  style={{ marginBottom: 0, flex: 1 }}
                  disabled={uploading}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setShowNewFolder(false); setNewFolder(''); }}
                  disabled={uploading}
                  style={cancelSmallBtn}
                >
                  취소
                </button>
              </div>
            )}
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
            {uploading ? <><span style={spinnerStyle} />업로드 중…</> : `업로드 (${selectedFiles.length}개)`}
          </button>
        </div>

      </div>

      {/* ── 문서 목록 ── */}
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>
            업로드된 문서
            <span style={{
              marginLeft: '0.5rem',
              background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.25)',
              borderRadius: '100px', padding: '2px 10px',
              fontSize: '0.73rem', fontWeight: 600, color: '#93c5fd',
            }}>
              {visibleDocs.length}{activeFolder !== null && `/${documents.length}`}
            </span>
          </h2>
          {/* 오류/중단 파일이 있을 때 전체 재처리 버튼 */}
          {visibleDocs.some(d => d.status === 'error' || d.status === 'running') && (
            <button
              onClick={handleBatchReprocess}
              style={{ ...retryBtn, fontSize: '0.78rem', padding: '0.38rem 0.9rem' }}
            >
              🔄 {visibleDocs.filter(d => d.status === 'error' || d.status === 'running').length}개 재처리
            </button>
          )}
        </div>

        {/* 폴더 탭 */}
        {folders.length > 0 && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
            {/* 전체 탭 */}
            <button
              onClick={() => setActiveFolder(null)}
              style={tabStyle(activeFolder === null)}
            >
              전체 {documents.length}
            </button>
            {folders.map(f => {
              const count       = documents.filter(d => (d.category ?? '미분류') === f).length;
              const dbKey       = f === '미분류' ? null : f; // DB 값 (null = 미분류)
              const isRenaming  = renamingFolder !== undefined && renamingFolder === dbKey;

              if (isRenaming) {
                return (
                  <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <input
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameConfirm(dbKey);
                        if (e.key === 'Escape') cancelRename();
                      }}
                      style={{
                        padding: '0.28rem 0.6rem', borderRadius: '8px', fontSize: '0.78rem',
                        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(79,142,247,0.5)',
                        color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', width: '110px',
                      }}
                      autoFocus
                      disabled={renameLoading}
                    />
                    <button
                      onClick={() => handleRenameConfirm(dbKey)}
                      disabled={renameLoading}
                      style={{ ...renameSaveBtn, opacity: renameLoading ? 0.5 : 1 }}
                    >
                      {renameLoading ? '…' : '저장'}
                    </button>
                    <button onClick={cancelRename} disabled={renameLoading} style={cancelSmallBtn}>
                      취소
                    </button>
                    {renameError && (
                      <span style={{ fontSize: '0.72rem', color: '#fca5a5' }}>{renameError}</span>
                    )}
                  </span>
                );
              }

              return (
                <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                  <button
                    onClick={() => setActiveFolder(f)}
                    style={tabStyle(activeFolder === f)}
                  >
                    {f === '미분류' ? '📄 미분류' : `📁 ${f}`} {count}
                  </button>
                  <button
                    onClick={() => { if (!requireAdmin()) return; startRename(dbKey, f); }}
                    style={renameIconBtn}
                    title="폴더 이름 변경"
                  >
                    ✏️
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {deleteError && (
          <div className="auth-error" style={{ marginBottom: '0.8rem' }}>{deleteError}</div>
        )}

        {visibleDocs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {activeFolder !== null ? `"${activeFolder}" 폴더에 문서가 없습니다.` : '업로드된 문서가 없습니다.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {visibleDocs.map(doc => {
              const fileMeta      = FILE_META[doc.file_type] ?? { label: doc.file_type.toUpperCase(), color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', bd: 'rgba(148,163,184,0.2)' };
              const isRunning     = processingIds.has(doc.id);
              const statusKey     = isRunning ? 'running' : doc.status;
              const statusMeta    = STATUS_META[statusKey] ?? STATUS_META['error'];
              const isConfirm      = confirmId === doc.id;
              const isError        = !isRunning && doc.status === 'error';
              const isStuck        = !isRunning && doc.status === 'processing';
              const isStuckRunning = !isRunning && doc.status === 'running';

              return (
                <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={docRow}>
                    <span style={{ flex: 1, fontSize: '0.87rem', wordBreak: 'break-all', color: 'var(--text-primary)', minWidth: '120px' }}>
                      {doc.filename}
                    </span>
                    <Badge {...fileMeta} />

                    {/* 폴더 배지 (전체 탭일 때만 표시) */}
                    {activeFolder === null && doc.category && (
                      <span
                        onClick={() => setActiveFolder(doc.category!)}
                        style={folderBadge}
                        title={`"${doc.category}" 폴더 보기`}
                      >
                        📁 {doc.category}
                      </span>
                    )}

                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                    </span>

                    {/* 상태 배지 */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                      {isRunning && <span style={{ ...spinnerStyle, width: '10px', height: '10px', borderWidth: '1.5px', borderColor: 'rgba(147,197,253,0.35)', borderTopColor: '#93c5fd' }} />}
                      <Badge label={statusMeta.label} color={statusMeta.color} bg={statusMeta.bg} bd={statusMeta.bd} />
                    </span>

                    {/* 재처리 버튼:
                        - 대기(중단): 노란색 "재처리"
                        - 오류 파일: 노란색 "재처리"
                        - 완료인데 청크 없음: 빨간색 "재처리 필요"
                        - 완료이고 청크 있음: 작은 ↺ 아이콘 (선택적 강제 재처리) */}
                    {isStuck && (
                      <button onClick={() => triggerProcess(doc.id)} disabled={isRunning} style={retryBtn}>재처리</button>
                    )}
                    {isStuckRunning && (
                      <button onClick={() => triggerProcess(doc.id)} disabled={isRunning} style={retryBtn}>재처리</button>
                    )}
                    {isError && (
                      <button onClick={() => triggerProcess(doc.id)} disabled={isRunning} style={retryBtn}>재처리</button>
                    )}
                    {!isStuck && !isStuckRunning && !isError && doc.status === 'ready' && !isRunning && (
                      <button
                        onClick={() => triggerProcess(doc.id)}
                        style={reprocessIconBtn}
                        title="강제 재처리 (학습 데이터 재생성)"
                      >↺</button>
                    )}

                    {/* 다운로드 버튼 */}
                    <DownloadButton storagePath={doc.storage_path} filename={doc.filename} />

                    {isConfirm ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>삭제?</span>
                        <button onClick={() => handleDelete(doc)} disabled={isPending}
                          style={{ ...confirmDeleteBtn, opacity: isPending ? 0.5 : 1 }}>
                          {isPending ? '…' : '확인'}
                        </button>
                        <button onClick={() => { setConfirmId(null); setDeleteError(''); }} disabled={isPending} style={cancelBtn}>
                          취소
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => { if (!requireAdmin()) return; setConfirmId(doc.id); setDeleteError(''); }}
                        disabled={isRunning} style={{ ...deleteBtn, opacity: isRunning ? 0.4 : 1 }}>
                        삭제
                      </button>
                    )}
                  </div>

                  {isStuck && (
                    <p style={{ margin: '0 0.9rem 0.3rem', fontSize: '0.74rem', color: '#fde68a', lineHeight: 1.5 }}>
                      ↳ 처리가 중단된 상태입니다. "재처리" 버튼을 눌러 학습을 다시 시작하세요.
                    </p>
                  )}
                  {isStuckRunning && (
                    <p style={{ margin: '0 0.9rem 0.3rem', fontSize: '0.74rem', color: '#93c5fd', lineHeight: 1.5 }}>
                      ↳ 처리 중 서버가 중단된 것 같습니다. "재처리" 버튼을 눌러 다시 시작하세요.
                    </p>
                  )}
                  {isError && doc.error_message && (
                    <p style={{ margin: '0 0.9rem 0.3rem', fontSize: '0.74rem', color: '#fca5a5', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      ↳ {doc.error_message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 권한 없음 팝업 */}
      {noPermModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
          onClick={() => setNoPermModal(false)}
        >
          <div
            style={{
              background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '16px', padding: '1.8rem 2rem', maxWidth: '320px', width: '100%',
              textAlign: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔒</div>
            <p style={{ color: '#e2e8f0', fontSize: '1rem', fontWeight: 600, margin: '0 0 0.4rem' }}>
              권한이 없습니다.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', margin: '0 0 1.4rem' }}>
              파일 업로드 및 관리는 관리자만 가능합니다.
            </p>
            <button
              onClick={() => setNoPermModal(false)}
              style={{
                padding: '0.5rem 1.6rem', borderRadius: '8px', border: 'none',
                background: 'rgba(255,255,255,0.1)', color: '#e2e8f0',
                fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .folder-tab:hover { opacity: 0.8; }
      `}</style>
    </div>
  );
}

/* ── 다운로드 버튼 컴포넌트 ──────────────────────────────── */
function DownloadButton({ storagePath, filename }: { storagePath: string; filename: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const result = await getDownloadUrl(storagePath);
      if (result.error || !result.url) {
        alert(result.error ?? '다운로드 URL 생성에 실패했습니다.');
        return;
      }
      // 링크 클릭으로 다운로드 트리거
      const a = document.createElement('a');
      a.href = result.url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert('다운로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      title="파일 다운로드"
      style={{
        padding: '0.22rem 0.6rem', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer',
        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
        color: '#a5b4fc', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit',
        flexShrink: 0, opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? '…' : '⬇ 다운'}
    </button>
  );
}

/* ── 스타일 ─────────────────────────────────────────────── */
const sectionTitle: React.CSSProperties = {
  fontSize: '1rem', fontWeight: 700, marginBottom: '1rem',
  background: 'linear-gradient(135deg, #ffffff 0%, #a8c4ff 100%)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap',
};

const dropZone: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  padding: '2rem 1rem', borderRadius: '14px', border: '1.5px dashed',
  cursor: 'pointer', transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
  userSelect: 'none',
};

const selectedFileRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  padding: '0.5rem 0.8rem',
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px',
};

const removeBtn: React.CSSProperties = {
  flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%',
  border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#fca5a5',
  fontSize: '0.85rem', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
};

const selectStyle: React.CSSProperties = {
  flex: 1, padding: '0.55rem 0.75rem', borderRadius: '10px',
  background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'inherit',
  outline: 'none', cursor: 'pointer',
};

const newFolderBtn: React.CSSProperties = {
  padding: '0.55rem 0.9rem', borderRadius: '10px', flexShrink: 0,
  border: '1px solid rgba(79,142,247,0.3)', background: 'rgba(79,142,247,0.1)',
  color: '#93c5fd', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const cancelSmallBtn: React.CSSProperties = {
  padding: '0.55rem 0.75rem', borderRadius: '10px', flexShrink: 0,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
};

const uploadBtn: React.CSSProperties = {
  padding: '0.68rem 1.4rem', borderRadius: '10px', border: 'none', fontFamily: 'inherit',
  background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))',
  color: '#fff', fontSize: '0.88rem', fontWeight: 600,
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  flexShrink: 0, height: '40px', boxSizing: 'border-box',
};

const spinnerStyle: React.CSSProperties = {
  width: '14px', height: '14px', flexShrink: 0,
  border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff',
  borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite',
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.32rem 0.85rem', borderRadius: '100px', cursor: 'pointer',
    fontSize: '0.78rem', fontWeight: active ? 700 : 500,
    border: active ? '1px solid rgba(79,142,247,0.5)' : '1px solid rgba(255,255,255,0.09)',
    background: active ? 'rgba(79,142,247,0.18)' : 'rgba(255,255,255,0.04)',
    color: active ? '#93c5fd' : 'var(--text-muted)',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  };
}

const folderBadge: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
  fontSize: '0.7rem', fontWeight: 500, cursor: 'pointer',
  background: 'rgba(162,89,255,0.1)', border: '1px solid rgba(162,89,255,0.2)',
  color: '#c084fc', whiteSpace: 'nowrap', flexShrink: 0,
};

const docRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.6rem',
  padding: '0.7rem 0.9rem',
  background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '10px', flexWrap: 'wrap',
};

const retryBtn: React.CSSProperties = {
  padding: '0.28rem 0.7rem', borderRadius: '6px',
  border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.1)', color: '#fde68a',
  fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
};

const reprocessNeededBtn: React.CSSProperties = {
  padding: '0.28rem 0.7rem', borderRadius: '6px',
  border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.14)', color: '#fca5a5',
  fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
};

const reprocessIconBtn: React.CSSProperties = {
  padding: '0.18rem 0.4rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)',
  fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
  lineHeight: 1, transition: 'opacity 0.15s',
};

const deleteBtn: React.CSSProperties = {
  padding: '0.28rem 0.7rem', borderRadius: '6px',
  border: '1px solid rgba(239,68,68,0.22)', background: 'rgba(239,68,68,0.09)', color: '#fca5a5',
  fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
};

const confirmDeleteBtn: React.CSSProperties = {
  padding: '0.28rem 0.65rem', borderRadius: '6px',
  border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.18)', color: '#fca5a5',
  fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

const cancelBtn: React.CSSProperties = {
  padding: '0.28rem 0.65rem', borderRadius: '6px',
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
  fontSize: '0.74rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
};

const renameIconBtn: React.CSSProperties = {
  padding: '0.18rem 0.3rem', borderRadius: '6px', border: 'none',
  background: 'transparent', fontSize: '0.72rem', cursor: 'pointer',
  lineHeight: 1, opacity: 0.5, transition: 'opacity 0.15s',
};

const renameSaveBtn: React.CSSProperties = {
  padding: '0.25rem 0.6rem', borderRadius: '6px', border: 'none', fontFamily: 'inherit',
  background: 'rgba(79,142,247,0.25)', color: '#93c5fd',
  fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
};
