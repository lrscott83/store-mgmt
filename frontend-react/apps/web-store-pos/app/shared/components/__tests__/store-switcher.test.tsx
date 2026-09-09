import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Store } from '@store-mgmt/domain';

// ─── auth-store mock ──────────────────────────────────────────────────────────
// The default user is an owner-admin (the switcher is owner-only). Tests that
// need a non-owner override the useAuthStore implementation with mockAuthState.

const mockLogout = vi.fn();

function buildOwnerUser() {
  return {
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
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
  };
}

const defaultOwnerUser = buildOwnerUser();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      user: defaultOwnerUser,
      isAuthenticated: true,
      logout: mockLogout,
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: defaultOwnerUser,
    isAuthenticated: true,
    logout: mockLogout,
  });
  return { useAuthStore };
});

// ─── store-http-service mock ──────────────────────────────────────────────────

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    listStores: vi.fn(),
    setMyStore: vi.fn(),
  },
}));

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';
import { StoreSwitcher } from '../store-switcher';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function mockAuthState(user: unknown) {
  const state = { user, isAuthenticated: true, logout: mockLogout };
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (s: unknown) => unknown) => {
      if (typeof selector === 'function') return selector(state);
      return state;
    },
  );
}

function buildStores(): Store[] {
  const base = {
    ownerName: 'Juan Pérez',
    address: 'Av. Central 123',
    description: '',
    approved: true,
    paymentStartDate: null,
    modules: [],
  };
  return [
    { id: 's1', name: 'Tienda A', displayName: 'Tienda A', ownerId: 'o1', isActive: true, ...base },
    { id: 's2', name: 'Tienda B', displayName: 'Tienda B', ownerId: 'o1', isActive: true, ...base },
  ];
}

describe('StoreSwitcher — owner gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (s: unknown) => unknown) => {
        const state = {
          user: defaultOwnerUser,
          isAuthenticated: true,
          logout: mockLogout,
        };
        if (typeof selector === 'function') return selector(state);
        return state;
      },
    );
  });

  it('renders nothing when the user is not an owner-admin', () => {
    mockAuthState({ ...buildOwnerUser(), isOwnerAdmin: false });
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    expect(screen.queryByRole('button', { name: 'Cambiar tienda' })).not.toBeInTheDocument();
  });

  it('renders the store-switcher button for an owner-admin', () => {
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Cambiar tienda' })).toBeInTheDocument();
  });
});

describe('StoreSwitcher — popup list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (s: unknown) => unknown) => {
        const state = {
          user: defaultOwnerUser,
          isAuthenticated: true,
          logout: mockLogout,
        };
        if (typeof selector === 'function') return selector(state);
        return state;
      },
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: buildStores(),
    } as never);
    vi.mocked(storeHttpService.setMyStore).mockResolvedValue({
      succeeded: true,
      data: true,
    } as never);
  });

  it('opens the popup and loads the store list on click', async () => {
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    expect(storeHttpService.listStores).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Tienda A')).toBeInTheDocument();
    expect(screen.getByText('Tienda B')).toBeInTheDocument();
  });

  it('marks the current store with the "Actual" badge', async () => {
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    await screen.findByText('Tienda A');
    expect(screen.getByText('Actual')).toBeInTheDocument();
  });

  it('disables the current store button', async () => {
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    await screen.findByText('Tienda A');
    const currentStoreButton = screen.getByRole('button', { name: /Tienda A/ });
    expect(currentStoreButton).toBeDisabled();
  });

  it('shows the empty message when the owner has no active stores', async () => {
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: [],
    } as never);
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    expect(await screen.findByText('No hay tiendas para seleccionar.')).toBeInTheDocument();
  });

  it('shows the load error when listStores fails', async () => {
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: false,
      data: [],
      message: 'error',
    } as never);
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    expect(
      await screen.findByText('No se pudieron cargar las tiendas.'),
    ).toBeInTheDocument();
  });

  it('closes the popup when clicking outside it', async () => {
    render(
      <Wrapper>
        <div>
          <StoreSwitcher />
          <div data-testid="outside-area">outside</div>
        </div>
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));
    await screen.findByText('Tienda A');

    fireEvent.mouseDown(screen.getByTestId('outside-area'));

    expect(screen.queryByText('Tienda A')).not.toBeInTheDocument();
  });
});

describe('StoreSwitcher — switching stores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (s: unknown) => unknown) => {
        const state = {
          user: defaultOwnerUser,
          isAuthenticated: true,
          logout: mockLogout,
        };
        if (typeof selector === 'function') return selector(state);
        return state;
      },
    );
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: buildStores(),
    } as never);
    vi.mocked(storeHttpService.setMyStore).mockResolvedValue({
      succeeded: true,
      data: true,
    } as never);
  });

  it('calls setMyStore with the new store id and logs out on success', async () => {
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));
    await screen.findByText('Tienda B');
    fireEvent.click(screen.getByText('Tienda B'));

    expect(storeHttpService.setMyStore).toHaveBeenCalledWith('s2');
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  });

  it('shows the switch error and does NOT log out when setMyStore fails', async () => {
    vi.mocked(storeHttpService.setMyStore).mockResolvedValue({
      succeeded: false,
      data: false,
      message: 'error',
    } as never);
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));
    await screen.findByText('Tienda B');
    fireEvent.click(screen.getByText('Tienda B'));

    expect(await screen.findByText('No se pudo cambiar la tienda.')).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(storeHttpService.setMyStore).toHaveBeenCalledWith('s2');
  });
});