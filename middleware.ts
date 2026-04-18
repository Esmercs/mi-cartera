import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/pending', '/rejected']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  if (!session) {
    if (isPublic) return res
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Sesión activa: verificar estado del perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('status, role')
    .eq('id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (profile.status === 'pending') {
    if (pathname === '/pending') return res
    return NextResponse.redirect(new URL('/pending', req.url))
  }

  if (profile.status === 'rejected') {
    if (pathname === '/rejected') return res
    return NextResponse.redirect(new URL('/rejected', req.url))
  }

  // Rutas de admin: solo rol admin
  if (pathname.startsWith('/admin') && profile.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Usuario aprobado intentando entrar a páginas de auth → redirigir al dashboard
  if (isPublic) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|api/webhooks).*)',
  ],
}
