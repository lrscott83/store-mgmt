import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ─── auth-store mock ──────────────────────────────────────────────────────────
// The default user is an owner-admin (the switcher is owner-only). Tests that
// need a non-owner override the useAuthStore implementation with mockAuthState.

const mockLogout = vi.fn();
const mockUpdateUser = vi.fn();

function buildOwnerUser(overrides: Record<string, unknown> = {}) {
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
    roles: [{ storeId: 's1', storeName: 'Tienda A', moduleId: 14, featureIds: [38] }],
    featureIds: [70],
    storeModuleIds: [14],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
    // store-list-active-stores: the switcher's ONLY data source is the
    // session's storeList (from /me online, the roster offline) — the extra
    // listStores fetch is gone.
    storeList: [
      { id: 's1', name: 'Tienda A', isActive: true },
      { id: 's2', name: 'Tienda B', isActive: true },
      { id: 's3', name: 'Tienda C', isActive: false },
    ],
    ...overrides,
  };
}

const defaultOwnerUser = buildOwnerUser();

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      user: defaultOwnerUser,
      isAuthenticated: true,
      logout: mockLogout,
      updateUser: mockUpdateUser,
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: defaultOwnerUser,
    isAuthenticated: true,
    logout: mockLogout,
    updateUser: mockUpdateUser,
  });
  return { useAuthStore };
});

// ─── switch-store mock (seamless-store-switch) ──────────────────────────────
// The UI delegates to the shared helper; these tests pin the UI's contract
// with it (called with the new id; error UI on rejection; no direct logout).
// The helper's own behaviour is covered in switch-store.test.ts.

// vi.hoisted: the factory is hoisted above this module's body, and it
// dereferences the fn DIRECTLY (switchToStore: mockSwitchToStore), so the fn
// must exist before the mocked module is first imported.
const mockSwitchToStore = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/stores/switch-store', () => ({
  switchToStore: mockSwitchToStore,
}));

// store-list-active-stores: the switcher no longer fetches the store list.
// The mock stays (asserting NOT called) so a regression to a fetch shows up.
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

