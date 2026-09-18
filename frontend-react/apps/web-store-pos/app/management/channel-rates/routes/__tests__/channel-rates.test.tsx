import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Currency, EFeatures, SalePaymentMethod, type UserModel } from '@store-mgmt/domain';
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

  it('the real adminFeatureLoader admits owner/admin and denies non-admins', async () => {
    const real = await vi.importActual<typeof import('~/auth/routes/loaders')>(
      '~/auth/routes/loaders',
    );
    const loader = real.adminFeatureLoader([EFeatures.Configurations]);

    mockUser = makeUser({ isSuperAdmin: false, isOwnerAdmin: false, isReSeller: false });
    const denied = await loader({ params: {} } as never);
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).headers.get('Location')).toBe('/login');

    mockUser = makeUser();
    const allowed = await loader({ params: {} } as never);
    expect(allowed).toBeNull();
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
