import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { user } } = await supabase.auth.getUser();

  const url = req.nextUrl;

  // sezioni protette
  const protectedExact = ['/'];
  const protectedPrefixes = ['/dashboard'];

  const isProtected =
    protectedExact.includes(url.pathname) ||
    protectedPrefixes.some((p) => url.pathname.startsWith(p));

  // rotta di login CORRETTA
  const loginPath = '/auth/sign-in';
  const isLogin = url.pathname === loginPath;

  if (isProtected && !user) {
    const redirectUrl = new URL(loginPath, url);
    if (!redirectUrl.searchParams.has('redirect')) {
      redirectUrl.searchParams.set('redirect', url.pathname + url.search);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (isLogin && user) {
    return NextResponse.redirect(new URL('/dashboard', url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|assets).*)'],
};
