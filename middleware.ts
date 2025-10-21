// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = req.nextUrl.pathname === '/login'
  const isProtected = req.nextUrl.pathname.startsWith('/hub') || req.nextUrl.pathname.startsWith('/dashboard')

  if (!user && isProtected) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && req.nextUrl.pathname === '/') {
    const url = req.nextUrl.clone()
    url.pathname = '/hub'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = req.nextUrl.clone()
    url.pathname = '/hub'
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: ['/', '/login', '/hub/:path*', '/dashboard/:path*'],
}
