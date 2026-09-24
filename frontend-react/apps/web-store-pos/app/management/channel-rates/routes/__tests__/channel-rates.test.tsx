import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import {
  Currency,
  EFeatures,
  EModules,
  SalePaymentMethod,
  type UserModel,
} from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import {
  ChannelRateOfflineErrors,
  ChannelRateOfflineService,
  type RegisterChannelRateInput,
} from '../../lib/services/channel-rate-offline-service';
import { ChannelRatesPage } from '../channel-rates';

// ─── User factory ─────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    fullName: 'Store Owner',
    email: 'owner@test.com',
    cellPhone: '',
    isActive: true,
    password: '',
    login: 'owner',
    authToken: 'token',
    refreshToken: 'refresh',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [74], // EFeatures.Configurations
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

// ─── Auth store mock ──────────────────────────────────────────────────────────

let mockUser: UserModel | null = makeUser();
const mockLogout = vi.fn();

// mockUser is read lazily INSIDE the selector/getState functions (never in the
// vi.mock factory body) — the factory runs while the mocked module is first
// imported, which precedes this file's own body, so an eager read would hit a TDZ.
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = () => ({ user: mockUser, isAuthenticated: true });
    return typeof selector === 'function' ? selector(state()) : state();
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
    logout: mockLogout,
  });
  return { useAuthStore };
});

// The page's rendering tests do not need the real loader chain (DEK bootstrap,
// etc.); the real `adminFeatureLoader` is exercised separately below via
// `vi.importActual`.
vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
  adminFeatureModuleLoader: () => vi.fn().mockResolvedValue(null),
}));

// ─── Harness ──────────────────────────────────────────────────────────────────

const storeId = 's1';

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <ChannelRatesPage />
    </IntlProvider>,
  );
}

function seedRate(overrides: Partial<RegisterChannelRateInput> = {}) {
  const svc = new ChannelRateOfflineService(storeId);
  return svc.registerRate({
    method: SalePaymentMethod.Efectivo,
    currency: Currency.CUP,
    value: 700,
    effectiveFrom: new Date(2026, 8, 1),
    ...overrides,
  });
}

/** T22: registration now lives in the `+ Tasa` popup. */
function openRegisterDialog() {
  fireEvent.click(screen.getByTestId('channel-rate-add'));
}

beforeEach(() => {
  localStorage.clear();
  mockUser = makeUser();
  mockLogout.mockClear();
});

describe('ChannelRatesPage (multipayments) — gating', () => {
  it('renders for an owner/admin user admitted by the route loader', async () => {
    renderPage();

    expect(
      await screen.findByText(esMessages['CHANNEL_RATES.TITLE']),
    ).toBeInTheDocument();
  });

  it('the real adminFeatureModuleLoader admits owner/admin WITH module 16 and denies without it', async () => {
    const real = await vi.importActual<typeof import('~/auth/routes/loaders')>(
      '~/auth/routes/loaders',
    );
    const loader = real.adminFeatureModuleLoader(
      [EFeatures.Configurations],
      [EModules.MultiPayments],
    );

    // Non-admin is denied by the role gate even with the module present.
    mockUser = makeUser({
      isSuperAdmin: false,
      isOwnerAdmin: false,
      isReSeller: false,
      storeModuleIds: [EModules.MultiPayments],
    });
    const deniedRole = await loader({ params: {} } as never);
    expect(deniedRole).toBeInstanceOf(Response);
    expect((deniedRole as Response).headers.get('Location')).toBe('/login');

    // Owner/admin WITHOUT module 16 is denied (D11).
    mockUser = makeUser({ storeModuleIds: [] });
    const deniedModule = await loader({ params: {} } as never);
    expect(deniedModule).toBeInstanceOf(Response);
    expect((deniedModule as Response).headers.get('Location')).toBe('/login');

    // Owner/admin WITH module 16 is admitted.
    mockUser = makeUser({ storeModuleIds: [EModules.MultiPayments] });
    const allowed = await loader({ params: {} } as never);
    expect(allowed).toBeNull();
  });
});

describe('ChannelRatesPage (multipayments) — header and registration popup (T22)', () => {
  it('the header and the menu entry say "Tasas de Cambio"', () => {
    renderPage();

    expect(screen.getByText('Tasas de Cambio')).toBeInTheDocument();
    expect(esMessages['CHANNEL_RATES.TITLE']).toBe('Tasas de Cambio');
    expect(esMessages['MENU.CHANNEL_RATES']).toBe('Tasas de Cambio');
  });

  it('keeps the registration form out of the view: only the `+ Tasa` popup registers', () => {
    renderPage();

    expect(screen.queryByTestId('channel-rate-value')).not.toBeInTheDocument();
    // The old "Registrar" card title is gone from the view (the popup carries it).
    expect(screen.queryByText('Registrar tasa')).not.toBeInTheDocument();
  });

  it('`+ Tasa` opens the popup and registers exactly as before', async () => {
    renderPage();

    expect(await screen.findByTestId('channel-rate-empty')).toBeInTheDocument();
    openRegisterDialog();
    expect(screen.getByTestId('channel-rate-add-dialog')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('channel-rate-value'), { target: { value: '350' } });
    fireEvent.click(screen.getByTestId('channel-rate-submit'));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });
    expect(screen.queryByTestId('channel-rate-add-dialog')).not.toBeInTheDocument();
    expect(await screen.findByTestId('channel-rate-saved')).toBeInTheDocument();
    expect(new ChannelRateOfflineService(storeId).getStorageChannelRates()[0].value).toBe(350);
  });

  it('the header `?` explains that each value is 1 USD in the channel currency', () => {
    renderPage();

    fireEvent.click(screen.getByTestId('channel-rate-help'));
    expect(screen.getByTestId('channel-rate-help-text')).toHaveTextContent('1 USD');
  });
});

