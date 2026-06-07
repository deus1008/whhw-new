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

/** 단일 role 문자열 체크 헬퍼 (레거시 호환) */
export const isAdminRole    = (role: string) => ADMIN_ROLES.includes(role as UserRole);
export const isUploaderRole = (role: string) => UPLOADER_ROLES.includes(role as UserRole);

// ── LEGACY_ROLE_MAP / normalizeRole 을 getRoles 보다 먼저 선언 ────────────

/**
 * 구버전 role 값 → 신규 역할명 매핑
 * 예: 'admin' → '관리자', 'uploader' → '영업관리'
 */
export const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  'admin':    '관리자',
  'uploader': '영업관리',
  'member':   '지역장',
};

/**
 * 구버전 role 값을 신규 역할명으로 정규화
 * 이미 신규 역할명이면 그대로 반환
 */
export function normalizeRole(role: string | null | undefined): string {
  if (!role) return '';
  return LEGACY_ROLE_MAP[role] ?? role;
}

// ── 프로필 역할 헬퍼 ──────────────────────────────────────────────────────

/**
 * 프로필 객체에서 유효한 역할 배열 반환 (정규화 포함)
 * - roles 배열이 있으면 그것을 사용, 없으면 role 단일 값 사용
 * - 'admin' / 'uploader' / 'member' 등 구버전 값도 신규 역할명으로 변환
 */
export function getRoles(profile: { role?: string | null; roles?: string[] | null }): UserRole[] {
  const raw: string[] =
    (profile.roles && profile.roles.length > 0)
      ? profile.roles
      : profile.role ? [profile.role] : [];
  return raw
    .map(r => normalizeRole(r))
    .filter((r): r is UserRole => r !== '');
}

/** 프로필이 특정 역할을 가지는지 확인 */
export function profileHasRole(
  profile: { role?: string | null; roles?: string[] | null },
  role: UserRole,
): boolean {
  return getRoles(profile).includes(role);
}

/** 프로필이 관리자인지 확인 */
export function profileIsAdmin(profile: { role?: string | null; roles?: string[] | null }): boolean {
  return profileHasRole(profile, '관리자');
}

/** 프로필이 문서 업로드 권한을 가지는지 확인 */
export function profileCanUpload(profile: { role?: string | null; roles?: string[] | null }): boolean {
  return getRoles(profile).some(r => UPLOADER_ROLES.includes(r));
}
