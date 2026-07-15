import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ─── Global mocks ─────────────────────────────────────────────────────────────

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = { user: { selectedStoreId: 's1' }, isAuthenticated: true };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  return { useAuthStore };
});

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({
    getLastMonthSales: vi.fn().mockReturnValue([]),
    getLastMonthSaleProfits: vi.fn().mockReturnValue([]),
  })),
}));

// Mock lazy chart components to avoid recharts in tests
vi.mock('~/statistics/components/sales-chart', () => ({
  SalesChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="sales-chart">sales-chart({data.length})</div>
  ),
}));

vi.mock('~/statistics/components/profit-chart', () => ({
  ProfitChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="profit-chart">profit-chart({data.length})</div>
  ),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

import { DashboardPage } from '../dashboard';

describe('DashboardPage — smoke render', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders without crashing', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the statistics dashboard title', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
  });

  it('renders the sales chart section', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('sales-chart')).toBeInTheDocument();
  });

  it('renders the profit chart section', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByTestId('profit-chart')).toBeInTheDocument();
  });

  it('shows the sales chart section heading', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Ventas/i)).toBeInTheDocument();
  });

  it('shows the profit chart section heading', () => {
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Ganancia/i)).toBeInTheDocument();
  });
});
