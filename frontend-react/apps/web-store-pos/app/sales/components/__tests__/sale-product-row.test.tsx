import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { OrderType } from '@store-mgmt/domain';
import type { Product } from '@store-mgmt/domain';
import { SaleProductRow } from '../sale-product-row';

// Angular: Swal.fire({ title: GENERAL.RESPONSE.ERROR_TITLE, text: message, icon: 'error' })
// (sale-product-row.component.ts:68-74). React uses the same library via the
// showBlockingError wrapper — mock the wrapper module directly (not window.alert) per the
// SweetAlert2 port.
const showBlockingErrorMock = vi.fn();
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('calls onAdded with productId, quantity and price when clicked (no checkAvailability wired)', () => {
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

  // Angular's addProductToCart (sale-product-row.component.ts:58-104) ALWAYS calls
  // hasAvailableProductToSale — no discountFromInvantory gate at the component level, the
  // gate lives inside the service (branch 4). React mirrors that: checkAvailability, when
  // provided, is called unconditionally.
  it('calls checkAvailability regardless of discountFromInvantory (Angular always runs hasAvailableProductToSale)', () => {
    const checkAvailability = vi.fn().mockReturnValue({ succeeded: true });
    const onAdded = vi.fn();
    render(
      <Wrapper>
        <SaleProductRow
          product={makeProduct({ id: 'prod-9', discountFromInvantory: false })}
          orderType={OrderType.Normal}
          onAdded={onAdded}
          checkAvailability={checkAvailability}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(checkAvailability).toHaveBeenCalledWith('prod-9', 1);
    expect(onAdded).toHaveBeenCalled();
  });

  it('includes the current form quantity in the checkAvailability call', () => {
    const checkAvailability = vi.fn().mockReturnValue({ succeeded: true });
    render(
      <Wrapper>
        <SaleProductRow
          product={makeProduct({ id: 'prod-9' })}
          orderType={OrderType.Normal}
          onAdded={vi.fn()}
          checkAvailability={checkAvailability}
        />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(checkAvailability).toHaveBeenCalledWith('prod-9', 7);
  });

  // Angular: on failure, Swal.fire({ title: GENERAL.RESPONSE.ERROR_TITLE, text: message,
  // icon: 'error' }) — a BLOCKING modal that aborts the add (sale-product-row.component.ts
  // :62-104). React has no modal library; this reuses the codebase's established native
  // "blocking browser dialog" pattern (window.confirm in use-unsaved-changes-prompt.ts) via
  // showBlockingError -> window.alert.
  it('blocks add-to-cart and shows a blocking alert with the ERROR_TITLE + resolved message when checkAvailability fails', () => {
    const onAdded = vi.fn();
    render(
      <Wrapper>
        <SaleProductRow
          product={makeProduct({ id: 'prod-low-stock', discountFromInvantory: true })}
          orderType={OrderType.Normal}
          onAdded={onAdded}
          checkAvailability={() => ({ succeeded: false, errorCode: 'QUANTITY_NOT_AVAILABLE' })}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }));
    expect(onAdded).not.toHaveBeenCalled();
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    const [title, text] = showBlockingErrorMock.mock.calls[0];
    expect(title).toBe('Error');
    expect(text).toBe('La cantidad del producto no está disponible en el inventario.');
  });

  it('resolves each error code to its exact Angular ProductErrors Spanish message', () => {
    const cases: Array<[string, string]> = [
      ['NOT_EXISTS', 'El producto no existe.'],
      ['INACTIVE', 'El producto no está activo.'],
      ['NOT_AVAILABLE_TO_SALE', 'El producto no está disponible para la venta.'],
      ['NOT_AVAILABLE', 'El producto no está disponible en el inventario.'],
      ['QUANTITY_NOT_AVAILABLE', 'La cantidad del producto no está disponible en el inventario.'],
    ];

    for (const [errorCode, expectedMessage] of cases) {
      showBlockingErrorMock.mockClear();
      render(
        <Wrapper>
          <SaleProductRow
            product={makeProduct({ id: `prod-${errorCode}` })}
            orderType={OrderType.Normal}
            onAdded={vi.fn()}
            checkAvailability={() => ({ succeeded: false, errorCode: errorCode as never })}
          />
        </Wrapper>,
      );
      fireEvent.click(screen.getAllByRole('button', { name: /adicionar/i }).at(-1)!);
      const [, text] = showBlockingErrorMock.mock.calls[0];
      expect(text).toBe(expectedMessage);
    }
  });
});
