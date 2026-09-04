import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { toLocalDayKey, addDays } from '~/shared/lib/date-utils';
import { ExchangeRateOfflineService } from '../../lib/services/exchange-rate-offline-service';
import { ExchangeRatesPage } from '../exchange-rates';

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

// mockUser is read lazily INSIDE the selector functions (never in the vi.mock
// factory body) — the factory runs while the mocked module is first imported,
// which precedes this file's own body, so an eager read would hit a TDZ.
vi.mock('~/shared/lib/stores/auth-store', () => {
  const useAuthStore = vi.fn((selector?: (s: unknown) => unknown) => {
    const state = () => ({ user: mockUser, isAuthenticated: true });
    return typeof selector === 'function' ? selector(state()) : state();
  });
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
    user: mockUser,
    isAuthenticated: true,
  });
  return { useAuthStore };
});

vi.mock('~/auth/routes/loaders', () => ({
  adminFeatureLoader: () => vi.fn().mockResolvedValue(null),
}));

vi.mock('~/shared/lib/exchange-rates/exchange-rate-daily', () => ({
  getExchangeRateAnchor: () => {
    const stored = localStorage.getItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN);
    if (!stored) return new Date();
    const [y, m, d] = stored.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  ensureExchangeRateDailyRecords: vi.fn().mockResolvedValue(undefined),
}));

// ─── Harness ──────────────────────────────────────────────────────────────────

const storeId = 's1';

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <ExchangeRatesPage />
    </IntlProvider>,
  );
}

/** 'YYYY-MM' month key, matching the view's grouping key. */
function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

beforeEach(() => {
  localStorage.clear();
  mockUser = makeUser();
});

describe('ExchangeRatesPage (daily-exchange-rate) — month-grouped collapsed panels', () => {
  it('lists every day from today down to the first owner login day', async () => {
    const anchor = addDays(new Date(), -3);
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(anchor));

    renderPage();

    // The current month's panel starts EXPANDED — its 4 day rows are rendered
    // (anchor 3 days ago always lands in the current or previous month; when
    // the month boundary splits the range, expand that panel too).
    const currentMonthKey = monthKeyOf(new Date());
    await waitFor(() => {
      expect(
        screen.getByTestId(`rate-month-panel-toggle-${currentMonthKey}`),
      ).toBeDefined();
    });

    const anchorMonthKey = monthKeyOf(anchor);
    if (anchorMonthKey !== currentMonthKey) {
      fireEvent.click(screen.getByTestId(`rate-month-panel-toggle-${anchorMonthKey}`));
    }

    await waitFor(() => {
      const rows = screen.getAllByTestId(/^rate-row-/);
      expect(rows).toHaveLength(4);
    });
  });

  it('defaults new records to 1 and persists them through the service', async () => {
    const anchor = addDays(new Date(), -2);
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(anchor));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^rate-row-/)).toHaveLength(3);
    });

    const rates = new ExchangeRateOfflineService(storeId).getStorageExchangeRates();
    expect(rates).toHaveLength(3);
    for (const rate of rates) {
      expect(rate.value).toBe(1);
    }
  });

  it('edits the value of a day via the popup and persists it', async () => {
    const anchor = new Date();
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(anchor));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^rate-row-/)).toHaveLength(1);
    });

    // The edit icon on the row opens the popup modal.
    const todayKey = toLocalDayKey(new Date());
    fireEvent.click(screen.getByTestId(`rate-edit-${todayKey}`));
    const input = screen.getByTestId('rate-value-input') as HTMLInputElement;
    expect(input.value).toBe('1');

    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.click(screen.getByTestId('rate-edit-submit'));

    await waitFor(() => {
      const rates = new ExchangeRateOfflineService(storeId).getStorageExchangeRates();
      expect(rates[0].value).toBe(250);
    });

    expect(await screen.findByText('Valor actualizado correctamente.')).toBeDefined();
  });

  it('rejects non-positive values without saving', async () => {
    const anchor = new Date();
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(anchor));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId(/^rate-row-/)).toHaveLength(1);
    });

    const todayKey = toLocalDayKey(new Date());
    fireEvent.click(screen.getByTestId(`rate-edit-${todayKey}`));
    const input = screen.getByTestId('rate-value-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.click(screen.getByTestId('rate-edit-submit'));

    expect(await screen.findByTestId('rate-edit-error')).toHaveTextContent(
      'El valor debe ser un número mayor que 0.',
    );

    const rates = new ExchangeRateOfflineService(storeId).getStorageExchangeRates();
    expect(rates[0].value).toBe(1);
  });

  it('collapses non-current months and expands them on click', async () => {
    // Anchor 40 days back guarantees at least one previous-month panel.
    const anchor = addDays(new Date(), -40);
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(anchor));

    renderPage();

    const currentMonthKey = monthKeyOf(new Date());
    await waitFor(() => {
      expect(screen.getByTestId(`rate-month-panel-toggle-${currentMonthKey}`)).toBeDefined();
    });

    // The current month starts expanded (aria-expanded=true).
    expect(
      screen.getByTestId(`rate-month-panel-toggle-${currentMonthKey}`),
    ).toHaveAttribute('aria-expanded', 'true');

    // Every other month panel starts collapsed (aria-expanded=false).
    const otherToggles = screen
      .getAllByTestId(/^rate-month-panel-toggle-/)
      .filter((el) => !el.getAttribute('data-testid')?.endsWith(currentMonthKey));
    expect(otherToggles.length).toBeGreaterThan(0);
    for (const toggle of otherToggles) {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
  });
});
