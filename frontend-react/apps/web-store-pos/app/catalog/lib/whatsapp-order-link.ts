import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';

/**
 * Enlace `wa.me` con el resumen del pedido (F4, decisión D2).
 *
 * NO hay API de WhatsApp, Twilio ni SMS: se compone un enlace y lo abre el propio cliente desde
 * su navegador, así que no hay coste de proveedor, ni credenciales en el servidor, ni nada que
 * pueda mandar un mensaje en nombre de la tienda. El pedido YA está guardado cuando esto se
 * arma — el resumen es un aviso, no el pedido.
 *
 * El texto va en español y en TEXTO PLANO: WhatsApp no interpreta etiquetas y el mensaje lo lee
 * una persona, no una plantilla. Los importes usan la moneda del catálogo y el formatter de la
 * app, para que el número que ve la tienda sea el mismo que ve el cliente en la carta.
 *
 * `lines`, `subtotal` y `total` son los del SNAPSHOT que devolvió el servidor al crear el pedido,
 * no los del carrito del cliente: el mensaje tiene que cuadrar con el pedido ya guardado. No hay
 * línea de envío porque el pedido no tiene costo de envío.
 */

/** Base del esquema de WhatsApp. El número va como dígitos, sin `+` ni separación. */
const WA_ME_BASE_URL = 'https://wa.me';

/**
 * Modalidad de entrega en el vocabulario del MENSAJE, no en el del enum del backend
 * (`OrderDeliveryType`): este módulo no necesita saber qué valor tiene el enum, solo si el
 * pedido se recoge o se entrega en casa. Quien llama hace el mapeo.
 */
export type WhatsAppDeliveryType = 'pickup' | 'delivery';

/** Una línea del resumen: nombre y precio UNITARIO (el total de la línea se calcula aquí). */
export interface WhatsAppOrderLine {
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface WhatsAppOrderLinkInput {
  /**
   * Número de la tienda TAL CUAL lo guardó (`StoreCatalogSettings.WhatsappNumber`). Si al
   * normalizarse queda vacío NO hay enlace: una tienda sin número bloquea el envío.
   */
  readonly whatsappNumber?: string | null;
  readonly storeName: string;
  /**
   * Código del pedido: se dicta por WhatsApp y es lo que la tienda cruza con su panel. Es
   * OPCIONAL: en el modo SIN PERSISTENCIA (M3, solo módulo 19) no hay `Order`, así que no hay
   * código que dictar y el encabezado NO lo inventa.
   */
  readonly code?: string | null;
  readonly lines: readonly WhatsAppOrderLine[];
  /** Subtotal de las líneas. */
  readonly subtotal: number;
  /** TOTAL ya calculado por el servidor: aquí no se recalcula, se imprime. */
  readonly total: number;
  /** Moneda del catálogo por valor del enum `Currency`. */
  readonly currency: number;
  readonly deliveryType: WhatsAppDeliveryType;
  readonly deliveryAddress?: string | null;
  readonly customerName?: string | null;
  readonly customerPhone?: string | null;
  readonly notes?: string | null;
}

/**
 * El número a como lo entiende `wa.me`: SOLO dígitos, con código de país. Una tienda puede
 * escribirlo como lo dicta ("+53 5-123 4567"), y un solo carácter no numérico abre el chat
 * contra una conversación inexistente.
 *
 * No se "adivina" nada más (no se quita un prefijo internacional `00` ni se añade un código de
 * país): `wa.me` solo entiende dígitos con código de país, y un número mal normalizado abre un
 * chat contra alguien que no existe sin avisar.
 */
function normalizeWhatsAppNumber(whatsappNumber?: string | null): string {
  return (whatsappNumber ?? '').replace(/\D/g, '');
}

/**
 * Colapsa espacios y saltos de línea del texto libre (nombres, notas, dirección). Un `\n` suelto
 * en un nombre de producto —viene de una importación— desarmaría el resumen en más de una
 * línea y lo que sigue parece un importe.
 */
function collapse(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** Resumen del pedido en texto plano, tal cual lo lee la tienda en WhatsApp. */
function buildWhatsAppOrderSummary(input: WhatsAppOrderLinkInput): string {
  const currency = input.currency;
  const code = collapse(input.code ?? '');
  const header: string[] = [
    code ? `Pedido ${code} — ${collapse(input.storeName)}` : collapse(input.storeName),
  ];

  const client = [
    collapse(input.customerName),
    collapse(input.customerPhone) ? `(${collapse(input.customerPhone)})` : '',
  ].filter(Boolean);
  if (client.length > 0) header.push(`Cliente: ${client.join(' ')}`);

  header.push(
    input.deliveryType === 'delivery'
      ? `Entrega: A domicilio${collapse(input.deliveryAddress) ? ` — ${collapse(input.deliveryAddress)}` : ''}`
      : 'Entrega: Recojo en tienda',
  );

  const notes = collapse(input.notes);
  if (notes) header.push(`Notas: ${notes}`);

  const body: string[] = [
    // Importe de la LÍNEA (unitario × cantidad), no el unitario: es lo que hace que sumar las
    // líneas dé el subtotal que va justo debajo.
    ...input.lines.map(
      (line) =>
        `${line.quantity} × ${collapse(line.name)} — ${formatMoneyWithCurrency(
          line.unitPrice * line.quantity,
          currency,
        )}`,
    ),
    `Subtotal: ${formatMoneyWithCurrency(input.subtotal, currency)}`,
  ];

  // Envío: el pedido no tiene costo de envío, así que no hay línea que imprimir. La modalidad ya
  // se dice en "Entrega:".

  body.push(`TOTAL: ${formatMoneyWithCurrency(input.total, currency)}`);

  // El separador de millares del formatter de la app es un espacio duro (NBSP) pensado para que
  // una cifra no se parta al final de una línea en pantalla. En un chat es ruido: el mensaje se
  // copia, se busca y se reenvía, y un NBSP invisible rompe la búsqueda. El formatter sigue
  // siendo la única fuente del formato; aquí solo se cambia ese espacio por uno normal.
  return [...header, '', ...body].join('\n').replace(/\u00A0/g, ' ');
}

/**
 * Enlace `wa.me` del pedido, o `null` si la tienda no tiene número utilizable.
 *
 * Devolver `null` en vez de una URL a `wa.me/` es deliberado: el llamador tiene que poder
 * distinguir "no hay a quién escribir" (envío BLOQUEADO, el pedido sigue guardado) de "hay
 * enlace" (se abre). Un enlace vacío no distinguiría las dos cosas.
 */
export function buildWhatsAppOrderLink(input: WhatsAppOrderLinkInput): string | null {
  const digits = normalizeWhatsAppNumber(input.whatsappNumber);
  if (!digits) return null;

  return `${WA_ME_BASE_URL}/${digits}?text=${encodeURIComponent(buildWhatsAppOrderSummary(input))}`;
}
