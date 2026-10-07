import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppOrderLink,
  type WhatsAppOrderLinkInput,
} from '~/catalog/lib/whatsapp-order-link';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';

/** Pedido de ejemplo: 2 x 82.50 = 165 de subtotal + 50 de envío = 215 de total. */
const ORDER: WhatsAppOrderLinkInput = {
  whatsappNumber: '+53 5-123 4567',
  storeName: 'Tienda Ana',
  code: 'K7M2QX',
  lines: [{ name: 'Camisa azul', quantity: 2, unitPrice: 82.5 }],
  subtotal: 165,
  deliveryFee: 50,
  total: 215,
  currency: 0,
  deliveryType: 'delivery',
  deliveryAddress: 'Calle 23 #45',
  customerName: 'Ana',
  customerPhone: '+5351234567',
  notes: 'Tocar el timbre',
};

/**
 * Importe tal como lo escribe el resumen: el MISMO formatter que la carta, pero con el espacio
 * duro de millares convertido en un espacio normal (el resumen no lo lleva).
 */
function money(amount: number, currency: number): string {
  return formatMoneyWithCurrency(amount, currency).replace(/\u00A0/g, ' ');
}

/** Texto ya decodificado de la query `?text=`: lo que la tienda lee en WhatsApp. */
function summaryText(url: string | null): string {
  expect(url).not.toBeNull();
  const parsed = new URL(url as unknown as string);
  return parsed.searchParams.get('text') ?? '';
}

