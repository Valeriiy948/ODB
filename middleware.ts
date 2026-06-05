import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Сторінки/API що доступні БЕЗ авторизації
const PUBLIC_PATHS = [
  '/login',
  '/api/health',
  '/api/cron/',    // cron jobs — перевіряють CRON_SECRET самостійно
  '/_next',
  '/favicon.ico',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Публічні шляхи — пропускаємо
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Статичні файли
  if (pathname.match(/\.(ico|png|jpg|svg|css|js|woff2?)$/)) {
    return NextResponse.next()
  }

  // Створюємо Supabase клієнт з cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // ── Внутрішній server-to-server ключ (search-all → api/*) ───────────────────
  const internalKey = request.headers.get('x-internal-key')
  if (process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) {
    return NextResponse.next({ request: { headers: request.headers } })
  }

  // Перевіряємо сесію
  const { data: { user } } = await supabase.auth.getUser()

  // Не авторизований → redirect на login
  if (!user) {
    // API запити → 401 JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      )
    }
    // UI сторінки → redirect
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    // Все крім _next/static, _next/image, favicon
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