describe('ChannelRatesPage (multipayments) — real channels only', () => {
  function optionValues(testId: string): string[] {
    return Array.from(screen.getByTestId(testId).querySelectorAll('option')).map(
      (option) => option.getAttribute('value') ?? '',
    );
  }

  it('offers only the methods that exist for CUP (no Zelle)', async () => {
    renderPage();
    openRegisterDialog();

    await screen.findByTestId('channel-rate-method');
    expect(optionValues('channel-rate-method')).toEqual([
      String(SalePaymentMethod.Efectivo),
      String(SalePaymentMethod.Transferencia),
    ]);
    expect(optionValues('channel-rate-method')).not.toContain(String(SalePaymentMethod.Zelle));
  });

  it('re-pins the method when the new currency does not support it (MLC → Transferencia)', async () => {
    renderPage();
    openRegisterDialog();

    fireEvent.change(await screen.findByTestId('channel-rate-currency'), {
      target: { value: String(Currency.MLC) },
    });

    const methodSelect = screen.getByTestId('channel-rate-method') as HTMLSelectElement;
    expect(methodSelect.value).toBe(String(SalePaymentMethod.Transferencia));
    expect(optionValues('channel-rate-method')).toEqual([String(SalePaymentMethod.Transferencia)]);
  });

  it('registers a valid channel (Transferencia + MLC) and shows it in the history', async () => {
    renderPage();
    openRegisterDialog();

    fireEvent.change(await screen.findByTestId('channel-rate-currency'), {
      target: { value: String(Currency.MLC) },
    });
    fireEvent.change(screen.getByTestId('channel-rate-value'), { target: { value: '350' } });
    fireEvent.click(screen.getByTestId('channel-rate-submit'));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });

    const stored = new ChannelRateOfflineService(storeId).getStorageChannelRates();
    expect(stored).toHaveLength(1);
    expect(stored[0].method).toBe(SalePaymentMethod.Transferencia);
    expect(stored[0].currency).toBe(Currency.MLC);
  });

  it('keeps rendering legacy rows whose channel is no longer in the catalogue', async () => {
    // Zelle+CUP does not exist in the catalogue but may already be stored.
    seedRate({ method: SalePaymentMethod.Zelle, currency: Currency.CUP, value: 1 });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });
    // Shown in both the "Tasas Vigentes" card and the history.
    expect(screen.getAllByText('Zelle (CUP)').length).toBeGreaterThan(0);
  });

  it('always shows the currency in the channel name, in the selector and the history (T19a)', async () => {
    seedRate({ method: SalePaymentMethod.Efectivo, currency: Currency.USD, value: 720 });

    renderPage();
    openRegisterDialog();

    // Selector at the default CUP currency names both existing channels with it.
    const options = Array.from(
      screen.getByTestId('channel-rate-method').querySelectorAll('option'),
    ).map((option) => option.textContent);
    expect(options).toEqual(['Efectivo (CUP)', 'Transferencia (CUP)']);

    // The stored USD row is distinguishable from a CUP one at a glance.
    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });
    expect(screen.getAllByText('Efectivo (USD)').length).toBeGreaterThan(0);
    expect(screen.queryByText('Efectivo')).not.toBeInTheDocument();
  });
});

