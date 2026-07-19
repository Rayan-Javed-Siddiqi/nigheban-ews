import {notFound} from 'next/navigation';
import {getRequestConfig} from 'next-intl/server';

const locales = ['en', 'ur'];

export default getRequestConfig(async ({requestLocale}) => {
  let locale = await requestLocale;
  
  if (!locale || !locales.includes(locale as any)) {
    locale = 'en';
  }

  let messages = {};
  try {
    messages = (await import(`./messages/${locale}.json`)).default;
  } catch (err) {
    console.error("Failed to load messages for locale:", locale, err);
  }
  return {
    locale,
    messages
  };
});
