// middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { canAccessPath, getAllowedModulesForUser, isValidRole } from '@/lib/moduleAccess'

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
    const metadataRole = isValidRole(user.app_metadata?.role) ? user.app_metadata.role : null
    const allowedModules = getAllowedModulesForUser(user.app_metadata, metadataRole)

    if (!canAccessPath(req.nextUrl.pathname, allowedModules, metadataRole)) {
      const url = req.nextUrl.clone()
      url.pathname = allowedModules.includes('dashboard') ? '/dashboard' : '/hub'
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
