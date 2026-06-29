'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACTIVE_COMPANY_COOKIE } from '@/lib/active-company';

export async function setActiveCompany(companyId: string, redirectTo?: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
  if (redirectTo) redirect(redirectTo);
}

export async function clearActiveCompany(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_COMPANY_COOKIE);
}
