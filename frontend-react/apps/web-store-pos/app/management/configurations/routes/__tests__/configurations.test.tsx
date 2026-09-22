import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { SalePaymentMethod } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { StorePaymentMethodsConfigService } from '~/shared/lib/payment-methods/store-payment-methods-config-service';

// ─── adminFeatureLoader mock ──────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
}));

// ─── auth-store mock ──────────────────────────────────────────────────────────

const mockLogout = vi.fn();
const mockUpdateUser = vi.fn();

function buildUser(overrides: Record<string, unknown> = {}) {
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
    // store-list-active-stores: the select's ONLY data source is the
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

const mockUser = buildUser();

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
// dereferences the fn DIRECTLY (switchToStore: mockSwitchToStore), so the
// must exist before the mocked module is first imported.
const mockSwitchToStore = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/stores/switch-store', () => ({
  switchToStore: mockSwitchToStore,
}));

// store-list-active-stores: the select no longer fetches the store list.
// The mock stays (asserting NOT called) so a regression to a fetch shows up.
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

function mockAuthState(user: unknown) {
  const state = { user, isAuthenticated: true, logout: mockLogout };
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (s: unknown) => unknown) => {
      if (typeof selector === 'function') return selector(state);
      return state;
    },
  );
}

function restoreDefaultUser() {
  (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (s: unknown) => unknown) => {
      const state = {
        user: mockUser,
        isAuthenticated: true,
        logout: mockLogout,
        updateUser: mockUpdateUser,
      };
      if (typeof selector === 'function') return selector(state);
      return state;
    },
  );
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
// PAGE — active store select (FC-B2, store-list-active-stores)
// ═══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — store select (from user.storeList)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    restoreDefaultUser();
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

  it('renders ONLY the active stores from the session storeList — no listStores fetch', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = await screen.findByLabelText('Tienda activa');
    expect(select.tagName.toLowerCase()).toBe('select');
    expect(screen.getByRole('option', { name: 'Tienda A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tienda B' })).toBeInTheDocument();
    // Inactive store C is filtered out.
    expect(screen.queryByRole('option', { name: 'Tienda C' })).not.toBeInTheDocument();
    // The fetch is gone: the session's storeList is the only source.
    expect(storeHttpService.listStores).not.toHaveBeenCalled();
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

  it('always offers the current store, even when it is inactive (never strands the user)', async () => {
    mockAuthState(
      buildUser({
        selectedStoreId: 's3',
        roles: [{ storeId: 's3', storeName: 'Tienda C', moduleId: 14, featureIds: [38] }],
      }),
    );
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    expect(select.value).toBe('s3');
    expect(screen.getByRole('option', { name: 'Tienda C' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tienda A' })).toBeInTheDocument();
    const currentOption = screen.getByRole('option', {
      selected: true,
    }) as HTMLOptionElement;
    expect(currentOption.textContent).toBe('Tienda C');
  });

  it('falls back to exactly the current store when storeList is undefined (legacy offline bundle)', async () => {
    mockAuthState(buildUser({ storeList: undefined }));
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    expect(select.value).toBe('s1');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toBe('Tienda A');
    expect((options[0] as HTMLOptionElement).value).toBe('s1');
    expect(storeHttpService.listStores).not.toHaveBeenCalled();
  });

  it('treats legacy storeList entries without isActive as non-selectable (falls back to current only)', async () => {
    mockAuthState(
      buildUser({
        storeList: [
          { id: 's1', name: 'Tienda A' },
          { id: 's2', name: 'Tienda B' },
        ] as never,
      }),
    );
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const select = (await screen.findByLabelText('Tienda activa')) as HTMLSelectElement;
    expect(select.value).toBe('s1');
    expect(screen.getByRole('option', { name: 'Tienda A' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Tienda B' })).not.toBeInTheDocument();
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

    expect(mockSwitchToStore).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
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
    localStorage.clear();
    restoreDefaultUser();
  });

  it('owner WITHOUT MultiStores sees no store select', async () => {
    mockAuthState(buildUser({ storeModuleIds: [7] }));
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    expect(screen.queryByLabelText('Tienda activa')).not.toBeInTheDocument();
    expect(storeHttpService.listStores).not.toHaveBeenCalled();
  });

  it('owner with MultiStores sees the store select', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    expect(await screen.findByLabelText('Tienda activa')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS CONFIG — "Formas de pago" (store-payment-methods-config)
// ═══════════════════════════════════════════════════════════════════════════

describe('ConfigurationsPage — payment methods config section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    restoreDefaultUser();
  });

  it('renders the section WITHOUT MultiStores; Efectivo fixed on with the always-on note', async () => {
    mockAuthState(buildUser({ storeModuleIds: [7] }));
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Formas de pago' }),
    ).toBeInTheDocument();
    const efectivo = screen.getByRole('switch', { name: 'Efectivo' });
    expect(efectivo).toBeDisabled();
    expect(efectivo).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Siempre habilitado')).toBeInTheDocument();
    // Default store: every method on (no-regression) — including without the
    // MultiStores module: the section configures the CURRENT store.
    expect(screen.getByRole('switch', { name: 'Zelle' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Transferencia' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(storeHttpService.listStores).not.toHaveBeenCalled();
  });

  it('persists disabling Zelle to the store config and shows the saved indicator', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    const zelle = await screen.findByRole('switch', { name: 'Zelle' });
    fireEvent.click(zelle);

    expect(await screen.findByTestId('payment-methods-saved')).toHaveTextContent(
      'Guardado',
    );
    expect(screen.getByRole('switch', { name: 'Zelle' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // Persisted: a FRESH service instance (no shared cache) reads the update.
    expect(
      new StorePaymentMethodsConfigService('s1').getEnabledMethods('s1'),
    ).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('loads a previously disabled Zelle as off and re-enables it on toggle', async () => {
    new StorePaymentMethodsConfigService('s1').setMethodEnabled(
      's1',
      SalePaymentMethod.Zelle,
      false,
    );
    const { ConfigurationsPage } = await import('../configurations');
    render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    expect(await screen.findByRole('switch', { name: 'Zelle' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Zelle' }));

    expect(screen.getByRole('switch', { name: 'Zelle' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      new StorePaymentMethodsConfigService('s1').getEnabledMethods('s1'),
    ).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Zelle,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('config follows the ACTIVE store: toggling s1 leaves s2 untouched and clears the indicator', async () => {
    const { ConfigurationsPage } = await import('../configurations');
    const view = render(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByRole('switch', { name: 'Zelle' }));
    expect(await screen.findByTestId('payment-methods-saved')).toBeInTheDocument();

    // Switch the active store (MultiStores user) → section binds to s2.
    mockAuthState(
      buildUser({
        selectedStoreId: 's2',
        roles: [{ storeId: 's2', storeName: 'Tienda B', moduleId: 14, featureIds: [38] }],
      }),
    );
    view.rerender(
      <Wrapper>
        <ConfigurationsPage />
      </Wrapper>,
    );

    // s2 reads its own default (Zelle on); s1 keeps its disabled Zelle;
    // the saved indicator resets with the store.
    expect(await screen.findByRole('switch', { name: 'Zelle' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByTestId('payment-methods-saved')).not.toBeInTheDocument();
    expect(
      new StorePaymentMethodsConfigService('s1').getEnabledMethods('s1'),
    ).not.toContain(SalePaymentMethod.Zelle);
    expect(
      new StorePaymentMethodsConfigService('s2').getEnabledMethods('s2'),
    ).toContain(SalePaymentMethod.Zelle);
  });
});
