'use client';

import { useState, useRef, useEffect } from 'react';
import { setActiveCompany } from '@/app/actions/company-select';

type Company = { id: string; name: string };

interface Props {
  companies: Company[];
  activeCompanyId: string | null;
  onAfterSelect?: (companyId: string, companyName: string) => void;
}

export default function AllianceCompanyBar({ companies, activeCompanyId, onAfterSelect }: Props) {
  const [open, setOpen] = useState(!activeCompanyId);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeName = companies.find(c => c.id === activeCompanyId)?.name ?? '';

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        if (activeCompanyId) setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open, activeCompanyId]);

  async function select(companyId: string) {
    if (companyId === activeCompanyId || pendingId) return;
    setPendingId(companyId);
    await setActiveCompany(companyId);
    if (onAfterSelect) {
      setOpen(false);
      const name = companies.find(c => c.id === companyId)?.name ?? '';
      onAfterSelect(companyId, name);
      setPendingId(null);
    } else {
      window.location.reload();
    }
  }

  // 최초 방문 (activeCompanyId 없음): 전체화면 모달로 강제 선택
  if (!activeCompanyId) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #cdddfb',
          borderRadius: '18px',
          padding: '2rem 1.75rem',
          width: '100%', maxWidth: '380px',
          boxShadow: '0 24px 80px rgba(15,23,42,0.18)',
        }}>
          <h2 style={{ fontSize: '1.08rem', fontWeight: 700, color: '#111827', marginBottom: '0.35rem' }}>
            위탁사 선택
          </h2>
          <p style={{ fontSize: '0.77rem', color: '#64748b', marginBottom: '1.5rem' }}>
            업무를 진행할 위탁제약사를 선택해주세요.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {companies.map(c => (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                disabled={!!pendingId}
                style={{
                  padding: '0.8rem 1rem', borderRadius: '10px', textAlign: 'left',
                  fontSize: '0.95rem', fontWeight: 600, cursor: pendingId ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  background: pendingId === c.id ? '#e8f0fe' : '#ffffff',
                  border: pendingId === c.id ? '1.5px solid #2563eb' : '1px solid #e5e9f0',
                  color: pendingId === c.id ? '#2563eb' : '#111827',
                  opacity: pendingId && pendingId !== c.id ? 0.4 : 1,
                  transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                {c.name}
                {pendingId === c.id && (
                  <span style={{ fontSize: '0.72rem', color: '#2563eb' }}>적용 중…</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 위탁사 전환 바 + 인라인 드롭다운
  return (
    <div
      ref={dropdownRef}
      className="no-print"
      style={{ position: 'relative', marginBottom: '1.25rem' }}
    >
      {/* 바 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.65rem',
        padding: '0.5rem 0.85rem',
        background: open ? '#e8f0fe' : '#f0f4ff',
        border: open ? '1px solid #93b4f7' : '1px solid #cdddfb',
        borderRadius: open ? '10px 10px 0 0' : '10px',
        cursor: 'pointer',
        transition: 'all 0.12s',
        userSelect: 'none',
      }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>현재 위탁사</span>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#2563eb' }}>{activeName}</span>
        <span style={{
          marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600,
          color: 'rgba(37,99,235,0.55)',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
          display: 'inline-block',
        }}>▼</span>
      </div>

      {/* 드롭다운 */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#ffffff',
          border: '1px solid #cdddfb',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(15,23,42,0.15)',
          padding: '0 0.4rem',
        }}>
          {companies.map((c, i) => {
            const isActive = c.id === activeCompanyId;
            const isPending = pendingId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                disabled={!!pendingId || isActive}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                  width: '100%',
                  padding: isActive ? '0.6rem 0.85rem' : '0.65rem 0.85rem',
                  margin: isActive ? '0.35rem 0' : 0,
                  borderTop: i > 0 && !isActive ? '1px solid #eaeef4' : 'none',
                  background: isActive
                    ? '#e8f0fe'
                    : isPending
                    ? '#eef2fe'
                    : 'transparent',
                  border: 'none',
                  borderRadius: isActive ? '6px' : 0,
                  color: isActive ? '#1e1b4b' : isPending ? '#7c3aed' : '#111827',
                  fontSize: '0.88rem', fontWeight: isActive ? 700 : 500,
                  cursor: isActive || pendingId ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  opacity: pendingId && !isPending && !isActive ? 0.4 : 1,
                  transition: 'background 0.1s',
                  gap: '0.5rem',
                  boxShadow: isActive ? '0 1px 6px rgba(15,23,42,0.12)' : 'none',
                }}
              >
                {/* 활성 표시 dot */}
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                  background: isActive ? '#4f46e5' : '#cbd5e1',
                }} />
                {c.name}
                {isPending && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#2563eb' }}>
                    적용 중…
                  </span>
                )}
                {isActive && !isPending && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#6366f1', fontWeight: 600 }}>
                    선택됨
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
