import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router';
import esMessages from '~/shared/lib/i18n/es';

const mocks = vi.hoisted(() => ({
  getOrders: vi.fn(),
  getCommissions: vi.fn(),
  getStores: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('~/gestor/lib/gestor-http-service', () => ({
  gestorHttpService: {
    getOrders: mocks.getOrders,
    getCommissions: mocks.getCommissions,
    getStores: mocks.getStores,
  },
}));
vi.mock('../loader', () => ({ gestorLoader: () => null }));
vi.mock('~/sales/lib/ordering-labels', () => ({ statusLabel: () => 'Entregado' }));
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (
    selector: (state: { user: { fullName: string }; logout: () => void }) => unknown,
  ) => selector({ user: { fullName: 'Gestor Uno' }, logout: mocks.logout }),
}));
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});

import GestorDashboardPage from '../dashboard';

const order = {
  orderId: 'o1',
  code: 'PED-1',
  storeId: 's1',
  storeName: 'Tienda',
  status: 3,
  date: '2026-10-20T09:00:00Z',
  total: 100,
  currency: 0,
  itemsCount: 2,
};

function renderPage() {
  return render(
    <IntlProvider locale="es" defaultLocale="es" messages={esMessages}>
      <MemoryRouter>
        <GestorDashboardPage />
      </MemoryRouter>
    </IntlProvider>,
  );
}

describe('GestorDashboardPage — carga parcial por sección (R3-ALL-OR-NOTHING-LOAD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrders.mockResolvedValue({ succeeded: true, data: [order] });
    mocks.getCommissions.mockResolvedValue({ succeeded: true, data: [] });
    mocks.getStores.mockResolvedValue({
      succeeded: true,
      data: [{ storeId: 's1', storeName: 'Tienda', catalogSlug: 'tienda' }],
    });
  });

  it('si fallan las comisiones, los pedidos y catálogos siguen visibles', async () => {
    mocks.getCommissions.mockRejectedValue(new Error('offline'));

    renderPage();

    expect(await screen.findByText('PED-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tienda' })).toHaveAttribute(
      'href',
      '/catalog/tienda',
    );
    expect(await screen.findByTestId('gestor-commissions-error')).toBeInTheDocument();
    expect(screen.queryByTestId('gestor-orders-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gestor-stores-error')).not.toBeInTheDocument();
  });

  it('si falla una sección, las otras dos no quedan en blanco', async () => {
    mocks.getStores.mockRejectedValue(new Error('offline'));

    renderPage();

    expect(await screen.findByText('PED-1')).toBeInTheDocument();
    expect(await screen.findByTestId('gestor-stores-error')).toBeInTheDocument();
    expect(screen.queryByTestId('gestor-orders-error')).not.toBeInTheDocument();
    // Las comisiones no fallaron: su estado vacío se pinta, no el error de sección.
    expect(screen.queryByTestId('gestor-commissions-error')).not.toBeInTheDocument();
  });
});
