import { beforeEach, describe, expect, it } from 'vitest';
import {
  Currency,
  DEFAULT_CURRENCY,
  DEFAULT_PAYMENT_PRICING,
  OrderType,
  PaymentType,
  SalePaymentMethod,
} from '@store-mgmt/domain';
import type { Order, Product, SaleCredit, UserModel } from '@store-mgmt/domain';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

/**
 * INTEGRACIÓN (servicios + repositorios REALES sobre `localStorage`, sin mocks, sin render,
 * sin navegador, sin E2E).
 *
 * Cubre el camino de escritura de una venta a crédito: `OrderOfflineService.createOrder` crea el
 * crédito a través del `SaleCreditOfflineService` que él mismo instancia, y acá se verifica lo que
 * QUEDA en el dispositivo — la fila persistida — leída por una instancia NUEVA del servicio (que
 * relee `localStorage`), no el objeto devuelto en memoria.
 *
 * Por qué esta prueba existe y las unitarias no alcanzaban: la suite unitaria de
 * `order-offline-service` MOCKEA el `SaleCreditOfflineService` (una sola línea de código:
 * `createSaleCredit: vi.fn()`). Un mock de ese tipo devuelve un crédito que el test arma a mano,
 * así que estructuralmente NO puede observar qué moneda ni qué monto recibe el crédito real: la
 * prueba reproducía un mundo que `createOrder` nunca produjo. Acá las dos piezas son las de
 * producción, sin sustituto.
 *
 * Los tres hechos que se vigilan:
 *   - la MONEDA del crédito es la de la venta (el producto del carrito), no un CUP fijo;
 *   - el MONTO del crédito es el total de la venta, con pricing aplicado — no el total sin pricing;
 *   - una venta CUP (o un producto sin moneda) sigue cayendo en el default CUP.
 *
 * Lo que NO se prueba aquí (y por eso ningún E2E existente se toca): el render de la vista de
 * créditos, los modales de Editar/Pagar ni el envío al backend real.
 */

const STORE_ID = 'store-credit-currency-1';
const CLIENT = 'Ana Perez';

/** Vendedor sin módulo de inventario: la tasa de inventario no participa y el total no se altera. */
function makeUser(): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: STORE_ID,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
  };
}

/** Producto de catálogo. `currency` omitido a propósito ⇒ la venta cae en el default. */
function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Coca Cola',
    barcode: '123',
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    price: 100,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz1',
    isActive: true,
    createdDate: new Date(),
    createdByName: 'test',
    ...overrides,
  };
}

function cartOf(product: Product, quantity = 1): CartItem[] {
  return [{ product, quantity }];
}

/** Registra la venta a crédito con los servicios reales y devuelve la orden persistida. */
async function createCreditSale(
  cartItems: CartItem[],
  salePaymentMethod: SalePaymentMethod,
): Promise<Order> {
  const response = await new OrderOfflineService(STORE_ID).createOrder(
    cartItems,
    OrderType.Normal,
    true,
    PaymentType.Efectivo,
    '',
    CLIENT,
    salePaymentMethod,
  );
  if (!response.succeeded) throw new Error('expected succeeded order response');
  // Se relee de `localStorage` con una instancia nueva: lo que se asevera es lo persistido.
  const [stored] = new OrderOfflineService(STORE_ID).getStorageOrders();
  return stored ?? (response.data as Order);
}

/** El crédito tal como queda en el dispositivo (instancia nueva ⇒ relee `localStorage`). */
function storedCredits(): SaleCredit[] {
  return new SaleCreditOfflineService(STORE_ID).getStorageSaleCredits();
}

describe('venta a crédito — moneda y monto del crédito (servicios + repositorios reales)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser(), isAuthenticated: true });
  });

  it('una venta a crédito en USD deja el crédito en USD (la moneda del producto del carrito)', async () => {
    const order = await createCreditSale(
      cartOf(makeProduct({ currency: Currency.USD })),
      SalePaymentMethod.Efectivo,
    );

    // La orden ya sale bien desde antes del arreglo: fija la precondición del defecto binario.
    expect(order.currency).toBe(Currency.USD);

    const credits = storedCredits();
    expect(credits).toHaveLength(1);
    expect(credits[0]!.currency).toBe(Currency.USD);
    expect(credits[0]!.orderId).toBe(order.id);
  });

  it('el monto del crédito es el total de la venta, con pricing aplicado (no el total sin pricing)', async () => {
    // 100 USD de línea + 10% + 1 de impuesto fijo ⇒ total persistido 111.
    // `DEFAULT_PAYMENT_PRICING` arranca vacía (todo 0/0), así que se registra una combinación
    // real para que la igualdad de montos NO sea vacía. Se borra al terminar.
    const pricingKey = `${Number(Currency.USD)}|${SalePaymentMethod.Zelle}`;
    DEFAULT_PAYMENT_PRICING[pricingKey] = { percent: 10, tax: 1 };

    try {
      const order = await createCreditSale(
        cartOf(makeProduct({ currency: Currency.USD })),
        SalePaymentMethod.Zelle,
      );

      // El pricing entró, así que se aplicó: sin esto la igualdad de abajo probaría poco.
      expect(order.percent).toBe(10);
      expect(order.tax).toBe(1);
      expect(order.total).toBe(111);

      const [credit] = storedCredits();
      expect(credit!.total).toBe(order.total);
    } finally {
      delete DEFAULT_PAYMENT_PRICING[pricingKey];
    }
  });

  it('una venta a crédito CUP (producto sin moneda) deja el crédito en CUP', async () => {
    const order = await createCreditSale(cartOf(makeProduct()), SalePaymentMethod.Efectivo);

    expect(order.currency).toBe(DEFAULT_CURRENCY);

    const [credit] = storedCredits();
    expect(credit!.currency).toBe(Currency.CUP);
  });
});
