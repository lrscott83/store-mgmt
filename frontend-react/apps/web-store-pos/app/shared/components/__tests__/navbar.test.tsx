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

  it('shows Editar Perfil link when dropdown is open', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Editar Perfil')).toBeInTheDocument();
  });

  it('shows Cambiar Contraseña link when dropdown is open', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Cambiar Contraseña')).toBeInTheDocument();
  });

  it('logout link uses Angular exact "Salir" label (GENERAL.LOGOUT)', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Salir')).toBeInTheDocument();
  });
});

describe('Navbar — S-NAV-2: clicking profile links closes the dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes dropdown when Editar Perfil link is clicked', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    // Open dropdown
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Editar Perfil')).toBeInTheDocument();

    // Click the link
    fireEvent.click(screen.getByText('Editar Perfil'));

    // Dropdown should be closed (link should no longer be visible via the dropdown)
    expect(screen.queryByText('Cambiar Contraseña')).not.toBeInTheDocument();
  });

  it('closes dropdown when Cambiar Contraseña link is clicked', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Cambiar Contraseña')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cambiar Contraseña'));

    expect(screen.queryByText('Editar Perfil')).not.toBeInTheDocument();
  });
});

describe('Navbar — S-NAV-3: header keeps only the EXPAND toggle; collapse now lives in the sidebar itself', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onSidebarToggle when the header expand toggle button is clicked', () => {
    const onSidebarToggle = vi.fn();
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={onSidebarToggle} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
    expect(onSidebarToggle).toHaveBeenCalledTimes(1);
  });

  it('renders an unfold-style icon when the sidebar is collapsed', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    const toggle = screen.getByRole('button', { name: /toggle sidebar/i });
    expect(toggle.querySelector('[data-icon="menu-unfold"]')).toBeInTheDocument();
  });

  it('does not render the header toggle button when the sidebar is already open (collapse now lives in the sidebar)', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={true} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByRole('button', { name: /toggle sidebar/i })).not.toBeInTheDocument();
  });
});

describe('Navbar — S-NAV-4: user menu trigger is a plain person icon (Angular header-user-profile)', () => {
  it('does not render the cyan avatar initial', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByText('J')).not.toBeInTheDocument();
  });

  it('shows the user login (not email) in the dropdown header', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('jperez')).toBeInTheDocument();
    expect(screen.queryByText('juan@test.com')).not.toBeInTheDocument();
  });
});

describe('Navbar — S-NAV-5: help icon has the Angular gray-pill background', () => {
  it('applies bg-gray-200 to the tutorial/help link', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );
    const helpLink = screen.getByRole('link', { name: /tutorial/i });
    expect(helpLink.className).toContain('bg-gray-200');
  });
});

describe('Navbar — S-NAV-6: user menu dropdown closes on outside click', () => {
  it('closes the dropdown when clicking outside it', () => {
    render(
      <Wrapper>
        <div>
          <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
          <div data-testid="outside-area">outside</div>
        </div>
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    expect(screen.getByText('Editar Perfil')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside-area'));

    expect(screen.queryByText('Editar Perfil')).not.toBeInTheDocument();
  });

  it('does not close the dropdown when clicking inside it', () => {
    render(
      <Wrapper>
        <Navbar isSidebarOpen={false} onSidebarToggle={vi.fn()} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    const editProfileLink = screen.getByText('Editar Perfil');
    expect(editProfileLink).toBeInTheDocument();

    fireEvent.mouseDown(editProfileLink);

    expect(screen.getByText('Editar Perfil')).toBeInTheDocument();
  });
});
