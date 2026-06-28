import { cookies } from 'next/headers';

export const ACTIVE_COMPANY_COOKIE = 'active_company_id';

/**
 * 데이터 필터링에 사용할 실제 위탁사 ID를 반환한다.
 *  - 위탁사 직접 배정 사용자 (profileCompanyId 있음): 해당 company_id
 *  - 관리자 / 아주얼라이언스 직원: 쿠키에 저장된 선택값 (없으면 null → 전체 조회)
 */
export async function getEffectiveCompanyId(
  profileCompanyId: string | null,
  _isSystemAdmin: boolean,
): Promise<string | null> {
  if (profileCompanyId) return profileCompanyId;
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
}

/** 아주얼라이언스 직원 여부 (위탁사 미배정 + 비관리자) */
export function isAllianceEmployee(profileCompanyId: string | null, isSystemAdmin: boolean): boolean {
  return !isSystemAdmin && !profileCompanyId;
}
