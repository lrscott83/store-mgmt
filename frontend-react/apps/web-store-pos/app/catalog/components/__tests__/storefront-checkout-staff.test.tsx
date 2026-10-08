import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { StorefrontCheckout } from '~/catalog/components/storefront-checkout';
import type { StorefrontCartLine } from '~/catalog/lib/storefront-cart-store';
import type {
  PublicOrderingConfig,
  PublicOrderCreated,
} from '~/sales/lib/services/catalog-http-service';
import { PublicOrderDeliveryType } from '~/sales/lib/services/catalog-http-service';

const serviceMock = vi.hoisted(() => ({ createPublicOrder: vi.fn() }));

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('~/sales/lib/services/catalog-http-service')
  >('~/sales/lib/services/catalog-http-service');
  return { ...actual, catalogHttpService: { ...serviceMock } };
});

const envelope = <T,>(data: T) => ({ data, succeeded: true, message: '', actionCode: 200, errors: [] });

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

/** Con número, porque un staff de la tienda tampoco deja de tener número: no es lo que lo exime. */
const CREATED: PublicOrderCreated = { id: 'o1', code: 'K7M2QX', total: 165, currency: 0 };

function renderCheckout(overrides: Partial<React.ComponentProps<typeof StorefrontCheckout>> = {}) {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <StorefrontCheckout
        open
        onClose={() => undefined}
        storeSlug="mi-tienda"
        config={CONFIG}
        lines={[LINE]}
        onCreated={vi.fn()}
        {...overrides}
      />
    </IntlProvider>,
  );
}

function submitValidOrder() {
  fireEvent.change(screen.getByTestId('checkout-name'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByTestId('checkout-phone'), { target: { value: '5351234567' } });
  fireEvent.click(screen.getByTestId('checkout-submit'));
}

describe('StorefrontCheckout en modo staff (sin WhatsApp)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED));
  });

  it('el botón dice "Registrar pedido", no "Enviar pedido"', () => {
    renderCheckout({ staffMode: true });

    // La diferencia se lee ANTES de hacer nada: no se anuncia un envío que no va a ocurrir.
    expect(screen.getByTestId('checkout-submit')).toHaveTextContent('Registrar pedido');
    expect(screen.getByTestId('checkout-submit')).not.toHaveTextContent('Enviar pedido');
  });

  it('sin modo staff el botón sigue diciendo "Enviar pedido"', () => {
    // El cliente anónimo no ve este texto nuevo: su flujo es el de siempre.
    renderCheckout();

    expect(screen.getByTestId('checkout-submit')).toHaveTextContent('Enviar pedido');
  });

  it('tras el alta NO abre wa.me ni muestra el aviso, y sí reporta el pedido creado', async () => {
    // `window.open` no existe de verdad en jsdom: se espía para poder afirmar que NO se llama.
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onCreated = vi.fn();
    renderCheckout({ staffMode: true, onCreated });

    submitValidOrder();

    // El alta es la misma llamada con los mismos campos que en el flujo de WhatsApp (D3): aquí
    // lo que se omite es únicamente el envío.
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
      items: [{ productId: 'p1', quantity: 2 }],
    });

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED));
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('checkout-whatsapp-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('checkout-whatsapp-link')).not.toBeInTheDocument();
    openSpy.mockRestore();
  });

  it('ni siquiera sin número de WhatsApp hay aviso: en modo staff no hay envío que avisar', async () => {
    // Sin número, el flujo normal enseña "envío bloqueado". En modo staff ese aviso sería un
    // ERROR de una cosa que no se intenta hacer.
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    serviceMock.createPublicOrder.mockResolvedValue(
      envelope({ ...CREATED, whatsappNumber: null } satisfies PublicOrderCreated),
    );
    const onCreated = vi.fn();
    renderCheckout({ staffMode: true, onCreated });

    submitValidOrder();

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.queryByTestId('checkout-whatsapp-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('checkout-whatsapp-blocked')).not.toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('un fallo del servidor se sigue mostrando igual en modo staff', async () => {
    // Quitar WhatsApp no puede convertirse en un fallo silencioso: el alta que no ocurrió dice lo
    // mismo que siempre, y el formulario no se pierde.
    serviceMock.createPublicOrder.mockResolvedValue({
      data: null,
      succeeded: false,
      message: 'x',
      actionCode: 500,
      errors: [],
    });
    const onCreated = vi.fn();
    renderCheckout({ staffMode: true, onCreated });

    submitValidOrder();

    expect(await screen.findByTestId('checkout-error')).toHaveTextContent('No se pudo crear el pedido.');
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('checkout-name')).toHaveValue('Ana');
  });

  it('la validación en cliente sigue igual en modo staff', () => {
    // Mismo formulario, mismos pasos: el modo staff no relaja nada de lo que ya se exigía.
    renderCheckout({ staffMode: true });

    fireEvent.click(screen.getByTestId('checkout-submit'));

    expect(screen.getByTestId('checkout-error')).toHaveTextContent('Escribe tu nombre.');
    expect(serviceMock.createPublicOrder).not.toHaveBeenCalled();
  });
});