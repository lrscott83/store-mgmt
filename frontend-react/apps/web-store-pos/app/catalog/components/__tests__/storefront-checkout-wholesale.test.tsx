import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { StorefrontCheckout } from '~/catalog/components/storefront-checkout';
import type { StorefrontCartLine } from '~/catalog/lib/storefront-cart-store';
import type {
  PublicOrderingConfig,
  PublicOrderCreated,
} from '~/sales/lib/services/catalog-http-service';

/**
 * CHECKOUT de un carrito MAYORISTA (R3-CHECKOUT-WHOLESALE-UNPROVED, S4/S5).
 *
 * El checkout es la frontera entre lo que el cliente ve y lo que el servidor cobra, y en modo
 * mayorista las dos cosas se cuentan distinto: la VISTA habla en paquetes ("3 cajas"), pero el
 * contrato del pedido sigue pidiendo UNIDADES por línea (`quantity`), y quien las convierte de
 * vuelta a paquetes y resuelve el escalón es el servidor. Mandar paquetes donde van unidades
 * multiplicaría el pedido por el tamaño del bulto y el servidor lo rechazaría.
 *
 * Estas pruebas se hacen por ROL y nombre accesible: el contrato que se fija es el que ve el
 * cliente (resumen, subtotal y los campos del formulario), no la etiqueta interna de cada nodo.
 */

const serviceMock = vi.hoisted(() => ({
  createPublicOrder: vi.fn(),
  createSalesManagerOrder: vi.fn(),
}));

vi.mock('~/sales/lib/services/catalog-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('~/sales/lib/services/catalog-http-service')
  >('~/sales/lib/services/catalog-http-service');
  return { ...actual, catalogHttpService: { ...serviceMock } };
});

const envelope = <T,>(data: T) => ({
  data,
  succeeded: true,
  message: '',
  actionCode: 200,
  errors: [],
});

const CONFIG: PublicOrderingConfig = {
  enabled: true,
  pickupEnabled: true,
  deliveryEnabled: false,
  businessHours: null,
  deliveryZones: null,
  paletteId: 'default',
  templateId: 'default',
  mobileColumns: 2,
  logoUrl: null,
  bannerUrl: null,
  pedidosWhatsAppEnabled: true,
  gestionPedidosEnabled: true,
  carouselImages: [],
  dailyImages: [],
};

/** 3 cajas × 12 unidades × 32 por unidad = 1 152. */
const CERVEZA: StorefrontCartLine = {
  productId: 'cerveza',
  name: 'Cerveza',
  currency: 'CUP',
  unitPrice: 32,
  imageUrl: null,
  quantity: 36,
  priceMode: 'Wholesale',
  packs: 3,
  packSize: 12,
  unitLabel: 'caja',
  tiers: [{ minPacks: 3, pricePerUnit: 32 }],
};

/** 1 paquete × 6 unidades × 50 por unidad = 300. */
const MALTA: StorefrontCartLine = {
  productId: 'malta',
  name: 'Malta',
  currency: 'CUP',
  unitPrice: 50,
  imageUrl: null,
  quantity: 6,
  priceMode: 'Wholesale',
  packs: 1,
  packSize: 6,
  unitLabel: 'paquete',
  tiers: [{ minPacks: 1, pricePerUnit: 50 }],
};

const CREATED: PublicOrderCreated = {
  id: 'o1',
  code: 'K7M2QX',
  subtotal: 1452,
  total: 1452,
  currency: 0,
  lines: [
    { name: 'Cerveza', quantity: 36, price: 32, packs: 3, unitLabel: 'caja' },
    { name: 'Malta', quantity: 6, price: 50, packs: 1, unitLabel: 'paquete' },
  ],
  whatsappNumber: '+53 5-123 4567',
};

function renderCheckout() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <StorefrontCheckout
        open
        onClose={() => undefined}
        storeSlug="mi-tienda"
        config={CONFIG}
        lines={[CERVEZA, MALTA]}
        onCreated={vi.fn()}
      />
    </IntlProvider>,
  );
}

function submitValidOrder() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Teléfono' }), {
    target: { value: '5351234567' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
}

describe('StorefrontCheckout — carrito mayorista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.createPublicOrder.mockResolvedValue(envelope(CREATED));
  });

  it('el resumen habla en PAQUETES con la unidad del producto', () => {
    renderCheckout();

    const dialog = within(screen.getByRole('dialog', { name: 'Confirmar pedido' }));
    // "3 cajas", no "36": el cliente compró tres cajas de cerveza y un paquete de malta.
    expect(dialog.getByText(/Cerveza × 3 cajas/)).toBeInTheDocument();
    expect(dialog.getByText(/Malta × 1 paquete/)).toBeInTheDocument();
    expect(dialog.queryByText(/36/)).not.toBeInTheDocument();
  });

  it('el subtotal sale de las líneas, en paquetes × unidades por paquete', () => {
    renderCheckout();

    const dialog = within(screen.getByRole('dialog', { name: 'Confirmar pedido' }));
    // 3 × 12 × 32 = 1 152 y 1 × 6 × 50 = 300, que suman 1 452. El separador de miles es un NBSP
    // fijo, así que se matchea con `\s` (el normalizador de testing-library lo colapsa).
    expect(dialog.getByText(/^1\s152\sCUP$/)).toBeInTheDocument();
    expect(dialog.getByText(/^300\sCUP$/)).toBeInTheDocument();
    expect(dialog.getByText(/^1\s452\sCUP$/)).toBeInTheDocument();
  });

  it('el pedido sigue viajando en UNIDADES por línea, nunca en paquetes', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderCheckout();

    submitValidOrder();

    await waitFor(() => expect(serviceMock.createPublicOrder).toHaveBeenCalledTimes(1));
    const [slug, payload] = serviceMock.createPublicOrder.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(slug).toBe('mi-tienda');
    // `quantity` = paquetes × unidades por paquete: 3 × 12 y 1 × 6. El servidor es el que vuelve a
    // contar paquetes y resuelve el precio del escalón con estas unidades.
    expect(payload['items']).toEqual([
      { productId: 'cerveza', quantity: 36 },
      { productId: 'malta', quantity: 6 },
    ]);

    openSpy.mockRestore();
  });
});
