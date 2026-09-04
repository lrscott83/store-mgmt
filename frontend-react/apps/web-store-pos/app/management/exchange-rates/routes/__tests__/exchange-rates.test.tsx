import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { toLocalDayKey, formatLocalDate, addDays } from '~/shared/lib/date-utils';
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

beforeEach(() => {
  localStorage.clear();
  mockUser = makeUser();
});

describe('ExchangeRatesPage (daily-exchange-rate)', () => {
  it('lists every day from today down to the first owner login day', async () => {
    const anchor = addDays(new Date(), -3);
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(anchor));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(5); // header + 4 day rows
    });

    // Rows are rendered TODAY first, descending to the anchor day.
    const dateCells = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td')?.textContent);
    expect(dateCells).toEqual([
      formatLocalDate(new Date()),
      formatLocalDate(addDays(new Date(), -1)),
      formatLocalDate(addDays(new Date(), -2)),
      formatLocalDate(addDays(new Date(), -3)),
    ]);
  });

  it('defaults new records to 1 and persists them through the service', async () => {
    const anchor = addDays(new Date(), -2);
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(anchor));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(4);
    });

    const rates = new ExchangeRateOfflineService(storeId).getStorageExchangeRates();
    expect(rates).toHaveLength(3);
    for (const rate of rates) {
      expect(rate.value).toBe(1);
    }
  });

  it('edits the value of a day and persists it', async () => {
    const anchor = new Date();
    localStorage.setItem(StorageKeys.EXCHANGE_RATES_FIRST_LOGIN, toLocalDayKey(anchor));

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(2);
    });

    const todayLabel = formatLocalDate(new Date());
    const input = screen.getByLabelText(todayLabel) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '250' } });

    const row = input.closest('tr') as HTMLTableRowElement;
    const saveButton = row.querySelector('button') as HTMLButtonElement;
    fireEvent.click(saveButton);

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
      expect(screen.getAllByRole('row')).toHaveLength(2);
    });

    const todayLabel = formatLocalDate(new Date());
    const input = screen.getByLabelText(todayLabel) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-5' } });
    const row = input.closest('tr') as HTMLTableRowElement;
    fireEvent.click(row.querySelector('button') as HTMLButtonElement);

    expect(
      await screen.findByText('El valor debe ser un número mayor que 0.'),
    ).toBeDefined();

    const rates = new ExchangeRateOfflineService(storeId).getStorageExchangeRates();
    expect(rates[0].value).toBe(1);
  });
});
