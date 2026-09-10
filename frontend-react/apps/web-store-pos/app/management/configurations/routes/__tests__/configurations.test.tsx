import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Store } from '@store-mgmt/domain';

// ─── adminFeatureLoader mock ──────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
}));

// ─── auth-store mock ──────────────────────────────────────────────────────────

const mockLogout = vi.fn();
const mockUpdateUser = vi.fn();

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
  roles: [{ storeId: 's1', storeName: 'Tienda A', moduleId: 14, featureIds: [38] }],
  featureIds: [70],
  storeModuleIds: [14],
  isSuperAdmin: false,
  isOwnerAdmin: true,
  isReSeller: false,
  selectedStoreId: 's1',
};

vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = {
      user: mockUser,
      isAuthenticated: true,
      logout: mockLogout,
      updateUser: mockUpdateUser,
    };
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
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

// ─── store-http-service mock ──────────────────────────────────────────────────

vi.mock('~/management/stores/lib/services/store-http-service', () => ({
  storeHttpService: {
    listStores: vi.fn(),
    setMyStore: vi.fn(),
  },
}));

import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { storeHttpService } from '~/management/stores/lib/services/store-http-service';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function buildStores(): Store[] {
  const base = {
    ownerName: 'Juan Pérez',
    address: 'Av. Central 123',
    description: '',
    approved: true,
    paymentStartDate: null,
    nextPaymentDate: null,
    ownerPhone: null,
    planType: 'Gratis',
    modules: [],
  };
  return [
    { id: 's1', name: 'Tienda A', displayName: 'Tienda A', ownerId: 'o1', isActive: true, ...base },
    { id: 's2', name: 'Tienda B', displayName: 'Tienda B', ownerId: 'o1', isActive: true, ...base },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — exports', () => {
  it('exports a named loader function', async () => {
    const mod = await import('../configurations');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports ConfigurationsPage as named export', async () => {
    const mod = await import('../configurations');
    expect(typeof mod.ConfigurationsPage).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE — active store select (FC-B2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — store select', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (s: unknown) => unknown) => {
        const state = {
          user: mockUser,
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

  it('renders the page heading', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Configuraciones' }),
    ).toBeInTheDocument();
  });

  it('loads the store list and renders it in a select', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    expect(storeHttpService.listStores).toHaveBeenCalledTimes(1);
    const select = await screen.findByLabelText('Tienda activa');
    expect(select.tagName.toLowerCase()).toBe('select');
    expect(screen.getByRole('option', { name: 'Tienda A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tienda B' })).toBeInTheDocument();
  });

  it('selects the current store value from the user', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    expect(select.value).toBe('s1');
  });

  it('delegates the switch to switchToStore and stays logged in on success', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 's2' } });

    await waitFor(() => expect(mockSwitchToStore).toHaveBeenCalledWith('s2'));
    // seamless-store-switch: the helper resolves after window.location.reload()
    // (or via its own logout fallback) — the UI itself must NOT log out.
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('does nothing when the same store is selected', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 's1' } });

    expect(storeHttpService.setMyStore).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('shows the load error with ONLY the current store as option when listStores fails', async () => {
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: false,
      data: [],
      message: 'error',
    } as never);
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    expect(
      await screen.findByText('No se pudieron cargar las tiendas.'),
    ).toBeInTheDocument();
    // Única opción: la tienda seleccionada actualmente (comportamiento 2026-09-09).
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toBe('Tienda A');
    expect((options[0] as HTMLOptionElement).value).toBe('s1');
  });

  it('shows the switch error and does NOT log out when the switch is rejected', async () => {
    // setMyStore refused/failed inside the helper → it rejects → error UI,
    // session untouched (still no logout from the UI itself).
    mockSwitchToStore.mockRejectedValueOnce(new Error('STORE_SWITCH_REJECTED'));
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 's2' } });

    expect(await screen.findByText('No se pudo cambiar la tienda.')).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('select still shows the current store as its value when listStores fails', async () => {
    vi.mocked(storeHttpService.listStores).mockRejectedValue(new Error('network down'));
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    await screen.findByText('No se pudieron cargar las tiendas.');
    // El select conserva la tienda seleccionada actualmente como valor.
    expect(select.value).toBe('s1');
    // La opción visible muestra el nombre de la tienda actual.
    const currentOption = screen.getByRole('option', { selected: true }) as HTMLOptionElement;
    expect(currentOption.textContent).toBe('Tienda A');
  });

  it('select still shows the current store as its value when the switch is rejected', async () => {
    mockSwitchToStore.mockRejectedValueOnce(new Error('network down'));
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 's2' } });

    await screen.findByText('No se pudo cambiar la tienda.');
    expect(select.value).toBe('s1');
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GATE — MultiStores module (14) required for owner store selection
// ═══════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — MultiStores gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector?: (s: unknown) => unknown) => {
        const state = {
          user: mockUser,
          isAuthenticated: true,
          logout: mockLogout,
        };
        if (typeof selector === 'function') return selector(state);
        return state;
      },
    );
  });

  it('owner WITHOUT MultiStores sees no store select and no store fetch', async () => {
    (mockUser as { storeModuleIds: number[] }).storeModuleIds = [7];
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    expect(screen.queryByLabelText('Tienda activa')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(storeHttpService.listStores).not.toHaveBeenCalled();
    });
    (mockUser as { storeModuleIds: number[] }).storeModuleIds = [14];
  });

  it('owner with MultiStores sees the store select', async () => {
    vi.mocked(storeHttpService.listStores).mockResolvedValue({
      succeeded: true,
      data: buildStores(),
    } as never);
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    expect(await screen.findByLabelText('Tienda activa')).toBeInTheDocument();
  });
});