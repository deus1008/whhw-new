'use client';

import { useState } from 'react';
import DrugSearchClient from '@/components/DrugSearchClient';
import MfdsListSearch from '@/components/MfdsListSearch';

const TABS = [
  { key: 'drug',   label: '💊 의약품 검색' },
  { key: 'recall', label: '⛔ 회수·판매중지' },
  { key: 'admin',  label: '⚖ 행정처분' },
] as const;

export default function DrugSearchTabs({ apiConfigured }: { apiConfigured: boolean }) {
  const [tab, setTab] = useState<'drug' | 'recall' | 'admin'>('drug');

  return (
    <div style={{ width: '100%', maxWidth: 1200 }}>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '0.5rem 1.1rem', borderRadius: 10, fontSize: '0.85rem', fontWeight: tab === t.key ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t.key ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${tab === t.key ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.12)'}`,
            color: tab === t.key ? '#fff' : 'var(--text-primary)', transition: 'all 0.12s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'drug' && <DrugSearchClient apiConfigured={apiConfigured} />}

      {tab === 'recall' && (
        <MfdsListSearch
          type="recall"
          placeholder="제품명·업체명으로 회수·판매중지 조회 (예: 라니티딘)"
          columns={[
            { key: 'product', label: '제품명', w: 220 },
            { key: 'company', label: '업체명', w: 160 },
            { key: 'reason',  label: '회수사유' },
            { key: 'date',    label: '회수명령일자', w: 120 },
          ]}
        />
      )}

      {tab === 'admin' && (
        <MfdsListSearch
          type="admin"
          placeholder="업체명·제품명으로 행정처분 조회"
          columns={[
            { key: 'company', label: '업체명', w: 170 },
            { key: 'product', label: '제품명' },
            { key: 'action',  label: '처분내용', w: 160 },
            { key: 'reason',  label: '위반내용' },
            { key: 'date',    label: '처분일자', w: 110 },
          ]}
        />
      )}
    </div>
  );
}
