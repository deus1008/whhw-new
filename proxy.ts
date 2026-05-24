import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // 인증 필요 경로
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/pending');

  if (!isProtected) return supabaseResponse;

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // profile(status + role) 조회가 필요한 경로
  const needsProfile =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/documents');

  if (needsProfile) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('[proxy:getProfile error]', error);
    }

    // /admin: role = 'admin' 만 접근
    if (pathname.startsWith('/admin')) {
      if (!profile || profile.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    // /documents: role = 'admin' | 'uploader' 만 접근
    if (pathname.startsWith('/documents')) {
      if (!profile || profile.status !== 'approved') {
        return NextResponse.redirect(new URL('/pending', request.url));
      }
      if (profile.role !== 'admin' && profile.role !== 'uploader') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }

    // /dashboard: 승인된 사용자만 접근
    if (pathname.startsWith('/dashboard')) {
      if (!profile || profile.status !== 'approved') {
        return NextResponse.redirect(new URL('/pending', request.url));
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
