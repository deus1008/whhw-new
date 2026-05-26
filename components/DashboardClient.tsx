'use client';

import Link from 'next/link';

/* ── 타입 ─────────────────────────────────────────────────── */
export interface MyStats {
  today:     number;
  thisWeek:  number;
  thisMonth: number;
  total:     number;
  cso:       number;
  dealer:    number;
}

export interface RecentVisit {
  id:            string;
  visited_at:    string;
  customer_name: string;
  customer_type: string;
  contact_name:  string | null;
  products:      string | null;
  content:       string;
  user_email?:   string;
}

export interface FollowUp {
  id:              string;
  follow_up_date:  string;
  customer_name:   string;
  customer_type:   string;
  next_action:     string | null;
}

export interface MemberStat {
  userId:    string;
  email:     string;
  thisMonth: number;
  thisWeek:  number;
  total:     number;
  cso:       number;
  dealer:    number;
  lastVisit: string | null;
}

interface Props {
  userEmail:    string;
  isAdmin:      boolean;
  canUpload:    boolean;
  myStats:      MyStats;
  recentVisits: RecentVisit[];
  followUps:    FollowUp[];
  memberStats:  MemberStat[];   // admin only
}

/* ── 메인 컴포넌트 ────────────────────────────────────────── */
export default function DashboardClient({
  userEmail, isAdmin, canUpload,
  myStats, recentVisits, followUps, memberStats,
}: Props) {
  return (
    <div style={{ paddingBottom: '2rem' }}>

      {/* ── 상단 헤더 ── */}
      <div className="auth-card" style={{ marginBottom: '1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div>
            <h1 style={titleStyle}>
              {isAdmin ? '📊 전체 실적 현황' : '📊 내 실적 현황'}
            </h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {userEmail}
            </p>
          </div>
          <Link href="/visits" style={primaryLink}>
            영업활동 작성 →
          </Link>
        </div>
      </div>

      {/* ── 통계 카드 4개 ── */}
      <div className="visit-stats-grid" style={{ marginBottom: '1.2rem' }}>
        {[
          { label: '오늘',    value: myStats.today,     color: '#fde68a', rgba: 'rgba(251,191,36,'  },
          { label: '이번 주', value: myStats.thisWeek,  color: '#86efac', rgba: 'rgba(34,197,94,'   },
          { label: '이번 달', value: myStats.thisMonth, color: '#93c5fd', rgba: 'rgba(59,130,246,'  },
          { label: '전체',    value: myStats.total,     color: '#c084fc', rgba: 'rgba(162,89,255,'  },
        ].map(({ label, value, color, rgba }) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1rem 0.5rem', borderRadius: '14px', gap: '0.25rem',
            background: `${rgba}0.08)`, border: `1px solid ${rgba}0.22)`,
          }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── 거래처 유형 분포 ── */}
      <div className="auth-card" style={{ marginBottom: '1.2rem' }}>
        <SectionTitle>거래처 유형</SectionTitle>
        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          <TypeBar label="CSO법인" count={myStats.cso}  total={myStats.total} color="#93c5fd" rgba="rgba(59,130,246," />
          <TypeBar label="딜러"    count={myStats.dealer} total={myStats.total} color="#c084fc" rgba="rgba(162,89,255," />
        </div>
      </div>

      {/* ── 후속 방문 예정 ── */}
      {followUps.length > 0 && (
        <div className="auth-card" style={{ marginBottom: '1.2rem' }}>
          <SectionTitle>📅 다가오는 후속 방문</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {followUps.map(f => (
              <div key={f.id} style={followUpRow}>
                <span style={dateChip(f.follow_up_date)}>
                  {f.follow_up_date.replace(/-/g, '.')}
                </span>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{f.customer_name}</span>
                <TypePill type={f.customer_type} />
                {f.next_action && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flex: 2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.next_action}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 관리자: 지역장별 실적 ── */}
      {isAdmin && memberStats.length > 0 && (
        <div className="auth-card" style={{ marginBottom: '1.2rem', overflowX: 'auto' }}>
          <SectionTitle>👥 지역장별 이번 달 실적</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: '500px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['지역장', '이번달', '이번주', 'CSO법인', '딜러', '마지막 방문'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberStats
                .sort((a, b) => b.thisMonth - a.thisMonth)
                .map((m, i) => (
                  <tr key={m.userId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <td style={{ padding: '0.6rem 0.6rem', color: 'var(--text-primary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.email}
                    </td>
                    <td style={{ padding: '0.6rem 0.6rem', textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#93c5fd' }}>{m.thisMonth}</span>
                    </td>
                    <td style={{ padding: '0.6rem 0.6rem', textAlign: 'center', color: 'var(--text-muted)' }}>{m.thisWeek}</td>
                    <td style={{ padding: '0.6rem 0.6rem', textAlign: 'center', color: '#93c5fd' }}>{m.cso}</td>
                    <td style={{ padding: '0.6rem 0.6rem', textAlign: 'center', color: '#c084fc' }}>{m.dealer}</td>
                    <td style={{ padding: '0.6rem 0.6rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {m.lastVisit ? m.lastVisit.replace(/-/g, '.') : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 최근 방문 기록 ── */}
      {recentVisits.length > 0 && (
        <div className="auth-card" style={{ marginBottom: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
            <SectionTitle style={{ marginBottom: 0 }}>
              {isAdmin ? '📝 최근 방문 기록 (전체)' : '📝 최근 방문 기록'}
            </SectionTitle>
            <Link href="/visits" style={{ fontSize: '0.78rem', color: 'var(--accent-1)', textDecoration: 'none' }}>
              전체 보기 →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentVisits.map(v => (
              <div key={v.id} style={recentRow}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0, minWidth: '68px' }}>
                  {v.visited_at.replace(/-/g, '.')}
                </span>
                <TypePill type={v.customer_type} />
                <span style={{ fontWeight: 600, fontSize: '0.88rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.customer_name}
                  {v.contact_name && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.3rem' }}>· {v.contact_name}</span>}
                </span>
                {v.products && (
                  <span style={{ fontSize: '0.72rem', color: '#c084fc', flexShrink: 0, display: 'none' }} className="md-show">
                    {v.products.length > 16 ? v.products.slice(0, 16) + '…' : v.products}
                  </span>
                )}
                {isAdmin && v.user_email && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.user_email}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 빠른 이동 ── */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link href="/visits" style={quickLink('#10b981', 'rgba(16,185,129,0.1)', 'rgba(16,185,129,0.25)')}>📋 영업활동</Link>
        <Link href="/chat"   style={quickLink('#67e8f9', 'rgba(6,182,212,0.1)',  'rgba(6,182,212,0.25)')}>💬 AI 챗봇</Link>
        {canUpload && <Link href="/documents" style={quickLink('#fde68a', 'rgba(251,191,36,0.1)', 'rgba(251,191,36,0.25)')}>📁 문서관리</Link>}
        {isAdmin   && <Link href="/admin"     style={quickLink('#c084fc', 'rgba(162,89,255,0.1)', 'rgba(162,89,255,0.25)')}>⚙️ 관리자</Link>}
      </div>

    </div>
  );
}

/* ── 보조 컴포넌트 ────────────────────────────────────────── */
function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 style={{
      fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.8rem',
      background: 'linear-gradient(135deg,#fff 0%,#a8c4ff 100%)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
      ...style,
    }}>
      {children}
    </h2>
  );
}

function TypePill({ type }: { type: string }) {
  const isCSO = type === 'CSO법인';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '100px', flexShrink: 0,
      fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap',
      color:       isCSO ? '#93c5fd' : '#c084fc',
      background:  isCSO ? 'rgba(59,130,246,0.12)' : 'rgba(162,89,255,0.12)',
      border: `1px solid ${isCSO ? 'rgba(59,130,246,0.28)' : 'rgba(162,89,255,0.28)'}`,
    }}>
      {type}
    </span>
  );
}

function TypeBar({ label, count, total, color, rgba }: { label: string; count: number; total: number; color: string; rgba: string }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div style={{ flex: 1, minWidth: '140px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color }}>{count}건 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: '7px', borderRadius: '100px', background: `${rgba}0.12)` }}>
        <div style={{ height: '100%', borderRadius: '100px', background: `${rgba}0.7)`, width: `${pct}%`, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function dateChip(dateStr: string): React.CSSProperties {
  const today = new Date().toISOString().slice(0, 10);
  const isToday = dateStr === today;
  const isSoon  = dateStr <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  return {
    fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
    padding: '3px 9px', borderRadius: '8px',
    color:       isToday ? '#fde68a' : isSoon ? '#fca5a5' : '#86efac',
    background:  isToday ? 'rgba(251,191,36,0.12)' : isSoon ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
    border: `1px solid ${isToday ? 'rgba(251,191,36,0.28)' : isSoon ? 'rgba(239,68,68,0.22)' : 'rgba(34,197,94,0.2)'}`,
  };
}

/* ── 스타일 상수 ─────────────────────────────────────────── */
const titleStyle: React.CSSProperties = {
  fontSize: '1.1rem', fontWeight: 700,
  background: 'linear-gradient(135deg,#fff 0%,#a8c4ff 100%)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
};

const primaryLink: React.CSSProperties = {
  padding: '0.5rem 1.1rem', borderRadius: '10px', textDecoration: 'none',
  background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))',
  color: '#fff', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap',
  minHeight: '44px', display: 'inline-flex', alignItems: 'center',
};

const followUpRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
  padding: '0.65rem 0.8rem', borderRadius: '10px',
  background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
};

const recentRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.55rem',
  padding: '0.6rem 0.7rem', borderRadius: '10px',
  background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
};

function quickLink(color: string, bg: string, bd: string): React.CSSProperties {
  return {
    padding: '0.6rem 1.1rem', borderRadius: '10px', textDecoration: 'none',
    background: bg, border: `1px solid ${bd}`, color,
    fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap',
    minHeight: '44px', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  };
}
