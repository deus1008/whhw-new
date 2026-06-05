/**
 * 사용자 역할 정의
 */

export type UserRole =
  | '지역장'        // 영업활동 담당
  | '사업부장'      // 지역장들의 리더
  | '사업총괄'      // 영업 총괄
  | 'PM'           // 마케팅업무 담당
  | '마케팅총괄'    // 마케팅업무 총괄
  | '영업관리'      // 영업관리업무 담당
  | '영업관리총괄'  // 영업관리업무 총괄
  | '옵저버'        // 시스템 모니터링 (읽기 전용)
  | '관리자';       // 시스템 전체 관리

/** 모든 역할 목록 */
export const ALL_ROLES: UserRole[] = [
  '지역장', '사업부장', '사업총괄',
  'PM', '마케팅총괄',
  '영업관리', '영업관리총괄',
  '옵저버',
  '관리자',
];

/** 역할 표시 정보 */
export const ROLE_META: Record<UserRole, { label: string; color: string; bg: string; border: string; desc: string }> = {
  '지역장':      { label: '지역장',     color: '#6ee7b7', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  desc: '영업활동 담당' },
  '사업부장':    { label: '사업부장',   color: '#34d399', bg: 'rgba(52,211,153,0.18)',  border: 'rgba(52,211,153,0.4)',  desc: '지역장 리더' },
  '사업총괄':    { label: '사업총괄',   color: '#fbbf24', bg: 'rgba(251,191,36,0.14)',  border: 'rgba(251,191,36,0.35)', desc: '영업 총괄' },
  'PM':          { label: 'PM',         color: '#67e8f9', bg: 'rgba(34,211,238,0.12)',  border: 'rgba(34,211,238,0.3)',  desc: '마케팅업무 담당' },
  '마케팅총괄':  { label: '마케팅총괄', color: '#22d3ee', bg: 'rgba(34,211,238,0.18)',  border: 'rgba(34,211,238,0.4)',  desc: '마케팅업무 총괄' },
  '영업관리':    { label: '영업관리',   color: '#a5b4fc', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)',  desc: '영업관리업무 담당' },
  '영업관리총괄':{ label: '영업관리총괄', color: '#818cf8', bg: 'rgba(99,102,241,0.18)', border: 'rgba(99,102,241,0.4)', desc: '영업관리업무 총괄' },
  '옵저버':      { label: '옵저버',     color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)', desc: '시스템 모니터링 (읽기 전용)' },
  '관리자':      { label: '관리자',     color: '#c084fc', bg: 'rgba(162,89,255,0.14)',  border: 'rgba(162,89,255,0.35)', desc: '시스템 전체 관리' },
};

/** 시스템 관리자 역할 */
export const ADMIN_ROLES: UserRole[] = ['관리자'];

/** 문서 업로드 가능 역할 */
export const UPLOADER_ROLES: UserRole[] = ['관리자', '영업관리총괄', '영업관리', '마케팅총괄', 'PM'];

/** 역할 체크 헬퍼 */
export const isAdminRole    = (role: string) => ADMIN_ROLES.includes(role as UserRole);
export const isUploaderRole = (role: string) => UPLOADER_ROLES.includes(role as UserRole);

/** 구버전 역할 → 신규 역할 마이그레이션 매핑 */
export const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  'admin':    '관리자',
  'uploader': '영업관리',
  'member':   '지역장',
};
