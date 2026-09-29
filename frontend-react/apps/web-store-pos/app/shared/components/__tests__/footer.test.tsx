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

  it('shows the legal links with Angular exact text', () => {
    renderFooter();
    expect(screen.queryByText('Políticas de Cookies')).not.toBeInTheDocument();
    expect(screen.getByText('Políticas de Privacidad')).toBeInTheDocument();
    expect(screen.getByText('Términos y Condiciones')).toBeInTheDocument();
    expect(screen.getByText('Contáctanos')).toBeInTheDocument();
  });

  it('legal links point to the Angular-equivalent paths', () => {
    renderFooter();
    expect(screen.getByText('Políticas de Privacidad').closest('a')).toHaveAttribute(
      'href',
      '/private-police',
    );
    expect(screen.getByText('Términos y Condiciones').closest('a')).toHaveAttribute(
      'href',
      '/terms-conditions',
    );
  });

  it('legal links open in a new tab, matching Angular target="_blank"', () => {
    renderFooter();
    expect(screen.getByText('Políticas de Privacidad').closest('a')).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(screen.getByText('Términos y Condiciones').closest('a')).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  it('renders "Contáctanos" as a real WhatsApp link (wa.me) opening in a new tab', () => {
    renderFooter();
    const label = screen.getByText('Contáctanos');
    expect(label).toBeInTheDocument();

    const contact = label.closest('a');
    expect(contact).not.toBeNull();
    expect(contact).toHaveAttribute('href', 'https://wa.me/5352432968');
    expect(contact).toHaveAttribute('target', '_blank');
    expect(contact).toHaveAttribute('rel', 'noopener noreferrer');

    // The WhatsApp mark is a filled glyph — fills currentColor, carries no stroke.
    const icon = contact?.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('fill', 'currentColor');
    expect(icon).not.toHaveAttribute('stroke');
  });

  it('default (client) variant does NOT render the guest pill styling on Contact', () => {
    renderFooter();
    const contact = screen.getByText('Contáctanos').closest('a');
    expect(contact).not.toHaveClass('rounded-full');
    expect(contact?.querySelector('svg')).not.toHaveClass('text-[#f5b026]');
  });
});

// The guest variant is the auth/login footer, rendered only by `auth-layout`, so
// it IS the unauthenticated context. The WhatsApp contact link is gated to
// authenticated sessions, so the guest gold-pill styling this block used to
// assert (rounded/border/tinted background, amber icon, hover emphasis) is no
// longer reachable from this variant and is NOT covered by these tests. That
// styling branch is deliberately left in place in `footer.tsx`; it never renders.
describe('Footer — guest variant (unauthenticated): Contact is not rendered', () => {
  it('does not render the Contact item at all', () => {
    renderFooter('guest');
    expect(screen.queryByText('Contáctanos')).not.toBeInTheDocument();
  });

  it('renders no WhatsApp link in the guest footer', () => {
    const { container } = renderFooter('guest');
    expect(screen.queryByRole('link', { name: /Contáctenos/i })).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="https://wa.me"]')).toBeNull();
  });

  it('still renders the legal links and the copyright block', () => {
    renderFooter('guest');
    expect(screen.getByText('Políticas de Privacidad')).toBeInTheDocument();
    expect(screen.getByText('Términos y Condiciones')).toBeInTheDocument();
    expect(screen.getByText('Todos los derechos reservados')).toBeInTheDocument();
  });
});
