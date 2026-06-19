import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  // /수수료율 → /commission-rate 리다이렉트 (한국어 경로 Lambda 충돌 우회)
  try {
    const decoded = decodeURIComponent(request.nextUrl.pathname);
    if (decoded === '/수수료율') {
      const url = request.nextUrl.clone();
      url.pathname = '/commission-rate';
      return NextResponse.redirect(url, { status: 308 });
    }
  } catch {}

  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // 인증 필요 경로
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/meetings') ||
    pathname.startsWith('/pending');

  if (!isProtected) return supabaseResponse;

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 승인 여부 확인이 필요한 경로 (role 체크는 서버 컴포넌트에 위임)
  const needsApproval =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/documents');

  if (needsApproval) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.status !== 'approved') {
      return NextResponse.redirect(new URL('/pending', request.url));
    }
    // role 기반 접근 제어(/admin 관리자만, /documents 업로드 권한만)는
    // 각 서버 컴포넌트에서 처리 — proxy에서 중복 role 체크 시
    // 쿼리 실패로 profile=null이 되어 잘못된 redirect 발생 가능
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
