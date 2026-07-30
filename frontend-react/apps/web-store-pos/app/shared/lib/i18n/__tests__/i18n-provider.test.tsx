import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useIntl } from 'react-intl';
import { I18nProvider } from '../i18n-provider';

function MessageDisplay({ id }: { id: string }) {
  const intl = useIntl();
  return <span>{intl.formatMessage({ id })}</span>;
}

describe('I18nProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to Spanish when no language stored', () => {
    render(
      <I18nProvider>
        <MessageDisplay id="GENERAL.APP_NAME" />
      </I18nProvider>
    );
    expect(screen.getByText('VendeDTo')).toBeInTheDocument();
  });

  it('uses Spanish messages when language is set to es', () => {
    localStorage.setItem('language', 'es');
    render(
      <I18nProvider>
        <MessageDisplay id="AUTH.SIGN_IN" />
      </I18nProvider>
    );
    expect(screen.getByText('Iniciar sesión')).toBeInTheDocument();
  });

  it('falls back to Spanish for unsupported locale', () => {
    localStorage.setItem('language', 'fr');
    render(
      <I18nProvider>
        <MessageDisplay id="GENERAL.LOADING" />
      </I18nProvider>
    );
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });

  it('renders children inside IntlProvider', () => {
    render(
      <I18nProvider>
        <div data-testid="child">content</div>
      </I18nProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