describe('StoreSwitcher — owner gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (s: unknown) => unknown) => {
        const state = {
          user: defaultOwnerUser,
          isAuthenticated: true,
          logout: mockLogout,
          updateUser: mockUpdateUser,
        };
        if (typeof selector === 'function') return selector(state);
        return state;
      },
    );
  });

  it('renders nothing when the user is not an owner-admin', () => {
    mockAuthState(buildOwnerUser({ isOwnerAdmin: false }));
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    expect(screen.queryByRole('button', { name: 'Cambiar tienda' })).not.toBeInTheDocument();
  });

  it('renders nothing when the owner lacks the MultiStores module (14)', () => {
    mockAuthState(
      buildOwnerUser({
        storeModuleIds: [7],
        roles: [{ storeId: 's1', storeName: 'Tienda A', moduleId: 7, featureIds: [70] }],
      }),
    );
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

describe('StoreSwitcher — popup list (from user.storeList)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (s: unknown) => unknown) => {
        const state = {
          user: defaultOwnerUser,
          isAuthenticated: true,
          logout: mockLogout,
          updateUser: mockUpdateUser,
        };
        if (typeof selector === 'function') return selector(state);
        return state;
      },
    );
    vi.mocked(storeHttpService.setMyStore).mockResolvedValue({
      succeeded: true,
      data: true,
    } as never);
  });

  it('opens the popup listing ONLY active stores — no listStores fetch', async () => {
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    expect(await screen.findByText('Tienda A')).toBeInTheDocument();
    expect(screen.getByText('Tienda B')).toBeInTheDocument();
    // Inactive store C is filtered out.
    expect(screen.queryByText('Tienda C')).not.toBeInTheDocument();
    // The fetch is gone: the session's storeList is the only source.
    expect(storeHttpService.listStores).not.toHaveBeenCalled();
  });

  it('always offers the current store, even when it is inactive (never strands the user)', async () => {
    mockAuthState(
      buildOwnerUser({
        selectedStoreId: 's3',
        roles: [{ storeId: 's3', storeName: 'Tienda C', moduleId: 14, featureIds: [38] }],
      }),
    );
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    expect(await screen.findByText('Tienda C')).toBeInTheDocument();
    expect(screen.getByText('Tienda A')).toBeInTheDocument();
    // The inactive current store still renders, marked as the current one.
    expect(screen.getByText('Actual')).toBeInTheDocument();
  });

  it('falls back to the current store only when storeList is undefined (offline legacy bundle)', async () => {
    mockAuthState(buildOwnerUser({ storeList: undefined }));
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    // Current store from the cached roles — the popup is never empty and no
    // fetch happens.
    expect(await screen.findByText('Tienda A')).toBeInTheDocument();
    expect(screen.queryByText('Tienda B')).not.toBeInTheDocument();
    expect(storeHttpService.listStores).not.toHaveBeenCalled();
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

  it('never shows the empty message while a current store exists — [] still offers the current store', async () => {
    mockAuthState(
      buildOwnerUser({
        storeList: [],
        roles: [{ storeId: 's1', storeName: 'Tienda A', moduleId: 14, featureIds: [38] }],
        selectedStoreId: 's1',
      }),
    );
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    // Design D3: the select never strands the user — an empty session list
    // still offers the current store (name from the cached roles), not the
    // empty message.
    expect(await screen.findByText('Tienda A')).toBeInTheDocument();
    expect(screen.getByText('Actual')).toBeInTheDocument();
  });

  it('treats legacy storeList entries without isActive as non-selectable (falls back to current only)', async () => {
    mockAuthState(
      buildOwnerUser({
        storeList: [
          { id: 's1', name: 'Tienda A' },
          { id: 's2', name: 'Tienda B' },
        ] as never,
      }),
    );
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));

    // None of the legacy entries is known-active; the current store (s1)
    // still renders via the always-offer edge.
    expect(await screen.findByText('Tienda A')).toBeInTheDocument();
    expect(screen.queryByText('Tienda B')).not.toBeInTheDocument();
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
          updateUser: mockUpdateUser,
        };
        if (typeof selector === 'function') return selector(state);
        return state;
      },
    );
    vi.mocked(storeHttpService.setMyStore).mockResolvedValue({
      succeeded: true,
      data: true,
    } as never);
  });

  it('delegates the switch to switchToStore and stays logged in on success', async () => {
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));
    await screen.findByText('Tienda B');
    fireEvent.click(screen.getByText('Tienda B'));

    await waitFor(() => expect(mockSwitchToStore).toHaveBeenCalledWith('s2'));
    // seamless-store-switch: the helper resolves after window.location.reload()
    // (or via its own logout fallback) — the UI itself must NOT log out.
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('shows the switch error and does NOT log out when the switch is rejected', async () => {
    // setMyStore refused/failed inside the helper → it rejects → error UI,
    // session untouched (still no logout from the UI itself).
    mockSwitchToStore.mockRejectedValueOnce(new Error('STORE_SWITCH_REJECTED'));
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
    expect(mockSwitchToStore).toHaveBeenCalledWith('s2');
  });

  it('switch error message shows the current-store paragraph first, in black, then the error', async () => {
    mockSwitchToStore.mockRejectedValueOnce(new Error('network down'));
    render(
      <Wrapper>
        <StoreSwitcher />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tienda' }));
    await screen.findByText('Tienda B');
    fireEvent.click(screen.getByText('Tienda B'));

    const paragraph = await screen.findByText('La tienda seleccionada es: Tienda A');
    expect(paragraph.className).not.toMatch(/text-red/);
    expect(paragraph.className).toMatch(/text-(gray-900|black)/);

    const errorMsg = screen.getByText('No se pudo cambiar la tienda.');
    expect(errorMsg.className).toMatch(/text-red/);
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
