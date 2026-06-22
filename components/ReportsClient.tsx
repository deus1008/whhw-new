'use client';

import { useState, useTransition, useRef } from 'react';
import type { CSSProperties } from 'react';
import { createReport, updateReport, deleteReport, getDocFileUrl } from '@/app/reports/actions';

type Report = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type DocFile = {
  id: string;
  filename: string;
  file_type: string;
  created_at: string;
};

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function preview(content: string, len = 120) {
  return content.replace(/#+\s/g, '').replace(/\*+/g, '').replace(/\n/g, ' ').trim().slice(0, len) + (content.length > len ? '…' : '');
}

const EXT_COLOR: Record<string, { color: string; bg: string; bd: string }> = {
  html: { color: '#fdba74', bg: 'rgba(251,146,60,0.12)',  bd: 'rgba(251,146,60,0.28)' },
  pdf:  { color: '#fca5a5', bg: 'rgba(239,68,68,0.12)',   bd: 'rgba(239,68,68,0.28)' },
  docx: { color: '#93c5fd', bg: 'rgba(59,130,246,0.12)',  bd: 'rgba(59,130,246,0.28)' },
  xlsx: { color: '#86efac', bg: 'rgba(34,197,94,0.12)',   bd: 'rgba(34,197,94,0.28)' },
  xls:  { color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)',  bd: 'rgba(16,185,129,0.28)' },
  xlsb: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  bd: 'rgba(74,222,128,0.28)' },
};
function extMeta(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return { ext, ...(EXT_COLOR[ext] ?? { color: '#c4b5fd', bg: 'rgba(139,92,246,0.12)', bd: 'rgba(139,92,246,0.28)' }) };
}

// ── 파일 뷰어 모달 ────────────────────────────────────────────────────────────
function FileViewerModal({ file, onClose }: { file: DocFile; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const { ext } = extMeta(file.filename);

  // 마운트 시 서명 URL 발급 → HTML이면 내용 fetch
  useState(() => {
    (async () => {
      const res = await getDocFileUrl(file.id);
      if (res.error || !res.url) {
        setErrMsg(res.error ?? '파일 URL 발급 실패');
        setStatus('error');
        return;
      }
      setSignedUrl(res.url);
      if (ext === 'html') {
        try {
          const html = await fetch(res.url).then(r => r.text());
          setSrcDoc(html);
          setStatus('ready');
        } catch {
          setErrMsg('파일 내용을 불러오지 못했습니다.');
          setStatus('error');
        }
      } else {
        setStatus('ready');
      }
    })();
  });

  const canEmbed = ext === 'html' || ext === 'pdf';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      {/* 헤더 */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} style={{
          padding: '0.35rem 0.8rem', borderRadius: '7px', fontSize: '0.8rem',
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
          color: 'rgba(255,255,255,0.65)', cursor: 'pointer', flexShrink: 0,
        }}>✕ 닫기</button>
        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.filename}
        </span>
        {signedUrl && (
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.35rem 0.8rem', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 600,
              background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.35)',
              color: '#60a5fa', textDecoration: 'none', flexShrink: 0, cursor: 'pointer',
            }}
          >{canEmbed ? '새 탭' : '다운로드'}</a>
        )}
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        {status === 'loading' && (
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem' }}>불러오는 중…</p>
        )}
        {status === 'error' && (
          <p style={{ color: '#fca5a5', fontSize: '0.9rem' }}>⚠️ {errMsg}</p>
        )}
        {status === 'ready' && canEmbed && ext === 'html' && srcDoc && (
          <iframe
            srcDoc={srcDoc}
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            sandbox="allow-same-origin allow-scripts"
            title={file.filename}
          />
        )}
        {status === 'ready' && canEmbed && ext === 'pdf' && signedUrl && (
          <iframe
            src={signedUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={file.filename}
          />
        )}
        {status === 'ready' && !canEmbed && signedUrl && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.55)', marginBottom: '1rem', fontSize: '0.9rem' }}>
              이 파일 형식은 미리보기를 지원하지 않습니다.
            </p>
            <a href={signedUrl} target="_blank" rel="noopener noreferrer" style={{
              padding: '0.6rem 1.4rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
              background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.4)',
              color: '#60a5fa', textDecoration: 'none',
            }}>다운로드</a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI 리포트 생성 모달 ───────────────────────────────────────────────────────
const AI_EXAMPLES = [
  'CSO 채널별 수수료율 현황 분석',
  '자사 생동인정품목 성분별 현황',
  '약가 상위 품목 및 급여구분 분석',
  '원료 DMF 제조국별 분포 현황',
  '거래처 지역·종별 분포 현황',
];

