import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_COOKIE_NAME = 'revival_admin_session';
const SCANNER_COOKIE_NAME = 'revival_scanner_session';

export default function proxy(request: NextRequest) {
  const adminCookie = request.cookies.get(ADMIN_COOKIE_NAME);
  const scannerCookie = request.cookies.get(SCANNER_COOKIE_NAME);

  const isAdminAuth = adminCookie && adminCookie.value === 'authenticated';
  const isScannerAuth = scannerCookie && scannerCookie.value === 'authenticated';

  // Protect /admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (request.nextUrl.pathname === '/admin/login') {
      if (isAdminAuth) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next();
    }

    if (!isAdminAuth) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // Protect /scanner routes
  if (request.nextUrl.pathname.startsWith('/scanner')) {
    if (request.nextUrl.pathname === '/scanner/login') {
      if (isAdminAuth || isScannerAuth) {
        return NextResponse.redirect(new URL('/scanner', request.url));
      }
      return NextResponse.next();
    }

    if (!isAdminAuth && !isScannerAuth) {
      return NextResponse.redirect(new URL('/scanner/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/scanner/:path*'],
};
