import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { profileIsAdmin } from '@/lib/roles';
import { ACTIVE_COMPANY_COOKIE } from '@/lib/active-company';

function getSvc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ companyId: null, companyName: null, isAllianceUser: false, companies: [] });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, roles, company_id')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ companyId: null, companyName: null, isAllianceUser: false, companies: [] });
  }

  const isAdmin = profileIsAdmin(profile);
  const profileCompanyId = (profile.company_id as string) ?? null;
  const isAllianceUser = !isAdmin && !profileCompanyId;

  const svc = getSvc();

  // 관리자 포함 전환바 사용자: 쿠키에서 선택된 위탁사 읽기
  const needsSwitcher = isAllianceUser || isAdmin;
  let effectiveCompanyId: string | null = profileCompanyId;
  if (needsSwitcher) {
    const cookieStore = await cookies();
    effectiveCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
  }

  // 위탁사명 조회
  let companyName: string | null = null;
  if (effectiveCompanyId) {
    const { data: company } = await svc
      .from('client_companies')
      .select('name')
      .eq('id', effectiveCompanyId)
      .single();
    companyName = company?.name ?? null;
  }

  // 전환바 사용자(관리자 + 아주얼라이언스)용 위탁사 목록
  let companies: { id: string; name: string }[] = [];
  if (needsSwitcher) {
    const { data: companiesData } = await svc
      .from('client_companies')
      .select('id, name')
      .eq('status', 'active')
      .order('display_order', { ascending: true });
    companies = (companiesData ?? []) as { id: string; name: string }[];
  }

  return NextResponse.json({ companyId: effectiveCompanyId, companyName, isAllianceUser, companies });
}