function AiReportModal({ onClose, onDone }: { onClose: () => void; onDone: (filename: string) => void }) {
  const [topic,   setTopic]   = useState('');
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg,     setMsg]     = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const canGenerate = topic.trim().length >= 5 && status !== 'loading';

  async function handleGenerate() {
    if (!canGenerate) return;
    setStatus('loading');
    setMsg('DB 데이터 수집 및 AI 분석 중… (최대 1~2분 소요)');
    try {
      const res = await fetch('/api/reports/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topic: topic.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setStatus('error');
        setMsg(json.error ?? '생성 실패');
        return;
      }
      setStatus('done');
      setMsg(`✅ "${json.filename}" 생성 완료!`);
      setTimeout(() => { onClose(); onDone(json.filename); }, 1200);
    } catch (e) {
      setStatus('error');
      setMsg(e instanceof Error ? e.message : '네트워크 오류');
    }
  }

  const iStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem',
    borderRadius: '8px', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
    fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', resize: 'vertical',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '620px', margin: '1rem', borderRadius: '18px', background: '#131929', border: '1px solid rgba(167,139,250,0.25)', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '1.2rem' }}>✨</span>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>AI 분석 리포트 생성</h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
            분석할 주제나 질문을 입력하면 DB 데이터를 기반으로 HTML 리포트를 자동 생성합니다.
          </p>
        </div>

        {/* 예시 주제 */}
        <div>
          <p style={{ margin: '0 0 0.45rem', fontSize: '0.7rem', color: 'rgba(167,139,250,0.7)', letterSpacing: '0.04em', fontWeight: 700 }}>예시 주제</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {AI_EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => { setTopic(ex); textRef.current?.focus(); }}
                style={{
                  padding: '0.25rem 0.65rem', borderRadius: '100px', fontSize: '0.72rem',
                  background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.22)',
                  color: '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{ex}</button>
            ))}
          </div>
        </div>

        {/* 분석 주제 입력 */}
        <div>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>분석 주제 / 질문 *</p>
          <textarea
            ref={textRef}
            rows={3}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="예) 2026년 상반기 CSO 채널별 수수료 현황 및 개선 방향"
            style={iStyle}
            disabled={status === 'loading'}
          />
        </div>

        {/* 상태 메시지 */}
        {msg && (
          <div style={{
            padding: '0.7rem 1rem', borderRadius: '8px', fontSize: '0.82rem', lineHeight: 1.5,
            background: status === 'error' ? 'rgba(239,68,68,0.1)' : status === 'done' ? 'rgba(74,222,128,0.1)' : 'rgba(167,139,250,0.1)',
            border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.28)' : status === 'done' ? 'rgba(74,222,128,0.28)' : 'rgba(167,139,250,0.28)'}`,
            color: status === 'error' ? '#fca5a5' : status === 'done' ? '#86efac' : '#c4b5fd',
            display: 'flex', alignItems: 'center', gap: '0.6rem',
          }}>
            {status === 'loading' && (
              <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(167,139,250,0.3)', borderTopColor: '#a78bfa', borderRadius: '50%', flexShrink: 0, animation: 'spin 0.8s linear infinite' }} />
            )}
            {msg}
          </div>
        )}

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={status === 'loading'} style={{
            padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
          }}>취소</button>
          <button onClick={handleGenerate} disabled={!canGenerate} style={{
            padding: '0.55rem 1.3rem', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 700,
            background: canGenerate ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${canGenerate ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.1)'}`,
            color: canGenerate ? '#c4b5fd' : 'rgba(255,255,255,0.3)',
            cursor: canGenerate ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}>
            {status === 'loading' ? '생성 중…' : '✨ 리포트 생성'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 작성/수정 모달 ────────────────────────────────────────────────────────────
function ReportModal({ initial, onClose, onDone }: {
  initial?: Report;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title,   setTitle]   = useState(initial?.title   ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [error,   setError]   = useState<string | null>(null);
  const [isPending, start]    = useTransition();

  const canSave = title.trim().length > 0 && content.trim().length > 0 && !isPending;

  function handleSave() {
    if (!canSave) return;
    setError(null);
    start(async () => {
      const res = initial
        ? await updateReport(initial.id, { title, content })
        : await createReport({ title, content });
      if (res?.error) { setError(res.error); return; }
      onDone();
    });
  }

  const iStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem',
    borderRadius: '8px', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
    fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '720px', margin: '1rem', borderRadius: '16px', background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', padding: '1.5rem', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          {initial ? '리포트 수정' : '새 분석 리포트'}
        </h2>

        {error && (
          <div style={{ padding: '0.7rem 1rem', borderRadius: '8px', marginBottom: '0.9rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.82rem' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ marginBottom: '0.9rem' }}>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 0.3rem', letterSpacing: '0.04em' }}>제목 *</p>
          <input
            type="text"
            placeholder="리포트 제목"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={iStyle}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 0.3rem', letterSpacing: '0.04em' }}>
            내용 * <span style={{ color: 'rgba(255,255,255,0.25)' }}>— Claude 분석 결과를 마크다운 그대로 붙여넣기</span>
          </p>
          <textarea
            placeholder="# 제목&#10;&#10;## 섹션&#10;&#10;Claude에서 분석한 내용을 그대로 붙여넣으세요…"
            value={content}
            onChange={e => setContent(e.target.value)}
            style={{ ...iStyle, flex: 1, minHeight: '320px', resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={isPending} style={{
            padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
          }}>취소</button>
          <button onClick={handleSave} disabled={!canSave} style={{
            padding: '0.55rem 1.3rem', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600,
            background: 'rgba(96,165,250,0.2)', border: '1px solid rgba(96,165,250,0.4)',
            color: '#60a5fa', cursor: canSave ? 'pointer' : 'not-allowed', opacity: isPending ? 0.7 : 1,
          }}>
            {isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 섹션 헤더 ─────────────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1.5rem 0 0.85rem' }}>
      <div style={{ width: '3px', height: '15px', borderRadius: '2px', background: 'rgba(96,165,250,0.6)' }} />
      <h2 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {children}
      </h2>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function ReportsClient({
  reports,
  docFiles,
  isAdmin,
}: {
  reports: Report[];
  docFiles: DocFile[];
  isAdmin: boolean;
}) {
  const [modal,   setModal]   = useState<null | 'create' | Report>(null);
  const [aiModal, setAiModal] = useState(false);
  const [viewer,  setViewer]  = useState<DocFile | null>(null);
  const [, start] = useTransition();

  function handleDelete(r: Report) {
    if (!confirm(`"${r.title}" 리포트를 삭제하시겠습니까?`)) return;
    start(async () => { await deleteReport(r.id); });
  }

  const hasAny = docFiles.length > 0 || reports.length > 0;

  return (
    <div style={{ marginTop: '1rem' }}>
      {/* 관리자: 버튼 그룹 */}
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setAiModal(true)}
            style={{
              padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600,
              background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)',
              color: '#c4b5fd', cursor: 'pointer',
            }}
          >✨ AI 리포트 생성</button>
          <button
            onClick={() => setModal('create')}
            style={{
              padding: '0.55rem 1.1rem', borderRadius: '8px', fontSize: '0.83rem', fontWeight: 600,
              background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)',
              color: '#4ade80', cursor: 'pointer',
            }}
          >+ 새 리포트 작성</button>
        </div>
      )}

      {!hasAny && (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem' }}>
          등록된 분석 리포트가 없습니다.
        </div>
      )}

      {/* ── 문서 파일 섹션 (분석리포트 폴더) ── */}
      {docFiles.length > 0 && (
        <>
          <SectionHeading>📁 문서 파일</SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {docFiles.map(f => {
              const { ext, color, bg, bd } = extMeta(f.filename);
              return (
                <div
                  key={f.id}
                  style={{
                    borderRadius: '12px', padding: '0.85rem 1.1rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', gap: '0.85rem',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onClick={() => setViewer(f)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                >
                  <span style={{
                    padding: '0.15rem 0.5rem', borderRadius: '5px', fontSize: '0.68rem',
                    fontWeight: 700, letterSpacing: '0.04em',
                    color, background: bg, border: `1px solid ${bd}`,
                    flexShrink: 0, textTransform: 'uppercase',
                  }}>{ext}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.88rem', fontWeight: 500, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.filename}
                  </span>
                  <span style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    {fmtDate(f.created_at)}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>▶</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── 직접 작성 리포트 섹션 ── */}
      {reports.length > 0 && (
        <>
          <SectionHeading>📝 작성 리포트</SectionHeading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {reports.map(r => (
              <div
                key={r.id}
                style={{
                  borderRadius: '14px', padding: '1.1rem 1.25rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  display: 'flex', alignItems: 'center', gap: '1rem',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: '0 0 0.3rem', lineHeight: 1.3 }}>
                    {r.title}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', margin: '0 0 0.5rem' }}>
                    {fmtDate(r.created_at)}
                    {r.updated_at !== r.created_at && ` · 수정됨 ${fmtDate(r.updated_at)}`}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.48)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preview(r.content)}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <a
                    href={`/reports/${r.id}`}
                    style={{
                      padding: '0.4rem 0.8rem', borderRadius: '7px', fontSize: '0.78rem', fontWeight: 600,
                      background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)',
                      color: '#60a5fa', textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >열람</a>
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => setModal(r)}
                        style={{
                          padding: '0.4rem 0.8rem', borderRadius: '7px', fontSize: '0.78rem',
                          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)',
                          color: '#fbbf24', cursor: 'pointer',
                        }}
                      >수정</button>
                      <button
                        onClick={() => handleDelete(r)}
                        style={{
                          padding: '0.4rem 0.8rem', borderRadius: '7px', fontSize: '0.78rem',
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                          color: '#f87171', cursor: 'pointer',
                        }}
                      >삭제</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* AI 리포트 생성 모달 */}
      {aiModal && (
        <AiReportModal
          onClose={() => setAiModal(false)}
          onDone={() => window.location.reload()}
        />
      )}

      {/* 리포트 작성 모달 */}
      {modal && (
        <ReportModal
          initial={modal === 'create' ? undefined : modal}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); window.location.reload(); }}
        />
      )}

      {/* 파일 뷰어 모달 */}
      {viewer && (
        <FileViewerModal file={viewer} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}
