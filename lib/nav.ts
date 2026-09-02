// 홈 아이콘 + 좌측 사이드바가 공유하는 네비게이션 목록.
export type NavItem = {
  href: string;
  icon: string;
  label: string;
  color: string;
  bg: string;
  bd: string;
  external?: boolean;
  action?: 'error-modal';
  adminOnly?: boolean;
};

const NEWS_URL = process.env.NEXT_PUBLIC_NEWS_URL ?? '';

export const NAV_ITEMS: NavItem[] = [
  { href: '/weekly',          icon: '📋', label: '주간회의',   color: '#2563eb', bg: 'rgba(59,130,246,0.10)',  bd: 'rgba(59,130,246,0.22)' },
  { href: '/visits',          icon: '📋', label: '영업활동',   color: '#059669', bg: 'rgba(16,185,129,0.10)',  bd: 'rgba(16,185,129,0.22)' },
  ...(NEWS_URL ? [{ href: NEWS_URL, icon: '📰', label: '기사검색', color: '#e11d48', bg: 'rgba(244,63,94,0.10)', bd: 'rgba(244,63,94,0.22)', external: true } as NavItem] : []),
  { href: '/drug-search',     icon: '💊', label: '약품검색',   color: '#059669', bg: 'rgba(52,211,153,0.10)',  bd: 'rgba(52,211,153,0.22)' },
  { href: '/medical-search',  icon: '🏥', label: '병원검색',   color: '#0891b2', bg: 'rgba(34,211,238,0.10)',  bd: 'rgba(34,211,238,0.22)' },
  { href: '/contracts',       icon: '🤝', label: '신규계약',   color: '#0891b2', bg: 'rgba(34,211,238,0.10)',  bd: 'rgba(34,211,238,0.22)' },
  { href: '/customers',       icon: '🏢', label: '거래처현황', color: '#b45309', bg: 'rgba(251,191,36,0.10)',  bd: 'rgba(251,191,36,0.22)' },
  { href: '/products',        icon: '🚀', label: '발매예정',   color: '#4f46e5', bg: 'rgba(99,102,241,0.10)',  bd: 'rgba(99,102,241,0.22)' },
  { href: '/product-list',    icon: '📦', label: '위탁품목',   color: '#059669', bg: 'rgba(52,211,153,0.10)',  bd: 'rgba(52,211,153,0.22)' },
  { href: '/dc',              icon: '🏥', label: 'DC현황',     color: '#7c3aed', bg: 'rgba(139,92,246,0.10)',  bd: 'rgba(139,92,246,0.22)' },
  { href: '/inventory',       icon: '📦', label: '품절현황',   color: '#059669', bg: 'rgba(52,211,153,0.10)',  bd: 'rgba(52,211,153,0.22)' },
  { href: '/stock',           icon: '🏭', label: '재고현황',   color: '#b45309', bg: 'rgba(251,191,36,0.10)',  bd: 'rgba(251,191,36,0.22)' },
  { href: '/calendar',        icon: '📅', label: '주요일정',   color: '#c2410c', bg: 'rgba(251,146,60,0.10)',  bd: 'rgba(251,146,60,0.22)' },
  { href: '/commission',      icon: '💰', label: '수수료시뮬', color: '#059669', bg: 'rgba(16,185,129,0.10)',  bd: 'rgba(16,185,129,0.22)' },
  { href: '/mbo',             icon: '🎯', label: '목표관리',   color: '#b45309', bg: 'rgba(245,158,11,0.10)',  bd: 'rgba(245,158,11,0.22)' },
  { href: '/disease-learning',icon: '💊', label: '질환별의약품', color: '#7c3aed', bg: 'rgba(139,92,246,0.10)', bd: 'rgba(139,92,246,0.22)' },
  { href: '/market-analysis', icon: '📈', label: '시장분석',   color: '#db2777', bg: 'rgba(236,72,153,0.10)',  bd: 'rgba(236,72,153,0.22)' },
  { href: '/sales-forecast',  icon: '📊', label: 'SF',         color: '#0891b2', bg: 'rgba(34,211,238,0.10)',  bd: 'rgba(34,211,238,0.22)' },
  { href: '/sales-report',    icon: '📈', label: 'Sales Report', color: '#0d9488', bg: 'rgba(45,212,191,0.10)', bd: 'rgba(45,212,191,0.22)', adminOnly: true },
  { href: '/competitor-intel',icon: '🕵️', label: '업계동향',   color: '#dc2626', bg: 'rgba(248,113,113,0.10)', bd: 'rgba(248,113,113,0.22)' },
  { href: '/edi',             icon: '🗂', label: '처방실적',   color: '#7c3aed', bg: 'rgba(168,85,247,0.10)',  bd: 'rgba(168,85,247,0.22)' },
  { href: '/settlement',      icon: '💵', label: '수수료정산', color: '#059669', bg: 'rgba(74,222,128,0.10)',  bd: 'rgba(74,222,128,0.22)' },
  { href: '/approval',        icon: '🔬', label: '허가현황',   color: '#0284c7', bg: 'rgba(14,165,233,0.10)',  bd: 'rgba(14,165,233,0.22)' },
  { href: '/prescription-trend', icon: '🩺', label: '다처방성분', color: '#c2410c', bg: 'rgba(249,115,22,0.10)', bd: 'rgba(249,115,22,0.22)' },
  { href: '/prescription',    icon: '🏥', label: '처방처현황', color: '#059669', bg: 'rgba(74,222,128,0.10)',  bd: 'rgba(74,222,128,0.22)' },
  { href: '/filtering',       icon: '🔍', label: '종병필터링', color: '#0284c7', bg: 'rgba(14,165,233,0.10)',  bd: 'rgba(14,165,233,0.22)' },
  { href: '/code-delete',     icon: '🗑', label: '삭제대상처', color: '#dc2626', bg: 'rgba(239,68,68,0.10)',   bd: 'rgba(239,68,68,0.22)' },
  { href: '/documents',       icon: '📁', label: '문서관리',   color: '#b45309', bg: 'rgba(251,191,36,0.10)',  bd: 'rgba(251,191,36,0.22)' },
  { href: '/reports',         icon: '📝', label: '분석리포트', color: '#0891b2', bg: 'rgba(6,182,212,0.10)',   bd: 'rgba(6,182,212,0.22)' },
  { href: '/notices',         icon: '📢', label: '공지사항',   color: '#b45309', bg: 'rgba(251,191,36,0.10)',  bd: 'rgba(251,191,36,0.22)' },
  { href: '/meetings',        icon: '🗒️', label: 'Task',       color: '#059669', bg: 'rgba(74,222,128,0.10)',  bd: 'rgba(74,222,128,0.22)' },
  { href: '/commission-rate', icon: '📑', label: '수수료율',   color: '#b45309', bg: 'rgba(251,191,36,0.10)',  bd: 'rgba(251,191,36,0.22)' },
  { href: '#',                icon: '🐛', label: '오류신고',   color: '#dc2626', bg: 'rgba(239,68,68,0.10)',   bd: 'rgba(239,68,68,0.22)', action: 'error-modal' },
  { href: '/errors',          icon: '📬', label: '오류신고함', color: '#dc2626', bg: 'rgba(239,68,68,0.08)',   bd: 'rgba(239,68,68,0.20)', adminOnly: true },
  { href: '/companies',       icon: '🏢', label: '위탁사현황', color: '#0284c7', bg: 'rgba(14,165,233,0.10)',  bd: 'rgba(14,165,233,0.22)' },
  { href: '/admin',           icon: '⚙️', label: '관리자',     color: '#9333ea', bg: 'rgba(162,89,255,0.10)',  bd: 'rgba(162,89,255,0.22)', adminOnly: true },
];
