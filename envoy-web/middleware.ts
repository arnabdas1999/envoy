import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/', '/auth/login', '/auth/verify', '/api/auth'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const token = req.cookies.get('envoy_token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