describe('buildWhatsAppOrderLink (F4)', () => {
  describe('número', () => {
    // `wa.me` NO entiende un número con formato humano: un solo carácter no numérico y el chat
    // abre contra una conversación inexistente. Por eso se queda SOLO con los dígitos.
    it.each([
      ['+53 5-123 4567', '5351234567'],
      ['5351234567', '5351234567'],
      ['+53 (5) 123-4567', '5351234567'],
      ['  +53-5 123 4567  ', '5351234567'],
    ])('normaliza "%s" a solo dígitos', (input, expected) => {
      const url = buildWhatsAppOrderLink({ ...ORDER, whatsappNumber: input });

      expect(url).toContain(`https://wa.me/${expected}?text=`);
    });

    // Sin número NO se abre un chat contra un destinatario vacío: se devuelve `null` y quien
    // llama muestra el aviso de envío bloqueado. El pedido ya está guardado para entonces.
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['vacío', ''],
      ['solo espacios', '   '],
      ['solo signs', '++ () -'],
    ])('devuelve null con el número %s', (_label, input) => {
      expect(buildWhatsAppOrderLink({ ...ORDER, whatsappNumber: input })).toBeNull();
    });
  });

  describe('texto del resumen', () => {
    it('abre con el esqueleto: tienda, código destacado, cliente y entrega', () => {
      const text = summaryText(buildWhatsAppOrderLink(ORDER));

      expect(text).toContain('Pedido K7M2QX — Tienda Ana');
      expect(text).toContain('Cliente: Ana (+5351234567)');
      expect(text).toContain('Entrega: A domicilio — Calle 23 #45');
      expect(text).toContain('Notas: Tocar el timbre');
    });

    // El código es lo que la persona dicta por WhatsApp y lo que la tienda cruza con su panel:
    // tiene que leerse de un vistazo, así que va en la primera línea.
    it('pone el código en la primera línea, donde se lee y se dicta', () => {
      const text = summaryText(buildWhatsAppOrderLink(ORDER));

      expect(text.split('\n')[0]).toContain('K7M2QX');
    });

    it('escribe cada línea como cantidad × nombre — importe', () => {
      const text = summaryText(buildWhatsAppOrderLink(ORDER));

      expect(text).toContain('2 × Camisa azul — 165 CUP');
    });

    // El importe de la línea es el TOTAL de esa línea (unitario × cantidad), no el unitario: es
    // lo que hace que sumar las líneas dé el subtotal que viene justo debajo.
    it('el importe de la línea es unitario × cantidad, para que cuadre con el subtotal', () => {
      const text = summaryText(
        buildWhatsAppOrderLink({
          ...ORDER,
          deliveryFee: 0,
          subtotal: 130,
          total: 130,
          lines: [
            { name: 'Arroz', quantity: 1, unitPrice: 100 },
            { name: 'Azúcar', quantity: 2, unitPrice: 15 },
          ],
        }),
      );

      expect(text).toContain('1 × Arroz — 100 CUP');
      expect(text).toContain('2 × Azúcar — 30 CUP');
    });

    it('incluye subtotal, envío y total en la moneda del catálogo', () => {
      const text = summaryText(buildWhatsAppOrderLink(ORDER));

      expect(text).toContain(`Subtotal: ${money(165, 0)}`);
      expect(text).toContain(`Envío: ${money(50, 0)}`);
      expect(text).toContain(`TOTAL: ${money(215, 0)}`);
      // El TOTAL es el que Calculó el SERVIDOR: el cliente lo pasa tal cual, nunca lo recalcula
      // aquí (un cliente manipulado no cambia lo que la tienda ve).
      expect(text).toContain('TOTAL: 215 CUP');
    });

    // Con la moneda del catálogo en USD, un resumen en CUP sería un pedido con el importe mal
    // leído por la tienda.
    it('usa la moneda del catálogo, no una fija', () => {
      const text = summaryText(buildWhatsAppOrderLink({ ...ORDER, currency: 1 }));

      expect(text).toContain('TOTAL: 215 USD');
    });

    it('con recogida no inventa dirección ni línea de envío', () => {
      const text = summaryText(
        buildWhatsAppOrderLink({
          ...ORDER,
          deliveryType: 'pickup',
          deliveryAddress: null,
          deliveryFee: 0,
          subtotal: 165,
          total: 165,
        }),
      );

      expect(text).toContain('Entrega: Recojo en tienda');
      expect(text).not.toContain('Envío:');
      expect(text).not.toContain('Calle 23');
    });

    // Con domicilio pero envío gratis el importe es 0: una línea "Envío: 0 CUP" solo adds ruido.
    it('omite el envío cuando el costo es cero', () => {
      const text = summaryText(buildWhatsAppOrderLink({ ...ORDER, deliveryFee: 0, total: 165 }));

      expect(text).not.toContain('Envío:');
      expect(text).toContain('Entrega: A domicilio — Calle 23 #45');
    });

    // Sin notas ni dirección no hay líneas "Notas:" o "Entrega:" a medio borrar: el resumen se
    // lee como un mensaje, no como una plantilla con huecos.
    it('omite las líneas vacías en vez de dejar etiquetas sueltas', () => {
      const text = summaryText(
        buildWhatsAppOrderLink({
          ...ORDER,
          notes: null,
          deliveryType: 'pickup',
          deliveryAddress: null,
          customerPhone: null,
        }),
      );

      expect(text).not.toContain('Notas:');
      expect(text).not.toContain('Cliente: Ana ()');
    });

    // El mensaje va a un chat de texto: nada de etiquetas, y un nombre de producto con saltos de
    // línea sueltos (vienen de una importación) no puede desarmar el resumen.
    it('es texto plano: sin etiquetas HTML y con los saltos de línea collapsing', () => {
      const text = summaryText(
        buildWhatsAppOrderLink({
          ...ORDER,
          notes: 'Tocar el timbre\ndejar en la puerta',
          lines: [{ name: 'Camisa\n  azul', quantity: 1, unitPrice: 165 }],
          subtotal: 165,
          deliveryFee: 0,
          total: 165,
        }),
      );

      expect(text).not.toMatch(/<[^>]+>/);
      expect(text).toContain('1 × Camisa azul — 165 CUP');
      expect(text).toContain('Notas: Tocar el timbre dejar en la puerta');
    });
  });

  describe('URL', () => {
    // El texto viaja codificado en la query: un espacio o un salto de línea sin codificar rompe la
    // URL y el mensaje se mandaría cortado.
    it('codifica el texto en la query', () => {
      const url = buildWhatsAppOrderLink(ORDER) as string;

      expect(url.startsWith('https://wa.me/5351234567?text=')).toBe(true);
      expect(url).not.toMatch(/[\s]/);
      expect(url).toContain('%20');
    });
  });
});
