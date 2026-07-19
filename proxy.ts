import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const handleI18nRouting = createIntlMiddleware({
  locales: ['en', 'ur'],
  defaultLocale: 'en'
});

export default async function middleware(request: NextRequest) {
  // 1. Let next-intl resolve locale routing/redirects first. This may itself
  //    be a redirect (e.g. "/" -> "/en").
  const intlResponse = handleI18nRouting(request);

  // 2. Hand that response to updateSession: it refreshes the Supabase auth
  //    cookies onto it, and returns its own redirect to /login instead if
  //    the user isn't authenticated. This was previously never called at
  //    all, so sessions silently went stale and auth redirects never fired.
  return await updateSession(request, intlResponse);
}

export const config = {
  matcher: [
    '/',
    '/(en|ur)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
