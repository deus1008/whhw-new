import { cookies } from 'next/headers';

export const ACTIVE_COMPANY_COOKIE = 'active_company_id';

/**
 * 데이터 필터링에 사용할 실제 위탁사 ID를 반환한다.
 *  - 관리자: 쿠키 우선 (위탁사 전환 가능), 없으면 profileCompanyId
 *  - 아주얼라이언스 직원 (company_id 없음): 쿠키에 저장된 선택값
 *  - 위탁사 배정 일반 직원 (company_id 있음): 해당 company_id 고정
 */
export async function getEffectiveCompanyId(
  profileCompanyId: string | null,
  isSystemAdmin: boolean,
): Promise<string | null> {
  // 관리자는 쿠키 우선 — profileCompanyId가 있어도 전환 가능해야 함
  if (isSystemAdmin) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
    console.log('[getEffectiveCompanyId] admin | cookie:', cookieValue, '| profile:', profileCompanyId);
    return cookieValue ?? profileCompanyId ?? null;
  }

  // 일반 사용자: 프로필 company_id 고정
  if (profileCompanyId) {
    console.log('[getEffectiveCompanyId] regular user | profile:', profileCompanyId);
    return profileCompanyId;
  }

  // 아주얼라이언스 직원 (company_id 없음): 쿠키 사용
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
  console.log('[getEffectiveCompanyId] alliance employee | cookie:', cookieValue);
  return cookieValue;
}

/** 아주얼라이언스 직원 여부 (위탁사 미배정 + 비관리자) */
export function isAllianceEmployee(profileCompanyId: string | null, isSystemAdmin: boolean): boolean {
  return !isSystemAdmin && !profileCompanyId;
}
