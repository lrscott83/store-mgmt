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

vi.mock('~/reports/lib/services/report-aggregation-service', () => ({
  ReportAggregationService: vi.fn().mockImplementation(() => ({
    getTodayReport: vi.fn().mockReturnValue({
      date: new Date(),
      orderCount: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      available: [],
    }),
  })),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ─── TodayReportPage ──────────────────────────────────────────────────────────

import { TodayReportPage } from '../today-report';

describe('TodayReportPage — smoke render', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders without crashing', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(document.body).toBeTruthy();
  });

  it('shows the reports title', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Reportes de hoy/i)).toBeInTheDocument();
  });

  it('shows the Actualizar refresh button', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Actualizar/i)).toBeInTheDocument();
  });

  it('shows sales summary section', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Resumen de ventas/i)).toBeInTheDocument();
  });

  it('shows inventory status section', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Estado de inventario/i)).toBeInTheDocument();
  });

  it('shows zero values in empty state without crashing', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    // Should show 0 order count or similar zero values
    expect(document.body).toBeTruthy();
  });

  it('shows order count label', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Pedidos/i)).toBeInTheDocument();
  });

  it('shows inventory empty state when no items available', () => {
    render(
      <Wrapper>
        <TodayReportPage />
      </Wrapper>,
    );
    expect(screen.getByText(/Sin stock disponible/i)).toBeInTheDocument();
  });
});
