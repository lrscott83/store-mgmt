import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

const mocks = vi.hoisted(() => ({
  getCategories: vi.fn(),
  getProducts: vi.fn(),
  list: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  showBlockingError: vi.fn(),
  showToastSuccess: vi.fn(),
}));

vi.mock('~/auth/routes/loaders', () => ({ featureLoader: () => null }));
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { user: { selectedStoreId: string } }) => unknown) =>
    selector({ user: { selectedStoreId: 's1' } }),
}));
vi.mock('~/sales/lib/services/product-category-service.factory', () => ({
  createProductCategoryService: () => ({
    getProductCategoriesView: mocks.getCategories,
  }),
}));
vi.mock('~/sales/lib/services/product-service.factory', () => ({
  createProductService: () => ({
    getAvailableProductsByCategoryId: mocks.getProducts,
  }),
}));
vi.mock('~/sales/gestores/lib/sales-commission-http-service', () => ({
  salesCommissionHttpService: {
    list: mocks.list,
    upsert: mocks.upsert,
    remove: mocks.remove,
  },
}));
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: mocks.showBlockingError,
}));
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: mocks.showToastSuccess,
}));

import GestoresCommissionsPage from '../gestores-commissions';

const product = {
  id: 'p1',
  name: 'Camisa',
  price: 50,
  currency: 0,
  categoryId: 'cat1',
  categoryName: 'Cat',
  order: 1,
  availableToSale: true,
  discountFromInvantory: false,
  businessId: 'b1',
};

function renderPage() {
  return render(
    <IntlProvider locale="es" defaultLocale="es" messages={esMessages}>
      <GestoresCommissionsPage />
    </IntlProvider>,
  );
}

describe('GestoresCommissionsPage — rechazo del backend en el guardado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCategories.mockResolvedValue({
      succeeded: true,
      data: [{ id: 'cat1', name: 'Cat', order: 1, isActive: true }],
    });
    mocks.getProducts.mockResolvedValue({ succeeded: true, data: [product] });
    mocks.list.mockResolvedValue({ succeeded: true, data: [] });
    mocks.upsert.mockResolvedValue({
      succeeded: false,
      errors: [{ code: 'ProductSalesCommission.Invalid', description: 'El porcentaje no puede superar 100.' }],
    });
  });

  it('muestra el mensaje del servidor, no un error de conexión', async () => {
    renderPage();
    expect(await screen.findByText('Camisa')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(esMessages['GESTORES.TYPE']), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText(esMessages['GESTORES.PERCENT_VALUE']), {
      target: { value: '200' },
    });
    fireEvent.click(screen.getByRole('button', { name: esMessages['GESTORES.SAVE'] }));

    await waitFor(() =>
      expect(mocks.showBlockingError).toHaveBeenCalledWith(
        esMessages['GESTORES.TITLE'],
        'El porcentaje no puede superar 100.',
      ),
    );
    expect(mocks.showToastSuccess).not.toHaveBeenCalled();
  });

  it('un valor vacío no se guarda como 0', async () => {
    renderPage();
    expect(await screen.findByText('Camisa')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(esMessages['GESTORES.TYPE']), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: esMessages['GESTORES.SAVE'] }));

    await waitFor(() =>
      expect(mocks.showBlockingError).toHaveBeenCalledWith(
        esMessages['GESTORES.TITLE'],
        esMessages['GESTORES.INVALID_VALUE'],
      ),
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
