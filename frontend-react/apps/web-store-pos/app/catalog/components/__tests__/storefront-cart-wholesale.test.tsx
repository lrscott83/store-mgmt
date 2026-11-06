import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { StorefrontCart } from '~/catalog/components/storefront-cart';
import type { StorefrontCartLine } from '~/catalog/lib/storefront-cart-store';

/**
 * Los botones ± del carrito del cliente (S4): mueven UN paquete en una línea mayorista y UNA unidad
 * en una línea normal. El componente no decide precios —para eso está el store—, pero sí decide
 * QUÉ número manda a `onUpdateQuantity`, y equivocarse ahí manda 24 unidades donde van 1 paquete.
 */

const WHOLESALE_LINE: StorefrontCartLine = {
  productId: 'cerveza',
  name: 'Cerveza',
  currency: 'CUP',
  unitPrice: 32,
  imageUrl: null,
  // 3 paquetes × 12 unidades = 36 unidades a 32 por unidad.
  quantity: 36,
  priceMode: 'Wholesale',
  packs: 3,
  packSize: 12,
  unitLabel: 'caja',
  tiers: [
    { minPacks: 3, pricePerUnit: 32 },
    { minPacks: 6, pricePerUnit: 28 },
  ],
};

const UNIT_LINE: StorefrontCartLine = {
  productId: 'camisa',
  name: 'Camisa azul',
  currency: 'CUP',
  unitPrice: 82.5,
  imageUrl: null,
  quantity: 2,
};

function renderCart(lines: readonly StorefrontCartLine[]) {
  const onUpdateQuantity = vi.fn();
  const onRemove = vi.fn();
  render(
    <IntlProvider locale="es" messages={esMessages}>
      <StorefrontCart
        open
        onClose={vi.fn()}
        lines={lines}
        subtotal={lines.reduce(
          (sum, line) => sum + line.unitPrice * line.quantity,
          0,
        )}
        currency="CUP"
        onUpdateQuantity={onUpdateQuantity}
        onRemove={onRemove}
        onClear={vi.fn()}
        onCheckout={vi.fn()}
      />
    </IntlProvider>,
  );
  return { onUpdateQuantity, onRemove };
}

describe('StorefrontCart — líneas mayoristas', () => {
  it('el − mueve UN paquete, no una unidad ni un paquete entero de unidades', () => {
    const { onUpdateQuantity } = renderCart([WHOLESALE_LINE]);

    fireEvent.click(screen.getByTestId('catalog-cart-decrease-cerveza'));

    expect(onUpdateQuantity).toHaveBeenCalledWith('cerveza', 2);
  });

  it('el + también mueve un paquete', () => {
    const { onUpdateQuantity } = renderCart([WHOLESALE_LINE]);

    fireEvent.click(screen.getByTestId('catalog-cart-increase-cerveza'));

    expect(onUpdateQuantity).toHaveBeenCalledWith('cerveza', 4);
  });

  it('el input muestra PAQUETES con el mínimo del primer escalón', () => {
    renderCart([WHOLESALE_LINE]);

    const input = screen.getByTestId('catalog-cart-quantity-cerveza');
    expect(input).toHaveValue(3);
    expect(input).toHaveAttribute('min', '3');
  });

  it('la línea dice paquetes y unidad, y el precio del PAQUETE', () => {
    renderCart([WHOLESALE_LINE]);

    const item = screen.getByTestId('catalog-cart-item-cerveza');
    // "3 cajas ×" y el precio de la caja (32 × 12 = 384), no el precio por unidad.
    expect(within(item).getByText(/3 cajas ×/)).toBeInTheDocument();
    expect(item).toHaveTextContent(/384\s*CUP/);
  });

  it('una línea por unidad sigue moviéndose de uno en uno', () => {
    const { onUpdateQuantity } = renderCart([UNIT_LINE]);

    fireEvent.click(screen.getByTestId('catalog-cart-decrease-camisa'));
    fireEvent.click(screen.getByTestId('catalog-cart-increase-camisa'));

    expect(onUpdateQuantity).toHaveBeenNthCalledWith(1, 'camisa', 1);
    expect(onUpdateQuantity).toHaveBeenNthCalledWith(2, 'camisa', 3);
    expect(screen.getByTestId('catalog-cart-quantity-camisa')).toHaveAttribute('min', '1');
  });
});
