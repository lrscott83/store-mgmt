import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { StorefrontCart } from '~/catalog/components/storefront-cart';
import { StorefrontCheckout } from '~/catalog/components/storefront-checkout';
import { StorefrontOrderStatus } from '~/catalog/components/storefront-order-status';
import type { StorefrontCartLine } from '~/catalog/lib/storefront-cart-store';
import type {
  PublicOrderingConfig,
  PublicOrderCreated,
  PublicOrderStatus,
} from '~/sales/lib/services/catalog-http-service';
import {
  PublicOrderDeliveryType,
  PublicOrderPaymentStatus,
  PublicOrderStatusKind,
} from '~/sales/lib/services/catalog-http-service';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';

const serviceMock = vi.hoisted(() => ({
  createPublicOrder: vi.fn(),
  getPublicOrderStatus: vi.fn(),
}));

/** Interruptor para el caso "componer el resumen revienta" (F4-R2): el resto usa el real. */
const linkSpy = vi.hoisted(() => ({ throwsOnBuild: false }));

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('~/sales/lib/services/catalog-http-service')
  >('~/sales/lib/services/catalog-http-service');
  return { ...actual, catalogHttpService: { ...serviceMock } };
});

// Delegado al real salvo que el test pida que reviente: componer el resumen es una operación pura
// que en la vida real no falla, así que para cubrir su fallo hay que forzarlo.
vi.mock('~/catalog/lib/whatsapp-order-link', async () => {
  const actual = await vi.importActual<typeof import('~/catalog/lib/whatsapp-order-link')>(
    '~/catalog/lib/whatsapp-order-link',
  );
  return {
    ...actual,
    buildWhatsAppOrderLink: (input: Parameters<typeof actual.buildWhatsAppOrderLink>[0]) => {
      if (linkSpy.throwsOnBuild) throw new Error('no se pudo componer el resumen');
      return actual.buildWhatsAppOrderLink(input);
    },
  };
});

const envelope = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });
const failure = { data: null, succeeded: false, message: 'x', actionCode: 404, errors: [] };

const CONFIG: PublicOrderingConfig = {
  enabled: true,
  pickupEnabled: true,
  deliveryEnabled: true,
  businessHours: null,
  deliveryZones: null,
  paletteId: 'default',
  logoUrl: null,
  bannerUrl: null,
  // El showcase viaja siempre; el checkout no lo usa, pero el config es uno solo.
  carouselImages: [],
  dailyImages: [],
};

const LINE: StorefrontCartLine = {
  productId: 'p1',
  name: 'Camisa azul',
  currency: 'CUP',
  unitPrice: 82.5,
  imageUrl: null,
  quantity: 2,
};

/**
 * Lo que devuelve el SERVIDOR al crear el pedido: el código, los importes y las líneas del
 * SNAPSHOT PERSISTIDO (no las del carrito) y el número de la tienda (F4, T2).
 */
const CREATED: PublicOrderCreated = {
  id: 'o1',
  code: 'K7M2QX',
  subtotal: 165,
  total: 165,
  currency: 0,
  lines: [{ name: 'Camisa azul', quantity: 2, price: 82.5 }],
  whatsappNumber: '+53 5-987 6543',
};

/**
 * Importe tal como lo escribe la app: el formatter de la carta, con el NBSP de millares que el
 * resumen de WhatsApp sustituye por un espacio normal (F4-R6: nada de separadores a mano).
 */
function money(amount: number, currency = 0): string {
  return formatMoneyWithCurrency(amount, currency).replace(/\u00A0/g, ' ');
}

const STATUS: PublicOrderStatus = {
  code: 'K7M2QX',
  status: PublicOrderStatusKind.Preparing,
  paymentStatus: PublicOrderPaymentStatus.Pending,
  deliveryType: PublicOrderDeliveryType.Delivery,
  total: 165,
  currency: 0,
  items: [{ name: 'Camisa azul', quantity: 2, price: 82.5 }],
};

function renderWithIntl(node: React.ReactNode) {
  return render(<IntlProvider locale="es" messages={esMessages}>{node}</IntlProvider>);
}

/**
 * Promesa que el test suelta cuando quiere. Sirve para dejar el POST EN VUELO: es la única forma
 * de mirar el botón mientras la petición sigue abierta, que es donde vive la ventana del doble
 * envío.
 */
