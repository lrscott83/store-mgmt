import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppOrderLink,
  type WhatsAppOrderLinkInput,
} from '~/catalog/lib/whatsapp-order-link';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';

/**
 * Resumen de WhatsApp de un pedido MAYORISTA (S6).
 *
 * El mensaje tiene que hablar en paquetes con la unidad del producto ("12 cajas") y los importes
 * siguen saliendo del SNAPSHOT del servidor: `price × quantity`, porque `quantity` va en unidades y
 * `price` es el precio por unidad del escalón. Lo que cambia es la PALABRA, no la cuenta.
 */

const BASE: WhatsAppOrderLinkInput = {
  whatsappNumber: '+53 5-123 4567',
  storeName: 'Tienda Ana',
  code: 'K7M2QX',
  lines: [{ name: 'Cerveza', quantity: 288, unitPrice: 8, packs: 12, unitLabel: 'caja' }],
  subtotal: 2304,
  total: 2304,
  currency: 0,
  deliveryType: 'pickup',
  deliveryAddress: null,
  customerName: 'Ana',
  customerPhone: '+5351234567',
  notes: null,
};

function money(amount: number, currency: number): string {
  return formatMoneyWithCurrency(amount, currency).replace(/\u00A0/g, ' ');
}

function summaryText(url: string | null): string {
  expect(url).not.toBeNull();
  const parsed = new URL(url as unknown as string);
  return parsed.searchParams.get('text') ?? '';
}

describe('buildWhatsAppOrderLink — líneas mayoristas (S6)', () => {
  it('dice los PAQUETES y la unidad, no las unidades', () => {
    const text = summaryText(buildWhatsAppOrderLink(BASE));

    expect(text).toContain(`12 cajas × Cerveza — ${money(2304, 0)}`);
    // Ni "288" ni la palabra "unidad": el cliente pidió cajas.
    expect(text).not.toContain('288 ×');
  });

  it('sin unidad configurada cae al label histórico del POS', () => {
    const text = summaryText(
      buildWhatsAppOrderLink({
        ...BASE,
        lines: [{ name: 'Cerveza', quantity: 24, unitPrice: 8, packs: 2, unitLabel: null }],
        subtotal: 192,
        total: 192,
      }),
    );

    expect(text).toContain(`2 paquetes × Cerveza — ${money(192, 0)}`);
  });

  it('una línea por unidad (o de un pedido viejo) mantiene el formato de siempre', () => {
    const text = summaryText(
      buildWhatsAppOrderLink({
        ...BASE,
        lines: [{ name: 'Camisa azul', quantity: 2, unitPrice: 82.5 }],
        subtotal: 165,
        total: 165,
      }),
    );

    expect(text).toContain(`2 × Camisa azul — ${money(165, 0)}`);
    expect(text).not.toContain('paquetes');
  });

  it('packs en null no inventa paquetes', () => {
    const text = summaryText(
      buildWhatsAppOrderLink({
        ...BASE,
        lines: [{ name: 'Arroz', quantity: 3, unitPrice: 10, packs: null, unitLabel: 'caja' }],
        subtotal: 30,
        total: 30,
      }),
    );

    expect(text).toContain(`3 × Arroz — ${money(30, 0)}`);
    expect(text).not.toContain('cajas');
  });
});
