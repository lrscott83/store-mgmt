import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const serviceMock = vi.hoisted(() => ({
  createPublicOrder: vi.fn(),
  getPublicOrderStatus: vi.fn(),
}));

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('~/sales/lib/services/catalog-http-service')
  >('~/sales/lib/services/catalog-http-service');
  return { ...actual, catalogHttpService: { ...serviceMock } };
});

const envelope = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });
const failure = { data: null, succeeded: false, message: 'x', actionCode: 404, errors: [] };

const CONFIG: PublicOrderingConfig = {
  enabled: true,
  pickupEnabled: true,
  deliveryEnabled: true,
  deliveryFee: 0,
  minimumOrderAmount: 0,
  businessHours: null,
  deliveryZones: null,
  paletteId: 'default',
  logoUrl: null,
  bannerUrl: null,
};

const LINE: StorefrontCartLine = {
  productId: 'p1',
  name: 'Camisa azul',
  currency: 'CUP',
  unitPrice: 82.5,
  imageUrl: null,
  quantity: 2,
};

const CREATED: PublicOrderCreated = { id: 'o1', code: 'K7M2QX', total: 165, currency: 0 };

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

describe('storefront cart / checkout / order status (F3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      // El subtotal del cliente NUNCA es el total del pedido: el servidor recalcula con el envío
      // y el mínimo. La vista lo dice en vez de dejar que se lea como cifra cerrada.
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
