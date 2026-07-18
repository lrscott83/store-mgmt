import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// The help icon toggle needs REAL navigation (location must actually change),
// so this file uses a real router instead of mocking useNavigate.
vi.mock('~/shared/lib/stores/auth-store', () => {
  const mockUser = {
    id: 'u1',
    fullName: 'Juan Pérez',
    email: 'juan@test.com',
    cellPhone: '+54911',
    isActive: true,
    password: '',
    login: 'jperez',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 35 * 24 * 60 * 60 * 1000,
    roles: [],
    featureIds: [70],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
  };
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = { user: mockUser, isAuthenticated: true, logout: vi.fn() };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
    logout: vi.fn(),
  });
  return { useAuthStore };
});

import { Navbar } from '../navbar';

function renderAt(path: string) {
  render(
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <MemoryRouter initialEntries={[path]}>
        <Navbar isSidebarOpen={false} onSidebarToggle={() => {}} />
        <Routes>
          <Route path="/" element={<div>HOME PAGE</div>} />
          <Route path="/sales" element={<div>SALES PAGE</div>} />
          <Route path="/help/tutorial" element={<div>TUTORIAL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </IntlProvider>,
  );
}

function clickHelp() {
  fireEvent.click(screen.getByRole('link', { name: /tutorial/i }));
}

describe('Navbar — help icon toggles back to the previous view', () => {
  it('navigates to the tutorial when clicked from another page', () => {
    renderAt('/sales');
    expect(screen.getByText('SALES PAGE')).toBeInTheDocument();

    clickHelp();

    expect(screen.getByText('TUTORIAL PAGE')).toBeInTheDocument();
  });

  it('returns to the previous view when the help icon is clicked again', () => {
    renderAt('/sales');

    clickHelp();
    expect(screen.getByText('TUTORIAL PAGE')).toBeInTheDocument();

    clickHelp();
    expect(screen.getByText('SALES PAGE')).toBeInTheDocument();
  });

  it('falls back to home when clicked on the tutorial with no previous view', () => {
    renderAt('/help/tutorial');
    expect(screen.getByText('TUTORIAL PAGE')).toBeInTheDocument();

    clickHelp();

    expect(screen.getByText('HOME PAGE')).toBeInTheDocument();
  });
});
