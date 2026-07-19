import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const handleI18nRouting = createIntlMiddleware({
  locales: ['en', 'ur'],
  defaultLocale: 'en'
});

export default async function middleware(request: NextRequest) {
  return handleI18nRouting(request);
}

export const config = {
  matcher: [
    '/',
    '/(en|ur)/:path*',
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
