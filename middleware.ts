import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware for route protection.
 * 
 * Checks for session cookie on protected routes.
 * Detailed role checks happen in individual API routes and page server components.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes - no auth needed
  const publicPaths = ['/login', '/api/v1/auth/login'];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie on dashboard and API routes
  const sessionCookie = request.cookies.get('cab_session');

  if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/v1')) {
    if (!sessionCookie?.value) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/v1/:path*', '/login'],
};
