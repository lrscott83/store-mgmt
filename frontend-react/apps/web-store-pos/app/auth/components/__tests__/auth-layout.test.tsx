import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import AuthLayout from '../auth-layout';

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AuthLayout />,
        children: [{ index: true, element: <div>content</div> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <RouterProvider router={router} />
    </IntlProvider>,
  );
}

// The auth layout renders `<Footer variant="guest" />`, and the guest variant is
// exactly the unauthenticated context. The WhatsApp contact link is gated to
// authenticated sessions, so the gold-pill / legible-text-color assertions this
// block used to make about the Contact trigger are unreachable here and are NOT
// covered by these tests — they are replaced by the absence assertions below.
describe('AuthLayout — guest footer (Req: parity with guest-footer.component.html)', () => {
  it('renders the legal links, each opening in a new tab (target="_blank")', () => {
    renderLayout();
    const privacy = screen.getByText(esMessages['FOOTER.PRIVACY_POLICE']).closest('a');
    const terms = screen.getByText(esMessages['FOOTER.TERMS_CONDITIONS']).closest('a');

    expect(screen.queryByText('Políticas de Cookies')).not.toBeInTheDocument();
    expect(privacy).toHaveAttribute('href', '/private-police');
    expect(privacy).toHaveAttribute('target', '_blank');
    expect(terms).toHaveAttribute('href', '/terms-conditions');
    expect(terms).toHaveAttribute('target', '_blank');
  });

  it('does NOT render the Contact Us item (FOOTER.CONTACT_US) — the auth layout is the unauthenticated context', () => {
    renderLayout();
    expect(screen.queryByText(esMessages['FOOTER.CONTACT_US'])).not.toBeInTheDocument();
  });

  it('renders no WhatsApp link (wa.me) in the guest footer', () => {
    const { container } = renderLayout();
    expect(container.querySelector('a[href^="https://wa.me"]')).toBeNull();
  });

  it('still renders both legal links, so the absent Contact item did not empty the row', () => {
    renderLayout();
    expect(screen.getByText(esMessages['FOOTER.PRIVACY_POLICE'])).toBeInTheDocument();
    expect(screen.getByText(esMessages['FOOTER.TERMS_CONDITIONS'])).toBeInTheDocument();
  });

  it('renders 2 copyright lines, the first interpolating the current year', () => {
    renderLayout();
    const year = new Date().getFullYear();
    expect(screen.getByText(`© AutoBusinessPro - ${year}`)).toBeInTheDocument();
    expect(screen.getByText(esMessages['FOOTER.COPYRIGHT2'])).toBeInTheDocument();
  });
});
