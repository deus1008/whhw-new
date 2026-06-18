import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  try {
    const decoded = decodeURIComponent(request.nextUrl.pathname);
    if (decoded === '/수수료율') {
      const url = request.nextUrl.clone();
      url.pathname = '/commission-rate';
      return NextResponse.redirect(url, { status: 308 });
    }
  } catch {}
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
