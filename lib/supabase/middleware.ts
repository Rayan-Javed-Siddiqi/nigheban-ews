import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const pathWithoutLocale = pathname.replace(/^\/(en|ur)/, '')

  // Not logged in and trying to reach a protected page -> send to /login
  if (
    !user &&
    !pathWithoutLocale.startsWith('/login') &&
    !pathWithoutLocale.startsWith('/api') &&
    pathWithoutLocale !== '' && pathWithoutLocale !== '/'
  ){
    const url = request.nextUrl.clone()
    // redirect to localized login
    const localeMatch = pathname.match(/^\/(en|ur)/)
    const localePrefix = localeMatch ? localeMatch[0] : '/en'
    url.pathname = `${localePrefix}/login`
    return NextResponse.redirect(url)
  }

  return response
}