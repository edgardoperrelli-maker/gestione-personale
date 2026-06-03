// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { canAccessPathFromMetadata } from '@/lib/moduleAccess'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = req.nextUrl.pathname === '/login'
  const isProtected = req.nextUrl.pathname.startsWith('/hub') || req.nextUrl.pathname.startsWith('/dashboard') || req.nextUrl.pathname.startsWith('/impostazioni')

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

  if (user && isProtected) {
    if (!canAccessPathFromMetadata(req.nextUrl.pathname, user.app_metadata)) {
      const url = req.nextUrl.clone()
      url.pathname = '/hub'
      return NextResponse.redirect(url)
    }
  }

  if (user && isAuthRoute) {
    const url = req.nextUrl.clone()
    url.pathname = '/hub'
    return NextResponse.redirect(url)
  }

  // Block password recovery page — all users have fake @local.it emails
  if (req.nextUrl.pathname.startsWith('/account')) {
    const url = req.nextUrl.clone()
    url.pathname = '/hub'
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: ['/', '/login', '/hub/:path*', '/dashboard/:path*', '/impostazioni/:path*'],
}