describe('ChannelRatesPage (multipayments) — register and history', () => {
  it('renders existing rows from the append-only register', async () => {
    seedRate({ value: 700 });
    seedRate({ value: 720, effectiveFrom: new Date(2026, 8, 10) });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(2);
    });
  });

  it('appends a valid rate and shows it in the history', async () => {
    renderPage();

    expect(await screen.findByTestId('channel-rate-empty')).toBeInTheDocument();

    openRegisterDialog();
    fireEvent.change(screen.getByTestId('channel-rate-value'), { target: { value: '350' } });
    fireEvent.click(screen.getByTestId('channel-rate-submit'));

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });
    expect(await screen.findByTestId('channel-rate-saved')).toBeInTheDocument();

    const stored = new ChannelRateOfflineService(storeId).getStorageChannelRates();
    expect(stored).toHaveLength(1);
    expect(stored[0].value).toBe(350);
  });

  it('rejects an invalid value (0) with the typed error and writes nothing', async () => {
    renderPage();

    expect(await screen.findByTestId('channel-rate-empty')).toBeInTheDocument();

    openRegisterDialog();
    fireEvent.change(screen.getByTestId('channel-rate-value'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('channel-rate-submit'));

    expect(await screen.findByTestId('channel-rate-error')).toHaveTextContent(
      ChannelRateOfflineErrors.InvalidValue.description,
    );
    expect(new ChannelRateOfflineService(storeId).getStorageChannelRates()).toHaveLength(0);
    expect(screen.getByTestId('channel-rate-empty')).toBeInTheDocument();
  });

  it('clears the success-banner timer on unmount', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderPage();

    expect(await screen.findByTestId('channel-rate-empty')).toBeInTheDocument();
    openRegisterDialog();
    fireEvent.change(screen.getByTestId('channel-rate-value'), { target: { value: '350' } });
    fireEvent.click(screen.getByTestId('channel-rate-submit'));
    await screen.findByTestId('channel-rate-saved');

    // Pin the actual 3000 ms banner handle, so the assertion fails if the
    // cleanup regresses (e.g. clears a different/undefined timer).
    const bannerCallIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === 3000);
    expect(bannerCallIndex).toBeGreaterThanOrEqual(0);
    const bannerTimeoutHandle = setTimeoutSpy.mock.results[bannerCallIndex]?.value;
    expect(bannerTimeoutHandle).toBeDefined();

    unmount();
    expect(clearSpy).toHaveBeenCalledWith(bannerTimeoutHandle);

    clearSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  it('exposes no delete or update control (append-only by contract)', async () => {
    seedRate();

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });

    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId(/delete|edit/)).not.toBeInTheDocument();
  });
});

describe('ChannelRatesPage (multipayments) — T22 view shape', () => {
  it('shows the rate in force per channel with the value as a bare number and no date columns', async () => {
    const svc = new ChannelRateOfflineService(storeId);
    svc.registerRate({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      value: 700,
      effectiveFrom: new Date(2026, 8, 1),
    });
    svc.registerRate({
      method: SalePaymentMethod.Transferencia,
      currency: Currency.MLC,
      value: 350,
      effectiveFrom: new Date(2026, 8, 2),
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-current-row-/)).toHaveLength(2);
    });

    const rows = screen.getAllByTestId(/^channel-rate-current-row-/);
    const cupRow = rows.find((r) => r.textContent?.includes('Efectivo (CUP)'));
    expect(cupRow).toBeDefined();
    // Cell index 1 is the value: bare number, no currency suffix.
    expect(within(cupRow!).getAllByRole('cell')[1]).toHaveTextContent('700');
    expect(within(cupRow!).getAllByRole('cell')[1]).not.toHaveTextContent('CUP');

    // No date columns anywhere in the tables (the dates live in the `?` details).
    expect(screen.queryByText('Vigente desde')).not.toBeInTheDocument();
    expect(screen.queryByText('Registrado')).not.toBeInTheDocument();
  });

  it('the `?` column of the history reveals the row details and dates as a paragraph', async () => {
    seedRate({ value: 700, effectiveFrom: new Date(2026, 8, 1) });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });
    const row = screen.getAllByTestId(/^channel-rate-row-/)[0];
    const detailsButton = within(row).getByRole('button', { name: 'Ver detalles' });
    fireEvent.click(detailsButton);

    const details = screen.getByTestId(/^channel-rate-detail-/);
    expect(details).toHaveTextContent('Efectivo (CUP)');
    expect(details).toHaveTextContent('Vigente desde');
    expect(details).toHaveTextContent('Registrado');
  });

  it('the value column of the history is a bare number too', async () => {
    seedRate({ value: 720 });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });
    const row = screen.getAllByTestId(/^channel-rate-row-/)[0];
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('720');
    expect(within(row).getAllByRole('cell')[1]).not.toHaveTextContent('CUP');
  });
});

describe('ChannelRatesPage (multipayments) — activate/deactivate (T19b)', () => {
  it('deactivates a row from its toggle, marking it inactive but keeping it in the history', async () => {
    seedRate({ value: 700 });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });
    expect(screen.getByText('Activa')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(/^channel-rate-current-toggle-/));

    await waitFor(() => {
      expect(screen.getByText('Inactiva')).toBeInTheDocument();
    });
    // Still visible in the append-only history.
    expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
    expect(new ChannelRateOfflineService(storeId).getStorageChannelRates()[0].isActive).toBe(false);
  });

  it('reactivates a deactivated row', async () => {
    const row = seedRate();
    new ChannelRateOfflineService(storeId).setChannelRateActive(row.data!.id!, false);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Inactiva')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(/^channel-rate-current-toggle-/));

    await waitFor(() => {
      expect(screen.getByText('Activa')).toBeInTheDocument();
    });
    expect(new ChannelRateOfflineService(storeId).getStorageChannelRates()[0].isActive).toBe(true);
  });

  it('treats a stored row without isActive as active (backwards compatible)', async () => {
    seedRate();

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^channel-rate-row-/)).toHaveLength(1);
    });
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument();
    expect(
      new ChannelRateOfflineService(storeId).getStorageChannelRates()[0].isActive,
    ).toBeUndefined();
  });
});
