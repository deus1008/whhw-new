'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { setActiveCompany } from '@/app/actions/company-select';

type Company = { id: string; name: string };

interface Props {
  companies: Company[];
  activeCompanyId: string | null;
  /** 회사 선택 완료 후 콜백 (제공 시 기본 동작 대신 호출) */
  onAfterSelect?: (companyId: string, companyName: string) => void;
}

export default function AllianceCompanyBar({ companies, activeCompanyId, onAfterSelect }: Props) {
  const [showModal, setShowModal] = useState(!activeCompanyId);
  const [selectedId, setSelectedId] = useState(activeCompanyId ?? '');
  const [isPending, setIsPending] = useState(false);
  const pathname = usePathname();

  const activeName = companies.find(c => c.id === activeCompanyId)?.name ?? '';

  async function confirm() {
    if (!selectedId || isPending) return;
    setIsPending(true);
    await setActiveCompany(selectedId);
    if (onAfterSelect) {
      setShowModal(false);
      const name = companies.find(c => c.id === selectedId)?.name ?? '';
      onAfterSelect(selectedId, name);
      setIsPending(false);
    } else {
      // 쿠키 설정 완료 후 현재 페이지 강제 재로드 → 서버에서 새 쿠키 반영
      window.location.reload();
    }
  }

  return (
    <>
      {/* 현재 위탁사 전환 바 */}
      {activeCompanyId && !showModal && (
        <div
          className="no-print"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.65rem',
            padding: '0.5rem 0.85rem',
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '10px',
            marginBottom: '1.25rem',
          }}
        >
          <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>현재 위탁사</span>
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#a5b4fc' }}>{activeName}</span>
          <button
            onClick={() => { setSelectedId(activeCompanyId); setShowModal(true); }}
            style={{
              marginLeft: 'auto',
              padding: '0.22rem 0.7rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              color: '#a5b4fc', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            위탁사 전환
          </button>
        </div>
      )}

      {/* 위탁사 선택 모달 */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: '18px',
            padding: '2rem 1.75rem',
            width: '100%', maxWidth: '380px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
          }}>
            <h2 style={{ fontSize: '1.08rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.35rem' }}>
              위탁사 선택
            </h2>
            <p style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.38)', marginBottom: '1.5rem' }}>
              업무를 진행할 위탁제약사를 선택해주세요.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {companies.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  style={{
                    padding: '0.8rem 1rem', borderRadius: '10px', textAlign: 'left',
                    fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    background: selectedId === c.id ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                    border: selectedId === c.id ? '1.5px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.1)',
                    color: selectedId === c.id ? '#a5b4fc' : '#e2e8f0',
                    transition: 'all 0.12s',
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {activeCompanyId && (
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1, padding: '0.62rem', borderRadius: '8px', fontSize: '0.82rem',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  취소
                </button>
              )}
              <button
                onClick={confirm}
                disabled={!selectedId || isPending}
                style={{
                  flex: 2, padding: '0.62rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700,
                  background: selectedId ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.05)',
                  border: selectedId ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  color: selectedId ? '#a5b4fc' : 'rgba(255,255,255,0.25)',
                  cursor: selectedId && !isPending ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  opacity: isPending ? 0.65 : 1,
                  transition: 'all 0.12s',
                }}
              >
                {isPending ? '적용 중…' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
