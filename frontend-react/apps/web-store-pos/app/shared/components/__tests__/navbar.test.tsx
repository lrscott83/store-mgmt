import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { UserModel } from '@store-mgmt/domain';

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 60 * 60 * 1000;

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    fullName: 'Juan Pérez',
    email: 'juan@test.com',
    cellPhone: '+54911',
    isActive: true,
    password: '',
    login: 'juan@test.com',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + THIRTY_FIVE_DAYS_MS,
    roles: [],
    featureIds: [70],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    ...overrides,
  };
}

const mockLogout = vi.fn();
const mockNavigate = vi.fn();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const mockUser = {
    id: 'u1',
    fullName: 'Juan Pérez',
    email: 'juan@test.com',
    cellPhone: '+54911',
    isActive: true,
    password: '',
    login: 'juan@test.com',
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

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { Navbar } from '../navbar';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      <MemoryRouter>
        {children}
      </MemoryRouter>
    </IntlProvider>
  );
}

describe('Navbar — S-NAV-1: both profile links render in user dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Editar perfil link when dropdown is open', () => {
    render(
      <Wrapper>
        <Navbar onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Editar perfil')).toBeInTheDocument();
  });

  it('shows Cambiar contraseña link when dropdown is open', () => {
    render(
      <Wrapper>
        <Navbar onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Cambiar contraseña')).toBeInTheDocument();
  });

  it('logout link is still present in the dropdown', () => {
    render(
      <Wrapper>
        <Navbar onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
  });
});

describe('Navbar — S-NAV-2: clicking profile links closes the dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes dropdown when Editar perfil link is clicked', () => {
    render(
      <Wrapper>
        <Navbar onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    // Open dropdown
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Editar perfil')).toBeInTheDocument();

    // Click the link
    fireEvent.click(screen.getByText('Editar perfil'));

    // Dropdown should be closed (link should no longer be visible via the dropdown)
    expect(screen.queryByText('Cambiar contraseña')).not.toBeInTheDocument();
  });

  it('closes dropdown when Cambiar contraseña link is clicked', () => {
    render(
      <Wrapper>
        <Navbar onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Cambiar contraseña')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cambiar contraseña'));

    expect(screen.queryByText('Editar perfil')).not.toBeInTheDocument();
  });
});
