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

  // /dashboard → /weekly 영구 리다이렉트
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.pathname.replace('/dashboard', '/weekly');
    return NextResponse.redirect(url, { status: 308 });
  }

  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // 로그인 추적: 인증된 사용자, 하루 1회
  if (user) {
    const today = new Date().toISOString().slice(0, 10);
    if (request.cookies.get('_ll_d')?.value !== today) {
      await supabase.from('login_logs').insert({
        user_id: user.id,
        logged_in_at: new Date().toISOString(),
      });
      supabaseResponse.cookies.set('_ll_d', today, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
      });
    }
  }

  // 인증 필요 경로
  const isProtected =
    pathname.startsWith('/weekly') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/code-delete') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/meetings') ||
    pathname.startsWith('/sales-forecast') ||
    pathname.startsWith('/sales-report') ||
    pathname.startsWith('/pending');

  if (!isProtected) return supabaseResponse;

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 승인 여부 확인이 필요한 경로 (role 체크는 서버 컴포넌트에 위임)
  const needsApproval =
    pathname.startsWith('/weekly') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/sales-forecast') ||
    pathname.startsWith('/sales-report');

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
