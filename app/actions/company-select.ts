'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { ACTIVE_COMPANY_COOKIE } from '@/lib/active-company';

export async function setActiveCompany(companyId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
  revalidatePath('/', 'layout');
}

export async function clearActiveCompany(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_COMPANY_COOKIE);
  revalidatePath('/', 'layout');
}
