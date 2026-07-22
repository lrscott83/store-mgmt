import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { Footer } from '../footer';

function renderFooter(variant?: 'client' | 'guest') {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <MemoryRouter>
        <Footer variant={variant} />
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

  it('default (client) variant does NOT render the guest pill styling on Contact', () => {
    renderFooter();
    const contact = screen.getByText('Contáctanos').closest('button');
    expect(contact).not.toHaveClass('rounded-full');
    expect(contact?.querySelector('svg')).not.toHaveClass('text-[#f5b026]');
  });
});

describe('Footer — guest variant parity with Angular guest-footer.component.scss .contact-link', () => {
  it('renders the gold pill (border, rounded, tinted background) on the Contact trigger', () => {
    renderFooter('guest');
    const contact = screen.getByText('Contáctanos').closest('button');
    expect(contact).toHaveClass('rounded-full');
    expect(contact).toHaveClass('border-[rgba(245,176,38,0.25)]');
    expect(contact).toHaveClass('bg-[rgba(245,176,38,0.08)]');
  });

  it('renders the email icon in the Angular amber (#f5b026)', () => {
    renderFooter('guest');
    const contact = screen.getByText('Contáctanos').closest('button');
    expect(contact?.querySelector('svg')).toHaveClass('text-[#f5b026]');
  });

  it('uses a legible text color on the light auth background, not Angular\'s dark-theme cream literal', () => {
    renderFooter('guest');
    const contact = screen.getByText('Contáctanos').closest('button');
    // Angular's `rgba(232,228,220,0.7)` cream only reads on a dark login background;
    // React's AuthLayout is light, so the default text must be a legible dark/neutral tone.
    expect(contact).toHaveClass('text-gray-700');
    expect(contact).not.toHaveClass('text-[rgba(232,228,220,0.7)]');
  });

  it('deepens the Contact text on hover as a deliberate emphasis, matching the app\'s muted-to-emphasis convention', () => {
    renderFooter('guest');
    const contact = screen.getByText('Contáctanos').closest('button');
    expect(contact).toHaveClass('hover:text-text');
  });
});
