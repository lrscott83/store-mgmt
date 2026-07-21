import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import AuthLayout from '../auth-layout';

function renderLayout() {
  const router = createMemoryRouter(
    [{ path: '/', element: <AuthLayout />, children: [{ index: true, element: <div>content</div> }] }],
    { initialEntries: ['/'] },
  );
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <RouterProvider router={router} />
    </IntlProvider>,
  );
}

describe('AuthLayout — guest footer (Req: parity with guest-footer.component.html)', () => {
  it('renders the 3 legal links, each opening in a new tab (target="_blank")', () => {
    renderLayout();
    const cookies = screen.getByText(esMessages['FOOTER.COOKIES_POLICE']).closest('a');
    const privacy = screen.getByText(esMessages['FOOTER.PRIVACY_POLICE']).closest('a');
    const terms = screen.getByText(esMessages['FOOTER.TERMS_CONDITIONS']).closest('a');

    expect(cookies).toHaveAttribute('href', '/cookies-private');
    expect(cookies).toHaveAttribute('target', '_blank');
    expect(privacy).toHaveAttribute('href', '/private-police');
    expect(privacy).toHaveAttribute('target', '_blank');
    expect(terms).toHaveAttribute('href', '/terms-conditions');
    expect(terms).toHaveAttribute('target', '_blank');
  });

  it('renders a Contact Us trigger (FOOTER.CONTACT_US)', () => {
    renderLayout();
    expect(screen.getByText(esMessages['FOOTER.CONTACT_US'])).toBeInTheDocument();
  });

  it('renders 2 copyright lines, the first interpolating the current year', () => {
    renderLayout();
    const year = new Date().getFullYear();
    expect(screen.getByText(`© AutoBusinessPro - ${year}`)).toBeInTheDocument();
    expect(screen.getByText(esMessages['FOOTER.COPYRIGHT2'])).toBeInTheDocument();
  });
});
