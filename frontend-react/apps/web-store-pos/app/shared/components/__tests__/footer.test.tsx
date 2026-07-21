import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Footer } from '../footer';

function renderFooter() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    </IntlProvider>,
  );
}

describe('Footer — parity with Angular client-footer.component.html', () => {
  it('shows the exact two-line copyright text', () => {
    renderFooter();
    const year = new Date().getFullYear();
    expect(screen.getByText(`© AutoBusinessPro - ${year}`)).toBeInTheDocument();
    expect(screen.getByText('Todos los derechos reservados')).toBeInTheDocument();
  });

  it('shows the four legal links with Angular exact text', () => {
    renderFooter();
    expect(screen.getByText('Políticas de Cookies')).toBeInTheDocument();
    expect(screen.getByText('Políticas de Privacidad')).toBeInTheDocument();
    expect(screen.getByText('Términos y Condiciones')).toBeInTheDocument();
    expect(screen.getByText('Contáctanos')).toBeInTheDocument();
  });

  it('legal links point to the Angular-equivalent paths', () => {
    renderFooter();
    expect(screen.getByText('Políticas de Cookies').closest('a')).toHaveAttribute('href', '/cookies-private');
    expect(screen.getByText('Políticas de Privacidad').closest('a')).toHaveAttribute('href', '/private-police');
    expect(screen.getByText('Términos y Condiciones').closest('a')).toHaveAttribute('href', '/terms-conditions');
  });

  it('legal links open in a new tab, matching Angular target="_blank"', () => {
    renderFooter();
    expect(screen.getByText('Políticas de Cookies').closest('a')).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Políticas de Privacidad').closest('a')).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Términos y Condiciones').closest('a')).toHaveAttribute('target', '_blank');
  });

  it('renders the email icon before "Contáctanos", matching Angular <mat-icon>email</mat-icon>', () => {
    renderFooter();
    const contact = screen.getByText('Contáctanos').closest('button');
    expect(contact).not.toBeNull();
    expect(contact?.querySelector('svg')).not.toBeNull();
  });
});
