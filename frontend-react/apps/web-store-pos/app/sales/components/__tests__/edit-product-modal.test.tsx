import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EditProductModal } from '../edit-product-modal';

// Text parity with Angular's edit-product-modal.component.html:24-31,42-49 — the "name"/
// "price" required-field errors use GENERAL.VALIDATION.REQUIRED with GENERAL.NAME/
// GENERAL.PRICE, resolving to "Nombre es requerido" / "Precio es requerido".
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id: 'cat-1', name: 'Bebidas', order: 1, isActive: true, ...overrides };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Coca Cola',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1.5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

describe('EditProductModal — validation text parity (GENERAL.VALIDATION.REQUIRED)', () => {
  it('shows "Nombre es requerido" when name is cleared', () => {
    render(
      <Wrapper>
        <EditProductModal
          product={makeProduct()}
          categories={[makeCategory()]}
          onSave={vi.fn()}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-name-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));
    expect(screen.getByText('Nombre es requerido')).toBeInTheDocument();
  });

  it('shows "Precio es requerido" when price is cleared', () => {
    render(
      <Wrapper>
        <EditProductModal
          product={makeProduct()}
          categories={[makeCategory()]}
          onSave={vi.fn()}
          onDelete={vi.fn()}
          onClose={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-price-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));
    expect(screen.getByText('Precio es requerido')).toBeInTheDocument();
  });
});
