import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ProductCountPage } from '../count';

const { CATEGORIES } = vi.hoisted(() => ({
  CATEGORIES: [
    {
      categoryId: 'cat1',
      categoryName: 'Bebidas',
      totalQuantity: 122,
      totalCostPrice: 100,
      products: [
        {
          productId: 'p1',
          productName: 'Producto 1',
          categoryId: 'cat1',
          categoryName: 'Bebidas',
          totalAvailable: 34,
          avgCostPrice: 2,
        },
        {
          productId: 'p2',
          productName: 'Producto 11',
          categoryId: 'cat1',
          categoryName: 'Bebidas',
          totalAvailable: 88,
          avgCostPrice: 3,
        },
      ],
    },
    {
      categoryId: 'cat2',
      categoryName: 'Snacks',
      totalQuantity: 8,
      totalCostPrice: 40,
      products: [
        {
          productId: 'p3',
          productName: 'Producto 20',
          categoryId: 'cat2',
          categoryName: 'Snacks',
          totalAvailable: 74,
          avgCostPrice: 5,
        },
      ],
    },
  ],
}));

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getInventoryCategoriesView: () => ({ succeeded: true, data: CATEGORIES }),
  })),
}));

const STORE = 'store-count';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'owner',
    fullName: 'Test User',
    cellPhone: '',
    email: 'owner@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1_000_000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: STORE,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <ProductCountPage />
    </IntlProvider>,
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  useAuthStore.setState({ user: makeUser(), isAuthenticated: true, isLoading: false, error: null });
});

describe('ProductCountPage', () => {
  it('muestra el título "Conteo de productos" con el número de productos', async () => {
    renderPage();

    expect(await screen.findByText('Conteo de productos')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByTestId('product-count-clear')).toHaveTextContent('Limpiar');
  });

  it('el botón Limpiar borra todos los conteos y deja la vista en cero', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('product-count-category-toggle-cat1'));

    fireEvent.change(screen.getByTestId('inventory-count-input-p1'), { target: { value: '30' } });
    fireEvent.change(screen.getByTestId('inventory-count-input-p2'), { target: { value: '90' } });
    expect(screen.getByTestId('inventory-count-difference-p1')).toHaveTextContent('-4');
    expect(screen.getByTestId('inventory-count-difference-p2')).toHaveTextContent('+2');

    fireEvent.click(screen.getByTestId('product-count-clear'));

    expect(screen.getByTestId('inventory-count-input-p1')).toHaveValue(null);
    expect(screen.getByTestId('inventory-count-input-p2')).toHaveValue(null);
    expect(screen.getByTestId('inventory-count-difference-p1')).toHaveTextContent('—');
    expect(screen.getByTestId('inventory-count-difference-p2')).toHaveTextContent('—');
  });

  it('los conteos no se persisten en localStorage (solo visual)', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('product-count-category-toggle-cat1'));
    const keysBefore = Object.keys(localStorage);

    fireEvent.change(screen.getByTestId('inventory-count-input-p1'), { target: { value: '30' } });

    expect(Object.keys(localStorage)).toEqual(keysBefore);
  });
});
