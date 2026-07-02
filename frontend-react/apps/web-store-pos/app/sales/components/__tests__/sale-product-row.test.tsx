import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { OrderType } from '@store-mgmt/domain';
import type { Product } from '@store-mgmt/domain';
import { SaleProductRow } from '../sale-product-row';

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

describe('SaleProductRow — Angular parity (sale-product-row.component.html)', () => {
  it('renders the product name', () => {
    render(
      <Wrapper>
        <SaleProductRow product={makeProduct({ name: 'Sprite' })} orderType={OrderType.Normal} onAdded={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Sprite')).toBeInTheDocument();
  });

  it('shows the read-only price (not an input) for a Normal-type sale', () => {
    render(
      <Wrapper>
        <SaleProductRow product={makeProduct({ price: 2 })} orderType={OrderType.Normal} onAdded={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('$2.00')).toBeInTheDocument();
    expect(screen.queryByLabelText('Precio')).not.toBeInTheDocument();
  });

  it('shows an editable price input for a non-Normal sale (e.g. Mayorista)', () => {
    render(
      <Wrapper>
        <SaleProductRow product={makeProduct({ price: 2 })} orderType={OrderType.Mayorista} onAdded={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Precio')).toBeInTheDocument();
    expect(screen.queryByText('$2.00')).not.toBeInTheDocument();
  });

  it('quantity input defaults to 1', () => {
    render(
      <Wrapper>
        <SaleProductRow product={makeProduct()} orderType={OrderType.Normal} onAdded={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Cantidad')).toHaveValue(1);
  });

  it('renders the cart-add button', () => {
    render(
      <Wrapper>
        <SaleProductRow product={makeProduct()} orderType={OrderType.Normal} onAdded={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /adicionar/i })).toBeInTheDocument();
  });

  it('calls onAdded with productId, quantity and price when clicked (happy path, no inventory gate)', () => {
    const onAdded = vi.fn();
    render(
      <Wrapper>
        <SaleProductRow
          product={makeProduct({ id: 'prod-9', price: 3, discountFromInvantory: false })}
          orderType={OrderType.Normal}
          onAdded={onAdded}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(onAdded).toHaveBeenCalledWith('prod-9', 1, 3);
  });

  it('uses the edited price (not product.price) when orderType is not Normal', () => {
    const onAdded = vi.fn();
    render(
      <Wrapper>
        <SaleProductRow
          product={makeProduct({ id: 'prod-9', price: 3 })}
          orderType={OrderType.Mayorista}
          onAdded={onAdded}
        />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(onAdded).toHaveBeenCalledWith('prod-9', 1, 5);
  });

  it('respects an updated quantity value when adding to cart', () => {
    const onAdded = vi.fn();
    render(
      <Wrapper>
        <SaleProductRow product={makeProduct({ id: 'prod-9', price: 3 })} orderType={OrderType.Normal} onAdded={onAdded} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(onAdded).toHaveBeenCalledWith('prod-9', 4, 3);
  });

  it('blocks add-to-cart and shows an inline error when discountFromInvantory is true and stock is insufficient', () => {
    const onAdded = vi.fn();
    render(
      <Wrapper>
        <SaleProductRow
          product={makeProduct({ id: 'prod-low-stock', discountFromInvantory: true })}
          orderType={OrderType.Normal}
          onAdded={onAdded}
          checkAvailability={() => false}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(onAdded).not.toHaveBeenCalled();
    // SALES.NOT_INVENTORY_AVAILABLE_MESSAGE
    expect(screen.getByText('El producto no está disponible en el inventario.')).toBeInTheDocument();
  });

  it('does not call checkAvailability when discountFromInvantory is false', () => {
    const checkAvailability = vi.fn().mockReturnValue(false);
    const onAdded = vi.fn();
    render(
      <Wrapper>
        <SaleProductRow
          product={makeProduct({ discountFromInvantory: false })}
          orderType={OrderType.Normal}
          onAdded={onAdded}
          checkAvailability={checkAvailability}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(checkAvailability).not.toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalled();
  });
});
