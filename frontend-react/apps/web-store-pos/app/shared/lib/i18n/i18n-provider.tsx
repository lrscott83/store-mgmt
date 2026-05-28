import { useMemo, type ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import esMessages from './es';

const SUPPORTED_LOCALES = ['es'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const messagesByLocale: Record<SupportedLocale, Record<string, string>> = {
  es: esMessages,
};

function resolveLocale(): SupportedLocale {
  try {
    const stored = localStorage.getItem('language');
    if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
      return stored as SupportedLocale;
    }
  } catch {
    // localStorage not available (SSR)
  }
  return 'es';
}

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const locale = useMemo(() => resolveLocale(), []);
  const messages = messagesByLocale[locale];

  return (
    <IntlProvider locale={locale} messages={messages} defaultLocale="es">
      {children}
    </IntlProvider>
  );
}