function deferred() {
  let release: (value: unknown) => void = () => undefined;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * Espía de `console.warn` silenciada: los avisos de R3-1/R3-2 son SEÑALES intencionadas, y sin
 * silenciarlos el test que las provoca ensucia la salida de la suite.
 */
function spyOnWarn() {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

describe('storefront cart / checkout / order status (F3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    linkSpy.throwsOnBuild = false;
  });

  describe('carrito', () => {
    function renderCart(overrides: Partial<React.ComponentProps<typeof StorefrontCart>> = {}) {
      return renderWithIntl(
        <StorefrontCart
          open
          onClose={() => undefined}
          lines={[LINE]}
          subtotal={165}
          currency="CUP"
          onUpdateQuantity={vi.fn()}
          onRemove={vi.fn()}
          onClear={vi.fn()}
          onCheckout={vi.fn()}
          {...overrides}
        />,
      );
    }

    it('pinta las líneas, el subtotal y el vaciado', () => {
      renderCart();

      const modal = screen.getByTestId('catalog-cart-modal');
      expect(within(modal).getByTestId('catalog-cart-item-p1')).toHaveTextContent('Camisa azul');
      expect(within(modal).getByTestId('catalog-cart-quantity-p1')).toHaveValue(2);
      expect(within(modal).getByTestId('catalog-cart-subtotal')).toHaveTextContent(/165\s*CUP/);
      expect(within(modal).getByTestId('catalog-cart-clear')).toBeInTheDocument();
      expect(within(modal).getByTestId('catalog-cart-checkout')).toBeInTheDocument();
    });

    it('avisa de que el total lo calcula la tienda, no el carrito', () => {
      renderCart();
      // El subtotal del cliente NUNCA es el total del pedido: el servidor lo recalcula con los
      // precios publicados. La vista lo dice en vez de dejar que se lea como cifra cerrada.
      expect(screen.getByTestId('catalog-cart-modal')).toHaveTextContent(
        'El total final lo calcula la tienda al confirmar el pedido.',
      );
    });

    it('sin líneas muestra el carrito vacío y ni subtotal ni vaciar', () => {
      renderCart({ lines: [], subtotal: 0, currency: null });

      expect(screen.getByTestId('catalog-cart-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('catalog-cart-subtotal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('catalog-cart-clear')).not.toBeInTheDocument();
    });

    it('reporta cantidad, quitar y vaciar al padre', () => {
      const onUpdateQuantity = vi.fn();
      const onRemove = vi.fn();
      const onClear = vi.fn();
      renderCart({ onUpdateQuantity, onRemove, onClear });

      fireEvent.click(screen.getByTestId('catalog-cart-increase-p1'));
      expect(onUpdateQuantity).toHaveBeenCalledWith('p1', 3);

      fireEvent.click(screen.getByTestId('catalog-cart-decrease-p1'));
      expect(onUpdateQuantity).toHaveBeenCalledWith('p1', 1);

      fireEvent.change(screen.getByTestId('catalog-cart-quantity-p1'), { target: { value: '7' } });
      expect(onUpdateQuantity).toHaveBeenCalledWith('p1', 7);

      fireEvent.click(screen.getByTestId('catalog-cart-remove-p1'));
      expect(onRemove).toHaveBeenCalledWith('p1');

      fireEvent.click(screen.getByTestId('catalog-cart-clear'));
      expect(onClear).toHaveBeenCalled();
    });

    // ── F3-R4 ─────────────────────────────────────────────────────────────────────────────
    // La CANTIDAD manda sobre la línea: en el store `updateQuantity(<= 0)` la borra, y eso está
    // bien para el botón − (una unidad menos que una es quitarla). En el input, en cambio, un
    // valor vacío o no positivo es el cliente RETOCANDO lo que escribió —el cursor está en medio y
    // acaba de borrar el dígito—: convertir eso en `0` se comía el producto entero.
    // Un número no entero (`1.5`) o un `0` tecleado también se ignoran: el input es de cantidad,
    // no de texto libre, y no puede ir más allá de lo que los botones −/+ permiten.
    it('vaciar el input de cantidad NO borra la línea, y tampoco un valor no positivo', () => {
      const onUpdateQuantity = vi.fn();
      renderCart({ onUpdateQuantity });

      fireEvent.change(screen.getByTestId('catalog-cart-quantity-p1'), { target: { value: '7' } });
      expect(onUpdateQuantity).toHaveBeenLastCalledWith('p1', 7);

      // Vaciar del todo: el input queda en blanco, la línea sigue ahí.
      fireEvent.change(screen.getByTestId('catalog-cart-quantity-p1'), { target: { value: '' } });
      expect(onUpdateQuantity).toHaveBeenCalledTimes(1);

      // Y el gesto real de retocar —borrar el dígito— tampoco lanza nada al store.
      fireEvent.change(screen.getByTestId('catalog-cart-quantity-p1'), { target: { value: '1' } });
      fireEvent.change(screen.getByTestId('catalog-cart-quantity-p1'), { target: { value: '' } });
      expect(onUpdateQuantity).toHaveBeenLastCalledWith('p1', 1);
      expect(onUpdateQuantity).toHaveBeenCalledTimes(2);

      // Valores que el input puede producir y que NO son una cantidad: se ignoran igual.
      fireEvent.change(screen.getByTestId('catalog-cart-quantity-p1'), { target: { value: '0' } });
      fireEvent.change(screen.getByTestId('catalog-cart-quantity-p1'), {
        target: { value: '1.5' },
      });
      fireEvent.change(screen.getByTestId('catalog-cart-quantity-p1'), {
        target: { value: '-3' },
      });
      expect(onUpdateQuantity).toHaveBeenCalledTimes(2);
    });

    // El botón − SÍ puede llegar a 0, y a 0 la línea se va: quitar es un gesto con su propio
    // botón. Lo que no puede es pasar por el input.
    it('el botón de decrease sigue pudiendo llegar a quitar la línea', () => {
      const onUpdateQuantity = vi.fn();
      renderCart({ lines: [{ ...LINE, quantity: 1 }], onUpdateQuantity });

      fireEvent.click(screen.getByTestId('catalog-cart-decrease-p1'));

      expect(onUpdateQuantity).toHaveBeenCalledWith('p1', 0);
    });
  });

  describe('checkout', () => {
    function renderCheckout(overrides: Partial<React.ComponentProps<typeof StorefrontCheckout>> = {}) {
      return renderWithIntl(
        <StorefrontCheckout
          open
          onClose={() => undefined}
          storeSlug="mi-tienda"
          config={CONFIG}
          lines={[LINE]}
          onCreated={vi.fn()}
          {...overrides}
        />,
      );
    }

    it('la dirección solo aparece con domicilio y desaparece con recogida', () => {
      renderCheckout();

      // Por defecto la modalidad es recogida: no se pide dirección.
      expect(screen.queryByTestId('checkout-address-field')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('checkout-delivery'));
      expect(screen.getByTestId('checkout-address-field')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('checkout-pickup'));
      expect(screen.queryByTestId('checkout-address-field')).not.toBeInTheDocument();
    });

    it('solo ofrece las modalidades que la config de la tienda admite', () => {
      renderCheckout({ config: { ...CONFIG, pickupEnabled: false } });

      expect(screen.queryByTestId('checkout-pickup')).not.toBeInTheDocument();
      // Sin recogida, la modalidad inicial es domicilio (y por eso sí pide dirección).
      expect(screen.getByTestId('checkout-delivery')).toBeChecked();
      expect(screen.getByTestId('checkout-address-field')).toBeInTheDocument();
    });

    it('valida en cliente antes de gastar el límite de tasa del servidor', () => {
      const onCreated = vi.fn();
      serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED));
      renderCheckout({ onCreated });

      fireEvent.click(screen.getByTestId('checkout-submit'));
      expect(screen.getByTestId('checkout-error')).toHaveTextContent('Escribe tu nombre.');
      expect(serviceMock.createPublicOrder).not.toHaveBeenCalled();

      fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: 'Ana' } });
      fireEvent.click(screen.getByTestId('checkout-submit'));
      expect(screen.getByTestId('checkout-error')).toHaveTextContent('Escribe un teléfono válido');

      fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '535' } });
      fireEvent.click(screen.getByTestId('checkout-submit'));
      expect(screen.getByTestId('checkout-error')).toHaveTextContent('Escribe un teléfono válido');

      fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '5351234567' } });
      fireEvent.click(screen.getByTestId('checkout-delivery'));
      fireEvent.click(screen.getByTestId('checkout-submit'));
      expect(screen.getByTestId('checkout-error')).toHaveTextContent(
        'El envío a domicilio necesita una dirección.',
      );
      expect(serviceMock.createPublicOrder).not.toHaveBeenCalled();
    });

    it('con carrito vacío no deja enviar el pedido', () => {
      serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED));
      renderCheckout({ lines: [] });

      fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: 'Ana' } });
      fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '5351234567' } });
      fireEvent.click(screen.getByTestId('checkout-submit'));

      expect(screen.getByTestId('checkout-error')).toHaveTextContent(
        'Añade al menos un producto antes de pedir.',
      );
      expect(serviceMock.createPublicOrder).not.toHaveBeenCalled();
    });

    it('envía SOLO productId y cantidad: ningún precio ni total viaja al servidor', async () => {
      const onCreated = vi.fn();
      serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED));
      renderCheckout({ onCreated });

      fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: '  Ana  ' } });
      fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: ' 5351234567 ' } });
      fireEvent.change(screen.getByTestId('checkout-notes'), { target: { value: 'Tarde' } });
      fireEvent.click(screen.getByTestId('checkout-submit'));

      await waitFor(() => expect(serviceMock.createPublicOrder).toHaveBeenCalledTimes(1));
      const [slug, payload] = serviceMock.createPublicOrder.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(slug).toBe('mi-tienda');
      expect(payload).toEqual({
        customerName: 'Ana',
        customerPhone: '5351234567',
        deliveryType: PublicOrderDeliveryType.Pickup,
        notes: 'Tarde',
        items: [{ productId: 'p1', quantity: 2 }],
      });
      // El precio unitario que el carrito conoce NO se envía: el servidor lo recalcula.
      expect(JSON.stringify(payload)).not.toContain('82.5');
      expect(payload).not.toHaveProperty('total');
      expect(payload).not.toHaveProperty('storeSlug');
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED));
    });

    it('con domicilio envía la dirección; con recogida no la manda ni la pide', async () => {
      serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED));
      renderCheckout();

      fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: 'Ana' } });
      fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '5351234567' } });
      fireEvent.click(screen.getByTestId('checkout-submit'));
      await waitFor(() => expect(serviceMock.createPublicOrder).toHaveBeenCalledTimes(1));
      expect(serviceMock.createPublicOrder.mock.calls[0][1]).not.toHaveProperty('deliveryAddress');

      serviceMock.createPublicOrder.mockClear();
      fireEvent.click(screen.getByTestId('checkout-delivery'));
      fireEvent.change(screen.getByTestId('checkout-address'), { target: { value: ' Vedado 12 ' } });
      fireEvent.click(screen.getByTestId('checkout-submit'));

      await waitFor(() => expect(serviceMock.createPublicOrder).toHaveBeenCalledTimes(1));
      const payload = serviceMock.createPublicOrder.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.deliveryType).toBe(PublicOrderDeliveryType.Delivery);
      expect(payload.deliveryAddress).toBe('Vedado 12');
    });

    it('un fallo del servidor se muestra sin perder el formulario', async () => {
      serviceMock.createPublicOrder.mockResolvedValue(failure);
      const onCreated = vi.fn();
      renderCheckout({ onCreated });

      fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: 'Ana' } });
      fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '5351234567' } });
      fireEvent.click(screen.getByTestId('checkout-submit'));

      expect(await screen.findByTestId('checkout-error')).toHaveTextContent(
        'No se pudo crear el pedido.',
      );
      expect(onCreated).not.toHaveBeenCalled();
      expect(screen.getByTestId('checkout-name')).toHaveValue('Ana');
    });

    it('un rechazo del servidor (excepción) también se muestra', async () => {
      serviceMock.createPublicOrder.mockRejectedValue({ response: { status: 429 } });
      renderCheckout();

      fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: 'Ana' } });
      fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '5351234567' } });
      fireEvent.click(screen.getByTestId('checkout-submit'));

      expect(await screen.findByTestId('checkout-error')).toBeInTheDocument();
    });

    // ── F3-R5 ─────────────────────────────────────────────────────────────────────────────
    // `disabled={submitting}` depende del RENDER: entre el gesto y ese render el botón sigue
    // vivo, así que un doble clic (o un Enter repetido) llega a `submit()` DOS veces. Sin el
    // guarda, el mismo clic crea dos pedidos — y el segundo ya no lo frena `disabled`, porque el
    // botón aún no sabe que está enviando.
    it('dos clics seguidos con el POST en vuelo crean UN solo pedido', async () => {
      const inFlight = deferred();
      serviceMock.createPublicOrder.mockReturnValue(inFlight.promise);
      const onCreated = vi.fn();
      renderCheckout({ onCreated });

      fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: 'Ana' } });
      fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '5351234567' } });

      // Los dos clics en el mismo tick: con el POST pendiente, que es la ventana donde `disabled`
      // todavía no se ha aplicado.
      const button = screen.getByTestId('checkout-submit');
      await act(async () => {
        button.click();
        button.click();
      });

      expect(serviceMock.createPublicOrder).toHaveBeenCalledTimes(1);

      // Cerrado el círculo: el pedido sale y se reporta una sola vez.
      inFlight.release(envelope(CREATED));
      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
      expect(serviceMock.createPublicOrder).toHaveBeenCalledTimes(1);
    });

    // ── F4: envío del pedido por WhatsApp ──────────────────────────────────────────────────
    // El pedido YA está guardado cuando esto ocurre: el enlace es el AVISO, no el pedido. Por eso
    // estos tests fijan las dos caras a la vez — el `wa.me` que se abre y el `onCreated` que
    // avisa al padre— y comprueban que el alta se reporta igual incluso sin número.
    describe('envío por WhatsApp', () => {
      const CREATED_WITH_NUMBER: PublicOrderCreated = {
        ...CREATED,
        whatsappNumber: '+53 5-987 6543',
      };

      /**
       * Padre mínimo que hace EXACTAMENTE lo que hace `public-catalog.tsx` al recibir el pedido:
       * vacía el carrito, CIERRA el checkout y abre la consulta del pedido recién creado. Es el
       * gesto que dispara el reset del aviso, así que probarlo aquí es probarlo de verdad (F4-R1).
       */
      function ParentHarness({ onCreatedSpy }: { onCreatedSpy: () => void }) {
        const [open, setOpen] = useState(true);
        return (
          <IntlProvider locale="es" messages={esMessages}>
            <button type="button" data-testid="parent-reopen" onClick={() => setOpen(true)}>
              reabrir
            </button>
            <StorefrontCheckout
              open={open}
              onClose={() => setOpen(false)}
              storeSlug="mi-tienda"
              config={CONFIG}
              lines={[LINE]}
              onCreated={() => {
                onCreatedSpy();
                setOpen(false);
              }}
            />
          </IntlProvider>
        );
      }

      function submitValidOrder() {
        fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: 'Ana' } });
        fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '5351234567' } });
        fireEvent.click(screen.getByTestId('checkout-submit'));
      }

      it('abre el chat de wa.me con el código y el resumen, y avisa de que queda pendiente', async () => {
        // `window.open` no existe de verdad en jsdom: se espía para poder leer la URL.
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED_WITH_NUMBER));
        const onCreated = vi.fn();
        renderCheckout({ onCreated });

        submitValidOrder();

        await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
        const [url, target, features] = openSpy.mock.calls[0] as [string, string, string];
        // El número normalizado a dígitos: `wa.me` no entiende "+53 5-987 6543".
        expect(url).toContain('https://wa.me/5359876543?text=');
        expect(target).toBe('_blank');
        // `noopener`: la pestaña de WhatsApp es de OTRO origen y no debe poder tocar la del
        // catálogo a través de `window.opener`.
        expect(features).toBe('noopener');

        const summary = new URL(url).searchParams.get('text') ?? '';
        expect(summary).toContain('K7M2QX');
        expect(summary).toContain('2 × Camisa azul');

        expect(screen.getByTestId('checkout-whatsapp-pending')).toHaveTextContent(
          'pendiente de confirmar por WhatsApp',
        );
        // El alta se reporta igual: el resumen es un aviso, no el pedido.
        expect(onCreated).toHaveBeenCalledWith(CREATED_WITH_NUMBER);
        openSpy.mockRestore();
      });

      // `window.open` devolvió null: el navegador bloqueó la ventana (o, con `noopener`, no hay
      // handle). El enlace queda a la vista para que el pedido se pueda enviar a mano.
      it('deja el enlace a la vista cuando el navegador bloquea la ventana', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED_WITH_NUMBER));
        renderCheckout();

        submitValidOrder();

        await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
        const link = await screen.findByTestId('checkout-whatsapp-link');
        expect(link).toHaveAttribute('href', openSpy.mock.calls[0][0] as string);
        expect(link).toHaveTextContent('Abrir el chat de WhatsApp');
        openSpy.mockRestore();
      });

      // Sin número NO se abre un chat contra un destinatario vacío: el envío queda BLOQUEADO con
      // aviso y el pedido sigue guardado, que es justo lo que ve la tienda en su panel.
      it('sin número NO abre nada: el envío queda bloqueado y el pedido sigue guardado', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const createdWithoutNumber: PublicOrderCreated = { ...CREATED, whatsappNumber: null };
        serviceMock.createPublicOrder.mockResolvedValue(envelope(createdWithoutNumber));
        const onCreated = vi.fn();
        renderCheckout({ onCreated });

        submitValidOrder();

        expect(await screen.findByTestId('checkout-whatsapp-blocked')).toHaveTextContent('K7M2QX');
        expect(screen.getByTestId('checkout-whatsapp-blocked')).toHaveTextContent(
          'quedó bloqueado',
        );
        expect(openSpy).not.toHaveBeenCalled();
        expect(screen.queryByTestId('checkout-whatsapp-link')).not.toBeInTheDocument();
        expect(onCreated).toHaveBeenCalledWith(createdWithoutNumber);
        openSpy.mockRestore();
      });

      // ── F4-R3 (option B) ─────────────────────────────────────────────────────────────────
      // El resumen dice lo que el SERVIDOR persistió. Si dijera el carrito del cliente y los
      // dos difieren, el mensaje que llega al chat no cuadra con el pedido que la tienda ve en su
      // panel — y el panel es contra lo que se cruza el pedido.
      it('el resumen usa el snapshot del SERVIDOR, no el carrito del cliente', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        // El servidor persistió 90 por unidad, no los 82.50 que el carrito tiene en pantalla.
        serviceMock.createPublicOrder.mockResolvedValue(
          envelope({
            ...CREATED_WITH_NUMBER,
            lines: [{ name: 'Camisa azul', quantity: 2, price: 90 }],
            subtotal: 180,
            total: 180,
          } satisfies PublicOrderCreated),
        );
        renderCheckout();

        submitValidOrder();

        await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
        const summary = new URL(openSpy.mock.calls[0][0] as string).searchParams.get('text') ?? '';
        expect(summary).toContain(`2 × Camisa azul — ${money(180)}`);
        expect(summary).toContain(`Subtotal: ${money(180)}`);
        expect(summary).toContain(`TOTAL: ${money(180)}`);
        // El importe del carrito (2 × 82.50) NO aparece: el resumen no se arma con él.
        expect(summary).not.toContain(money(165));
        openSpy.mockRestore();
      });

      // ── F4-R1 ───────────────────────────────────────────────────────────────────────────
      // Abrir el checkout es empezar un pedido nuevo: el aviso del pedido ANTERIOR no puede
      // quedar flotando sobre el formulario del siguiente. Sin este reset, el cliente ve el
      // "pedido K7M2QX enviado" del pedido que acaba de cerrar mientras rellena OTRO.
      it('al reabrir el checkout el aviso del pedido anterior desaparece', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED_WITH_NUMBER));
        const onCreated = vi.fn();
        renderWithIntl(<ParentHarness onCreatedSpy={onCreated} />);

        submitValidOrder();

        // El padre cierra el checkout, pero el aviso sobrevive: es su confirmación.
        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        await screen.findByTestId('checkout-whatsapp-notice');
        expect(screen.queryByTestId('catalog-checkout-modal')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('parent-reopen'));

        await screen.findByTestId('catalog-checkout-modal');
        expect(screen.queryByTestId('checkout-whatsapp-notice')).not.toBeInTheDocument();
        openSpy.mockRestore();
      });

      // ── F4-R2 / R3-2 ──────────────────────────────────────────────────────────────────────
      // El aviso NO es el pedido: el pedido ya está guardado cuando se abre WhatsApp. Si un fallo
      // al abrirlo se reportara como fallo del alta, el cliente vería "no se pudo crear" sobre un
      // pedido que SÍ existe y reintentaría — y el reintento crea un duplicado. Y el fallo tiene
      // que dejar SEÑAL (R3-2): antes era indistinguible de un `window.open` que sí abrió.
      it('un fallo al abrir WhatsApp no reporta el pedido como fallido, deja señal y no impide el cierre', async () => {
        // `window.open` LANZANDO, no solo devolviendo null: es el peor caso de popup bloqueado.
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {
          throw new Error('popup bloqueado');
        });
        const warnSpy = spyOnWarn();
        serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED_WITH_NUMBER));
        const onCreated = vi.fn();
        renderCheckout({ onCreated });

        submitValidOrder();

        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        expect(onCreated).toHaveBeenCalledWith(CREATED_WITH_NUMBER);
        expect(screen.queryByTestId('checkout-error')).not.toBeInTheDocument();
        // La señal: el popup que lanzó queda registrado, con el error que lo provocó.
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('window.open'),
          expect.any(Error),
        );
        // Y el aviso (respaldo manual del popup bloqueado) se pinta igual, con su código y su
        // enlace: perderlo sería perder justo el respaldo que existe para este caso.
        expect(screen.getByTestId('checkout-whatsapp-pending')).toHaveTextContent('K7M2QX');
        expect(screen.getByTestId('checkout-whatsapp-link')).toHaveAttribute(
          'href',
          expect.stringContaining('https://wa.me/5359876543'),
        );
        openSpy.mockRestore();
        warnSpy.mockRestore();
      });

      // ── R3-1 ─────────────────────────────────────────────────────────────────────────────
      // Y el otro extremo: si lo que falla es componer el propio resumen, el pedido guardado se
      // reporta igual y solo una vez — pero el cliente NECESITA ver algo. Antes el `catch` vacío
      // lo dejaba sin handoff de WhatsApp y sin error visible, con el pedido ya en la base de
      // datos. Ahora el aviso sale con el código y en estado BLOQUEADO, que es un estado real
      // (`link: null`, el mismo que se pinta cuando la tienda no tiene número).
      it('si el resumen no se puede componer el aviso sale igual, con el código y bloqueado', async () => {
        linkSpy.throwsOnBuild = true;
        const warnSpy = spyOnWarn();
        serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED_WITH_NUMBER));
        const onCreated = vi.fn();
        renderCheckout({ onCreated });

        submitValidOrder();

        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        expect(onCreated).toHaveBeenCalledWith(CREATED_WITH_NUMBER);
        // El alta no se reporta como fallida: el pedido existe.
        expect(screen.queryByTestId('checkout-error')).not.toBeInTheDocument();
        // Pero el aviso está: sin él el cliente no sabría ni el código ni que tiene que decirlo
        // por otro medio.
        const notice = await screen.findByTestId('checkout-whatsapp-notice');
        expect(within(notice).getByTestId('checkout-whatsapp-blocked')).toHaveTextContent('K7M2QX');
        expect(within(notice).queryByTestId('checkout-whatsapp-link')).not.toBeInTheDocument();
        // Y el motivo del fallo queda registrado.
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('resumen de WhatsApp'),
          expect.any(Error),
        );
        warnSpy.mockRestore();
      });

      // El caso REAL de ese fallo: una respuesta degradada sin líneas. `created.lines.map` revienta
      // antes incluso de llegar a `buildWhatsAppOrderLink`, y para el cliente el resultado tiene que
      // ser el mismo: el pedido guardado, su código a la vista y la tienda enterada.
      it('una respuesta degradada sin líneas tampoco deja al cliente sin handoff', async () => {
        const warnSpy = spyOnWarn();
        serviceMock.createPublicOrder.mockResolvedValue(
          envelope({
            ...CREATED_WITH_NUMBER,
            lines: undefined,
          }) as unknown as ReturnType<typeof envelope<PublicOrderCreated>>,
        );
        const onCreated = vi.fn();
        renderCheckout({ onCreated });

        submitValidOrder();

        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        expect(onCreated).toHaveBeenCalledTimes(1);
        const notice = await screen.findByTestId('checkout-whatsapp-notice');
        expect(within(notice).getByTestId('checkout-whatsapp-blocked')).toHaveTextContent('K7M2QX');
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      // ── F4-R4 ───────────────────────────────────────────────────────────────────────────
      // Dónde viaja el número de la tienda es una decisión de PRIVACIDAD (T2), no de gusto: el
      // config público lo lee cualquiera que abra el catálogo. Se fija sobre las CLAVES de los
      // dos contratos, que es exactamente lo que decide esa privacidad.
      it('el número viaja en la respuesta de creación y NO en el config público', () => {
        expect(Object.keys(CONFIG)).not.toContain('whatsappNumber');
        expect(Object.keys(CREATED_WITH_NUMBER)).toContain('whatsappNumber');
        // Los importes del SERVIDOR solo se conocen al crear el pedido: el config público no los
        // lleva, así que el resumen no podría armarse sin la respuesta del alta.
        expect(Object.keys(CONFIG)).not.toContain('lines');
        expect(Object.keys(CONFIG)).not.toContain('subtotal');
        expect(Object.keys(CREATED_WITH_NUMBER)).toEqual(
          expect.arrayContaining(['lines', 'subtotal', 'total']),
        );
      });

      // ── F4-R5 ───────────────────────────────────────────────────────────────────────────
      // El padre CIERRA el checkout al recibir el pedido y abre su consulta. El aviso vive fuera
      // del modal justo para sobrevivir a ese cierre: si estuviera dentro, nunca se vería — y es
      // el único sitio donde el cliente puede reenviar el resumen.
      it('el padre cierra el checkout al recibir el pedido, una sola vez y sin perder el aviso', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED_WITH_NUMBER));
        const onCreated = vi.fn();
        renderWithIntl(<ParentHarness onCreatedSpy={onCreated} />);

        submitValidOrder();

        await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
        expect(serviceMock.createPublicOrder).toHaveBeenCalledTimes(1);

        await screen.findByTestId('checkout-whatsapp-notice');
        expect(screen.queryByTestId('catalog-checkout-modal')).not.toBeInTheDocument();
        // Un `onCreated` de más haría que el padre abriera dos veces la consulta del pedido.
        expect(onCreated).toHaveBeenCalledTimes(1);
        openSpy.mockRestore();
      });
    });
  });

  describe('estado del pedido', () => {
    function renderStatus(createdOrder: PublicOrderCreated | null = null) {
      return renderWithIntl(
        <StorefrontOrderStatus
          open
          onClose={() => undefined}
          storeSlug="mi-tienda"
          createdOrder={createdOrder}
        />,
      );
    }

    it('muestra el código del pedido recién creado', () => {
      renderStatus(CREATED);

      expect(screen.getByTestId('order-created-title')).toHaveTextContent('Pedido creado');
      expect(screen.getByTestId('order-code')).toHaveTextContent('K7M2QX');
    });

    it('busca por código y teléfono y pinta estado, pago, modalidad y líneas', async () => {
      serviceMock.getPublicOrderStatus.mockResolvedValue(envelope(STATUS));
      renderStatus();

      fireEvent.change(screen.getByTestId('order-status-code'), { target: { value: ' k7m2qx ' } });
      fireEvent.change(screen.getByTestId('order-status-phone'), { target: { value: '5351234567' } });
      fireEvent.click(screen.getByTestId('order-status-submit'));

      await waitFor(() =>
        expect(serviceMock.getPublicOrderStatus).toHaveBeenCalledWith(
          'mi-tienda',
          'k7m2qx',
          '5351234567',
        ),
      );
      // Los enums NUMÉRICOS del backend se traducen a su etiqueta.
      expect(await screen.findByTestId('order-status-state')).toHaveTextContent('En preparación');
      expect(screen.getByTestId('order-status-payment')).toHaveTextContent(
        'Pendiente de pago en la tienda',
      );
      expect(screen.getByTestId('order-status-delivery-type')).toHaveTextContent(
        'Envío a domicilio',
      );
      expect(screen.getByTestId('order-status-total')).toHaveTextContent(/165\s*CUP/);
      expect(screen.getByTestId('order-status-items')).toHaveTextContent('Camisa azul');
      expect(screen.getByTestId('order-status-code-value')).toHaveTextContent('K7M2QX');
    });

    it('el 404 uniforme se muestra como "no encontrado" sin distinguir el motivo', async () => {
      serviceMock.getPublicOrderStatus.mockRejectedValue({ response: { status: 404 } });
      renderStatus();

      fireEvent.change(screen.getByTestId('order-status-code'), { target: { value: 'K7M2QX' } });
      fireEvent.change(screen.getByTestId('order-status-phone'), { target: { value: '5351234567' } });
      fireEvent.click(screen.getByTestId('order-status-submit'));

      expect(await screen.findByTestId('order-status-error')).toHaveTextContent(
        'No encontramos ese pedido con ese teléfono.',
      );
      expect(screen.queryByTestId('order-status-state')).not.toBeInTheDocument();
    });

    // ── F3-R3 ─────────────────────────────────────────────────────────────────────────────
    // El 404 es el único veredicto del servidor sobre ESE código, y por eso solo él se pinta como
    // 'no encontrado'. Antes, TODO fallo —red caída, `500`, `429`— caía en el mismo `catch` sin
    // mirar el motivo, y le decía al cliente que su pedido no existe cuando lo que había pasado es
    // que la consulta falló. `ORDER.STATUS_FAILED` existía sin usarse para este caso.
    it.each([
      ['sin conexión', { isNetworkError: true }],
      ['con un 500 del servidor', { response: { status: 500 } }],
      ['con un 429 por límite de tasa', { response: { status: 429 } }],
    ])('un fallo %s NO se disfraza de pedido inexistente', async (_label, rejection) => {
      serviceMock.getPublicOrderStatus.mockRejectedValue(rejection);
      renderStatus();

      fireEvent.change(screen.getByTestId('order-status-code'), { target: { value: 'K7M2QX' } });
      fireEvent.change(screen.getByTestId('order-status-phone'), { target: { value: '5351234567' } });
      fireEvent.click(screen.getByTestId('order-status-submit'));

      const error = await screen.findByTestId('order-status-error');
      expect(error).toHaveTextContent('No se pudo consultar el pedido. Inténtalo de nuevo.');
      // Y no dice que no exista: eso lo haría reescribir el código en vez de reintentar.
      expect(error).not.toHaveTextContent('No encontramos ese pedido');
      expect(screen.queryByTestId('order-status-state')).not.toBeInTheDocument();
    });

    it('valida código y teléfono antes de preguntar al servidor', () => {
      renderStatus();

      fireEvent.click(screen.getByTestId('order-status-submit'));
      expect(screen.getByTestId('order-status-error')).toHaveTextContent(
        'Escribe el código del pedido.',
      );

      fireEvent.change(screen.getByTestId('order-status-code'), { target: { value: 'K7M2QX' } });
      fireEvent.click(screen.getByTestId('order-status-submit'));
      expect(screen.getByTestId('order-status-error')).toHaveTextContent(
        'Escribe el teléfono con el que hiciste el pedido.',
      );
      expect(serviceMock.getPublicOrderStatus).not.toHaveBeenCalled();
    });
  });
});
