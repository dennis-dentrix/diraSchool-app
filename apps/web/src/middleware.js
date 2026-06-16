import { NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/pricing',
  '/privacy',
  '/terms',
  '/blog',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/accept-invite',
];

// Paths where an already-authenticated user should be bounced to the dashboard
const AUTH_PATHS = ['/', '/login', '/register'];
const HIDDEN_FEATURE_PATHS = ['/payroll'];

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('token');

  if (pathname === '/login') {
    const allowedNext = request.nextUrl.searchParams.get('next');
    const hasUnsafeParams = [...request.nextUrl.searchParams.keys()].some((key) => key !== 'next');
    if (hasUnsafeParams) {
      const cleanLoginUrl = new URL('/login', request.url);
      if (allowedNext) cleanLoginUrl.searchParams.set('next', allowedNext);
      return NextResponse.redirect(cleanLoginUrl);
    }
  }

  // If user has a token and hits the landing page or auth pages, send them home
  if (token && AUTH_PATHS.some((p) => pathname === p)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Public paths — allow through regardless of token
  if (AUTH_PATHS.includes(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (HIDDEN_FEATURE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|sitemap.xml|robots.txt|public).*)'],
};
