import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { AdminCatalogStatsPage } from '../catalog-stats';

const serviceMock = vi.hoisted(() => ({
  listStores: vi.fn(),
  getStats: vi.fn(),
}));

vi.mock('../../lib/services/catalog-stats-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../lib/services/catalog-stats-http-service')
  >('../../lib/services/catalog-stats-http-service');
  return { ...actual, catalogStatsHttpService: serviceMock };
});

const STORE = { id: 'store-1', name: 'Tienda Uno' };

const STATS = {
  days: 30,
  visits: 12,
  visitors: 9,
  pageViews: 40,
  orders: 3,
  conversionRate: 0.25,
  sources: [
    { source: 0, visits: 7 },
    { source: 1, visits: 5 },
  ],
  topProducts: [{ productId: 'p1', name: 'Camisa azul', views: 8 }],
  daily: [
    { day: '2026-10-19', visits: 4 },
    { day: '2026-10-20', visits: 8 },
  ],
};

describe('AdminCatalogStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.listStores.mockResolvedValue({
      succeeded: true,
      data: [STORE],
      message: '',
      actionCode: 200,
      errors: [],
    });
    serviceMock.getStats.mockResolvedValue({
      succeeded: true,
      data: STATS,
      message: '',
      actionCode: 200,
      errors: [],
    });
  });

  it('muestra los KPIs, el origen y los productos más vistos de la tienda', async () => {
    render(
      <IntlProvider locale="es" messages={esMessages}>
        <AdminCatalogStatsPage />
      </IntlProvider>,
    );

    expect(await screen.findByTestId('catalog-stat-VISITS')).toHaveTextContent('12');
    expect(screen.getByTestId('catalog-stat-VISITORS')).toHaveTextContent('9');
    expect(screen.getByTestId('catalog-stat-PAGE_VIEWS')).toHaveTextContent('40');
    expect(screen.getByTestId('catalog-stat-ORDERS')).toHaveTextContent('3');
    expect(screen.getByTestId('catalog-stat-CONVERSION')).toHaveTextContent('25.0%');
    expect(screen.getByTestId('catalog-source-1')).toHaveTextContent('5');
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Camisa azul')).toBeInTheDocument();
    expect(serviceMock.getStats).toHaveBeenCalledWith('store-1', 30);
  });
});
