'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Company } from '@/app/companies/page';
import {
  createCompany,
  updateCompany,
  toggleCompanyStatus,
  deleteCompany,
} from '@/app/companies/actions';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '6px',
  padding: '0.42rem 0.65rem',
  fontSize: '0.82rem',
  color: '#f1f5f9',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.28rem',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'rgba(255,255,255,0.38)',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

function CompanyForm({
  company,
  onSubmit,
  onCancel,
  isPending,
}: {
  company?: Company;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit(new FormData(e.currentTarget));
  }

  return (
    <div style={{
      background: 'rgba(99,102,241,0.05)',
      border: '1px solid rgba(99,102,241,0.22)',
      borderRadius: '12px',
      padding: '1.25rem',
    }}>
      <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a5b4fc', marginBottom: '1rem' }}>
        {company ? `'${company.name}' 편집` : '새 위탁사 추가'}
      </p>
      <form onSubmit={handleSubmit}>
        {company && <input type="hidden" name="id" value={company.id} />}

        {/* 기본 정보 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <label style={labelStyle}>
            표시명 *
            <input name="name" defaultValue={company?.name} required
              placeholder="아주약품" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            내부코드 * <span style={{ fontWeight: 400, fontSize: '0.63rem' }}>(영문 소문자)</span>
            <input name="code" defaultValue={company?.code} required
              placeholder="ajou" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            법인명
            <input name="full_name" defaultValue={company?.full_name ?? ''}
              placeholder="아주약품주식회사" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            대표자
            <input name="representative" defaultValue={company?.representative ?? ''}
              placeholder="홍길동" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            사업자등록번호
            <input name="business_no" defaultValue={company?.business_no ?? ''}
              placeholder="000-00-00000" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            정렬순서
            <input name="display_order" type="number" min={0}
              defaultValue={company?.display_order ?? 1} style={inputStyle} />
          </label>
        </div>

        {/* 위탁계약 정보 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <label style={labelStyle}>
            위탁계약 시작일
            <input name="contract_start" type="date"
              defaultValue={company?.contract_start ?? ''}
              style={{ ...inputStyle, colorScheme: 'dark' }} />
          </label>
          <label style={labelStyle}>
            위탁계약 종료일
            <input name="contract_end" type="date"
              defaultValue={company?.contract_end ?? ''}
              style={{ ...inputStyle, colorScheme: 'dark' }} />
          </label>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1rem' }}>
          <label style={labelStyle}>
            자동갱신조건
            <input name="auto_renewal" defaultValue={company?.auto_renewal ?? ''}
              placeholder="예: 계약 만료 30일 전 이의 없을 시 1년 자동 연장" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            위탁품목리스트
            <input name="product_list_url" defaultValue={company?.product_list_url ?? ''}
              placeholder="URL 또는 참조 문서명" style={inputStyle} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{
            padding: '0.42rem 1rem', borderRadius: '7px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)',
          }}>
            취소
          </button>
          <button type="submit" disabled={isPending} style={{
            padding: '0.42rem 1.1rem', borderRadius: '7px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc',
            opacity: isPending ? 0.6 : 1,
          }}>
            {isPending ? '저장 중…' : company ? '수정 저장' : '추가'}
          </button>
        </div>
      </form>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.12rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>{value}</div>
    </div>
  );
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function CompaniesViewClient({
  companies,
  isAdmin,
}: {
  companies: Company[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  function wrap(fn: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) { setError(res.error); return; }
      setError(null);
      onSuccess?.();
      router.refresh();
    });
  }

  function handleCreate(fd: FormData) {
    wrap(() => createCompany(fd), () => setShowAdd(false));
  }
  function handleUpdate(fd: FormData) {
    wrap(() => updateCompany(fd), () => setEditId(null));
  }
  function handleToggle(id: string, status: string) {
    const fd = new FormData();
    fd.set('id', id); fd.set('status', status);
    wrap(() => toggleCompanyStatus(fd));
  }
  function handleDelete(id: string, name: string) {
    if (!confirm(`'${name}'을(를) 삭제하시겠습니까?\n연결된 데이터가 있으면 삭제가 거부됩니다.`)) return;
    const fd = new FormData();
    fd.set('id', id);
    wrap(() => deleteCompany(fd));
  }

  return (
    <div>
      {error && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5',
          fontSize: '0.82rem',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: '0 0.25rem' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.3)' }}>
          위탁사 {companies.length}곳
        </span>
        {isAdmin && !showAdd && (
          <button onClick={() => { setShowAdd(true); setEditId(null); setError(null); }} style={{
            padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc',
          }}>
            + 새 위탁사 추가
          </button>
        )}
      </div>

      {isAdmin && showAdd && (
        <div style={{ marginBottom: '1.25rem' }}>
          <CompanyForm
            onSubmit={handleCreate}
            onCancel={() => { setShowAdd(false); setError(null); }}
            isPending={isPending}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {companies.length === 0 && !showAdd && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)', fontSize: '0.85rem' }}>
            등록된 위탁사가 없습니다.
          </div>
        )}

        {companies.map(c => {
          const contractPeriod = (c.contract_start || c.contract_end)
            ? `${formatDate(c.contract_start) ?? '?'} ~ ${formatDate(c.contract_end) ?? '?'}`
            : null;

          return (
            <div key={c.id}>
              {isAdmin && editId === c.id ? (
                <CompanyForm
                  company={c}
                  onSubmit={handleUpdate}
                  onCancel={() => { setEditId(null); setError(null); }}
                  isPending={isPending}
                />
              ) : (
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${c.status === 'inactive' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '12px',
                  padding: '1rem 1.25rem',
                  opacity: c.status === 'inactive' ? 0.55 : 1,
                  transition: 'opacity 0.2s',
                }}>
                  {/* 헤더 행 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f1f5f9' }}>{c.name}</span>
                      <span style={{
                        fontSize: '0.72rem', fontFamily: 'monospace',
                        color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)',
                        padding: '2px 8px', borderRadius: '5px',
                      }}>
                        {c.code}
                      </span>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: '100px',
                        background: c.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
                        border:    `1px solid ${c.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
                        color:      c.status === 'active' ? '#86efac' : '#94a3b8',
                      }}>
                        {c.status === 'active' ? '운영중' : '비활성'}
                      </span>
                      {isAdmin && (
                        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)' }}>
                          순서 {c.display_order}
                        </span>
                      )}
                    </div>

                    {/* 관리자 전용 액션 버튼 */}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                        <button
                          onClick={() => { setEditId(c.id); setShowAdd(false); setError(null); }}
                          style={{
                            padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)',
                          }}>
                          편집
                        </button>
                        <button
                          onClick={() => handleToggle(c.id, c.status)}
                          disabled={isPending}
                          style={{
                            padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                            background: c.status === 'active' ? 'rgba(100,116,139,0.1)' : 'rgba(34,197,94,0.1)',
                            border:    `1px solid ${c.status === 'active' ? 'rgba(100,116,139,0.25)' : 'rgba(34,197,94,0.25)'}`,
                            color:      c.status === 'active' ? '#94a3b8' : '#86efac',
                            opacity: isPending ? 0.5 : 1,
                          }}>
                          {c.status === 'active' ? '비활성화' : '활성화'}
                        </button>
                        <button
                          onClick={() => handleDelete(c.id, c.name)}
                          disabled={isPending}
                          style={{
                            padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5',
                            opacity: isPending ? 0.5 : 1,
                          }}>
                          삭제
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 상세 정보 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem 2rem' }}>
                    <InfoRow label="법인명" value={c.full_name} />
                    <InfoRow label="대표자" value={c.representative} />
                    <InfoRow label="사업자등록번호" value={c.business_no} />
                    <InfoRow label="위탁계약기간" value={contractPeriod} />
                    <InfoRow label="자동갱신조건" value={c.auto_renewal} />
                    {c.product_list_url && (
                      <div>
                        <div style={{ fontSize: '0.63rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.12rem' }}>위탁품목리스트</div>
                        {c.product_list_url.startsWith('http') ? (
                          <a href={c.product_list_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '0.8rem', color: '#93c5fd', textDecoration: 'none', wordBreak: 'break-all' }}>
                            {c.product_list_url}
                          </a>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>{c.product_list_url}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
