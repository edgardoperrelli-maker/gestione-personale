import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { user } } = await supabase.auth.getUser();

  const url = req.nextUrl;

  // tutte le rotte protette
  const protectedPaths = ['/', '/dashboard'];
  const isProtected = protectedPaths.some((p) => url.pathname.startsWith(p));

  // rotte pubbliche
  const isPublic = url.pathname.startsWith('/login') || url.pathname.startsWith('/auth');

  // se non loggato → vai al login
  if (isProtected && !user) {
    const redirectUrl = new URL('/login', url);
    redirectUrl.searchParams.set('redirect', url.pathname + url.search);
    return NextResponse.redirect(redirectUrl);
  }

  // se loggato e tenta di andare su /login → vai al dashboard
  if (isPublic && user && url.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', url));
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public|assets).*)',
  ],
};
