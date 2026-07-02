import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { OrderType } from '@store-mgmt/domain';
import type { Product } from '@store-mgmt/domain';
import { SaleCategoryProducts } from '../sale-category-products';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
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

describe('SaleCategoryProducts — Angular parity (sale-category-products.component.html)', () => {
  it('renders nothing (no products) when products list is empty', () => {
    const { container } = render(
      <Wrapper>
        <SaleCategoryProducts products={[]} orderType={OrderType.Normal} onAdded={vi.fn()} />
      </Wrapper>,
    );
    expect(container.querySelectorAll('form')).toHaveLength(0);
  });

  it('renders one SaleProductRow per product', () => {
    render(
      <Wrapper>
        <SaleCategoryProducts
          products={[makeProduct({ id: 'p1', name: 'Coca Cola' }), makeProduct({ id: 'p2', name: 'Sprite' })]}
          orderType={OrderType.Normal}
          onAdded={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('Coca Cola')).toBeInTheDocument();
    expect(screen.getByText('Sprite')).toBeInTheDocument();
  });

  it('forwards onAdded from a child row', () => {
    const onAdded = vi.fn();
    render(
      <Wrapper>
        <SaleCategoryProducts
          products={[makeProduct({ id: 'p1' })]}
          orderType={OrderType.Normal}
          onAdded={onAdded}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(onAdded).toHaveBeenCalledWith('p1', 1, 1.5);
  });

  it('forwards checkAvailability to child rows', () => {
    const checkAvailability = vi.fn().mockReturnValue({ succeeded: true });
    render(
      <Wrapper>
        <SaleCategoryProducts
          products={[makeProduct({ id: 'p1', discountFromInvantory: true })]}
          orderType={OrderType.Normal}
          onAdded={vi.fn()}
          checkAvailability={checkAvailability}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(checkAvailability).toHaveBeenCalledWith('p1', 1);
  });
});
