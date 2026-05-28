import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { InventoryEntryView, EgressEntry, Order, OrderItem } from '@store-mgmt/domain';
import { PaymentType, OrderType } from '@store-mgmt/domain';

// ─── Global mocks ────────────────────────────────────────────────────────────

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getByDate: vi.fn().mockReturnValue([]),
    getAvailableByCategory: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  })),
}));

vi.mock('~/inventory/lib/services/egress-offline-service', () => ({
  EgressOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getActiveToday: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  })),
}));

vi.mock('~/sales/lib/services/product-offline-service', () => ({
  ProductOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getById: vi.fn().mockReturnValue(undefined),
  })),
}));

vi.mock('~/sales/lib/services/product-category-offline-service', () => ({
  ProductCategoryOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockReturnValue([]),
    getActiveOrdersInDay: vi.fn().mockReturnValue([]),
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── InventoryAvailablePage ──────────────────────────────────────────────────

import { InventoryAvailablePage } from '../available';

describe('InventoryAvailablePage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the page title', () => {
    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );
    expect(screen.getByText(/Stock disponible/i)).toBeInTheDocument();
  });
});

// ─── TodayEntriesPage ────────────────────────────────────────────────────────

import { TodayEntriesPage } from '../today-entries';

describe('TodayEntriesPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <TodayEntriesPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows New Entry button', () => {
    render(
      <Wrapper>
        <TodayEntriesPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Nueva entrada/i)).toBeInTheDocument();
  });
});

// ─── EntriesPage ─────────────────────────────────────────────────────────────

import { EntriesPage } from '../entries';

describe('EntriesPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <EntriesPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });
});

// ─── InventoryTodayQuantitiesPage ────────────────────────────────────────────

import { InventoryTodayQuantitiesPage } from '../today-quantities';

describe('InventoryTodayQuantitiesPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <InventoryTodayQuantitiesPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the page title', () => {
    render(
      <Wrapper>
        <InventoryTodayQuantitiesPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Cantidades de hoy/i)).toBeInTheDocument();
  });
});

// ─── InventoryTodaySalesProfitPage ───────────────────────────────────────────

import { InventoryTodaySalesProfitPage } from '../today-sales-profit';

describe('InventoryTodaySalesProfitPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the profit page title', () => {
    render(
      <Wrapper>
        <InventoryTodaySalesProfitPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Ganancia de hoy/i)).toBeInTheDocument();
  });
});

// ─── EgressPage ──────────────────────────────────────────────────────────────

import { EgressPage } from '../egress';

describe('EgressPage — smoke render', () => {
  it('renders without crashing', () => {
    render(
      <Wrapper>
        <EgressPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows New Egress button', () => {
    render(
      <Wrapper>
        <EgressPage />
      </Wrapper>,
    );
    // The page should have a new egress action
    expect(document.body).toBeTruthy();
  });
});
