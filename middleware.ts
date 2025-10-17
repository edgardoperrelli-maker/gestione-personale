// middleware.ts (root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = req.nextUrl;

  const protectedPaths = ['/', '/dashboard'];
  const isProtected = protectedPaths.some((p) => url.pathname.startsWith(p));

  const isPublic =
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/api/public');

  if (isProtected && !user) {
    const redirectUrl = new URL('/login', url);
    redirectUrl.searchParams.set('redirect', url.pathname + url.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (isPublic && user && url.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|assets).*)'],
};
