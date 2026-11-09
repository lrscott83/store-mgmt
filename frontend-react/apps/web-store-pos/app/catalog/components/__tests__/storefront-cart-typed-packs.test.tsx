import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { StorefrontCart } from '~/catalog/components/storefront-cart';
import type { StorefrontCartLine } from '~/catalog/lib/storefront-cart-store';
import { lineTotal } from '~/catalog/lib/storefront-cart-store';

/**
 * TECLEAR la cantidad de una línea mayorista (R3-CART-TYPED-PACKS, S4).
 *
 * La cantidad de una línea mayorista se cuenta en PAQUETES, y el store borra la línea cuando el
 * número que recibe queda por debajo del mínimo vendible —esa es la regla del POS para el `−`, una
 * acción explícita—. Aplicada a lo TECLEADO, la MISMA regla destruye la línea mientras el cliente
 * escribe: al escribir "12" sobre un mínimo de 3, el primer dígito ("1") llegaba al store y se
 * llevaba el producto del carrito. Por eso el camino TECLEADO no puede mandar un número por debajo
 * del mínimo: conserva el valor anterior y el campo se recompone en el siguiente valor válido o al
 * salir de él. Es el mismo trato que ya recibía la línea por unidad con un valor vacío o ≤ 0.
 *
 * Estas pruebas se hacen por ROL y nombre accesible (no por `data-testid`): lo que se fija es el
 * contrato que ve el cliente —un campo numérico y dos botones con nombre—, no la etiqueta interna.
 */

const WHOLESALE_LINE: StorefrontCartLine = {
  productId: 'cerveza',
  name: 'Cerveza',
  currency: 'CUP',
  // 12 cajas × 12 unidades × 32 por unidad.
  unitPrice: 32,
  imageUrl: null,
  quantity: 144,
  priceMode: 'Wholesale',
  packs: 12,
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
  render(
    <IntlProvider locale="es" messages={esMessages}>
      <StorefrontCart
        open
        onClose={vi.fn()}
        lines={lines}
        subtotal={lines.reduce((sum, line) => sum + lineTotal(line), 0)}
        currency="CUP"
        onUpdateQuantity={onUpdateQuantity}
        onRemove={vi.fn()}
        onClear={vi.fn()}
        onCheckout={vi.fn()}
      />
    </IntlProvider>,
  );
  return { onUpdateQuantity };
}

function quantityField(name: string) {
  return screen.getByRole('spinbutton', { name });
}

describe('StorefrontCart — cantidad TECLEADA de una línea mayorista', () => {
  it('el primer dígito de "12" no llega al store: la línea sigue en el carrito', () => {
    const { onUpdateQuantity } = renderCart([WHOLESALE_LINE]);

    fireEvent.change(quantityField('Cerveza'), { target: { value: '1' } });

    // El mínimo de esta línea es 3: "1" no es una cantidad comprable, y mandarlo al store BORRA la
    // línea (F3-R4 dejaba de cumplirse justo aquí).
    expect(onUpdateQuantity).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole('dialog', { name: 'Tu pedido' }));
    expect(dialog.getByRole('spinbutton', { name: 'Cerveza' })).toHaveValue(12);
  });

  it('un valor por debajo del mínimo tampoco llega: se espera al número completo', () => {
    const { onUpdateQuantity } = renderCart([WHOLESALE_LINE]);

    fireEvent.change(quantityField('Cerveza'), { target: { value: '2' } });

    expect(onUpdateQuantity).not.toHaveBeenCalled();
  });

  it('una cantidad EN el mínimo se aplica en el acto', () => {
    const { onUpdateQuantity } = renderCart([WHOLESALE_LINE]);

    fireEvent.change(quantityField('Cerveza'), { target: { value: '3' } });

    // El mínimo es una cantidad vendible: no hay nada que esperar.
    expect(onUpdateQuantity).toHaveBeenCalledWith('cerveza', 3);
  });

  it('una cantidad por encima del mínimo se aplica en el acto', () => {
    const { onUpdateQuantity } = renderCart([WHOLESALE_LINE]);

    fireEvent.change(quantityField('Cerveza'), { target: { value: '24' } });

    expect(onUpdateQuantity).toHaveBeenCalledWith('cerveza', 24);
  });

  it('un campo vacío o no entero sigue sin tocar el store', () => {
    const { onUpdateQuantity } = renderCart([WHOLESALE_LINE]);

    fireEvent.change(quantityField('Cerveza'), { target: { value: '' } });
    fireEvent.change(quantityField('Cerveza'), { target: { value: '4.5' } });

    expect(onUpdateQuantity).not.toHaveBeenCalled();
  });

  it('el − SÍ manda el número de debajo del mínimo: ahí la línea sale del carrito a propósito', () => {
    // La regla de las pruebas anteriores es la del TECLADO. El `−` es una acción explícita del
    // cliente y conserva el suelo mayorista del POS: sobre un mínimo de 3 y una línea de 3 cajas, el
    // store recibe 2 y borra la línea, que es justo lo que el cliente pidió al bajar del mínimo.
    const atMinimum: StorefrontCartLine = { ...WHOLESALE_LINE, packs: 3, quantity: 36 };
    const { onUpdateQuantity } = renderCart([atMinimum]);

    fireEvent.click(screen.getByRole('button', { name: 'Disminuir cantidad de Cerveza' }));

    expect(onUpdateQuantity).toHaveBeenCalledWith('cerveza', 2);
  });

  it('en una línea por unidad teclear 0 no toca el store y teclear 5 sí', () => {
    // PRESERVE: la guarda de la línea por unidad es la que ya existía (mínimo 1) y no puede cambiar
    // de significado por haber generalizado la del mínimo mayorista.
    const { onUpdateQuantity } = renderCart([UNIT_LINE]);

    fireEvent.change(quantityField('Camisa azul'), { target: { value: '0' } });
    expect(onUpdateQuantity).not.toHaveBeenCalled();

    fireEvent.change(quantityField('Camisa azul'), { target: { value: '5' } });
    expect(onUpdateQuantity).toHaveBeenCalledWith('camisa', 5);
  });
});
