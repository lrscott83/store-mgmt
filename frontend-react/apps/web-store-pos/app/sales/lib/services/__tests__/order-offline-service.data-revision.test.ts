// Movimiento 1 + 2 sobre la caché de ventas (`OrderOfflineService`).
//
// Caso especial: esta clase YA notificaba, pero solo desde `createOrder`, y solo por la
// venta — `updateTodayOrder`, `activateOrder`/`deactivateOrder`, los imports y la
// propagación de costos escribían en silencio. `setOrdersLocalStorage` es el ÚNICO
// `localStorage.setItem` de la clase, así que el aviso va ahí y "escribir sin avisar" deja
// de ser posible por disciplina.
//
// Y aquí está el choque que hay que resolver sin romper el `bumpDataRevision()` existente:
// `createOrder` escribe (avisa, agrupado) y LUEGO llama a `bumpDataRevision()` porque
// además descontó existencias. Sin más, una venta costaría DOS revisiones y cada vista
// suscrita recalcularía dos veces por la misma venta. OR-4 fija que cuesta una sola.
//
// El constructor de `OrderOfflineService` construye servicios reales de créditos e
// inventario; se aíslan con mocks mínimos (misma estrategia que el test del store) porque
// lo que se prueba aquí es la invalidación de la caché de VENTAS, no la de sus
// dependencias.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Currency, OrderType, PaymentType, SalePaymentMethod } from '@store-mgmt/domain';
import type { Order } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import type { Product } from '@store-mgmt/domain';

vi.mock('~/inventory/lib/services/inventory-offline-service', () => ({
  InventoryOfflineService: vi.fn().mockImplementation(() => ({
    getAvailableInventoryCosts: vi.fn().mockReturnValue([]),
    increaseQuantitiesByOrderItems: vi.fn().mockReturnValue({ succeeded: true }),
  })),
}));

vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({
    createSaleCredit: vi.fn(),
    deactivateSaleCreditByOrderId: vi.fn().mockReturnValue({ succeeded: true }),
  })),
}));

vi.mock('~/sales/lib/repositories/product-category-repository', () => ({
  ProductCategoryRepository: vi.fn().mockImplementation(() => ({
    getProductCategories: vi.fn().mockReturnValue([]),
  })),
}));

import { OrderOfflineService } from '../order-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import {
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const storeId = 's1';
const STORAGE_KEY = `lizoft.store-orders-${storeId}`;

function makeOrder(id: string, total: number): Order {
  return {
    id,
    orderItems: [],
    total,
    itemsCount: 1,
    date: new Date('2026-01-15T10:00:00.000Z'),
    type: OrderType.Normal,
    paymentType: PaymentType.Efectivo,
    isCredit: false,
    description: '',
    isActive: true,
    currency: Currency.CUP,
    salePaymentMethod: SalePaymentMethod.Efectivo,
    percent: 0,
    tax: 0,
    createdDate: new Date('2026-01-15T10:00:00.000Z'),
    createdByName: 'test',
  } as unknown as Order;
}

function seed(...orders: Order[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function svc(): OrderOfflineService {
  return new OrderOfflineService(storeId);
}

function totalsOf(service: OrderOfflineService): number {
  return service.getStorageOrders().reduce((sum, o) => sum + o.total, 0);
}

function makeCartItems(): CartItem[] {
  return [
    {
      product: {
        id: 'p1',
        name: 'Cerveza',
        categoryId: 'cat-1',
        categoryName: 'Cat 1',
        price: 100,
        order: 0,
        availableToSale: true,
        discountFromInvantory: false,
        businessId: 'biz-1',
        isActive: true,
        createdDate: new Date(),
        createdByName: 'test',
        currency: Currency.CUP,
      } as unknown as Product,
      quantity: 2,
      price: 100,
    },
  ];
}

describe('OrderOfflineService — invalidación por revisión y aviso en la escritura', () => {
  beforeEach(async () => {
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    seed(makeOrder('o1', 100));
  });

  it('OR-1: otra instancia registra una venta → tras vaciar la cola, A lee el dato NUEVO', async () => {
    const a = svc();
    expect(totalsOf(a)).toBe(100);

    // B registra la venta desde el carrito global.
    await svc().createOrder(
      makeCartItems(),
      OrderType.Normal,
      false,
      PaymentType.Efectivo,
      undefined,
      '',
      SalePaymentMethod.Efectivo,
    );
    await flushDataChangeNotifications();

    // A no se pidio sus datos a B: relee porque la revisión cambió.
    expect(totalsOf(a)).toBe(300);
    expect(a.getStorageOrders()).toHaveLength(2);
  });

  it('OR-2: control — sin escritura, A sigue con su foto (si no, OR-1 no probaría nada)', () => {
    const a = svc();
    expect(totalsOf(a)).toBe(100);

    // Escritura directa al almacenamiento, sin pasar por la puerta que avisa.
    seed(makeOrder('o1', 100), makeOrder('o2', 500));
    a.getStorageOrders();

    expect(totalsOf(a)).toBe(100);
    expect(a.getStorageOrders()).toHaveLength(1);
  });

  it('OR-3: una escritura que NO es createOrder también avisa (esa es la puerta única)', async () => {
    const a = svc();
    expect(totalsOf(a)).toBe(100);

    // `updateTodayOrder` nunca llamó a bumpDataRevision() antes de este trabajo: la venta
    // quedaba muda y el "Cuadre del día" seguía con el total viejo.
    svc().updateTodayOrder('o1', PaymentType.Tarjeta);
    await flushDataChangeNotifications();

    expect(a.getOrderById('o1')).toBeDefined();
    expect(a.getStorageOrders()).toHaveLength(1);

    // Y lo mismo por la vía de importación, la otra puerta que antes escribía en silencio.
    svc().addImportedOrder(makeOrder('o3', 7));
    await flushDataChangeNotifications();
    expect(a.getStorageOrders()).toHaveLength(2);
  });

  it('OR-4: una venta cuesta UNA sola revisión, no dos', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    await svc().createOrder(
      makeCartItems(),
      OrderType.Normal,
      false,
      PaymentType.Efectivo,
      undefined,
      '',
      SalePaymentMethod.Efectivo,
    );
    await flushDataChangeNotifications();

    // La venta escribe órdenes (aviso agrupado) Y además descuenta existencias, de ahí el
    // bump inmediato. El aviso agrupado debe retirarse ante ese bump: dos revisiones
    // obligarían a cada vista suscrita a recalcular dos veces por la MISMA venta.
    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });

  it('OR-5: una ráfaga de escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const b = svc();
    for (let i = 0; i < 10; i += 1) b.addImportedOrder(makeOrder(`o${i}`, 1));

    await flushDataChangeNotifications();

    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);
    expect(b.getStorageOrders()).toHaveLength(11);

    unsubscribe();
  });

  it('OR-6: una venta cuesta UNA revisión aunque el crédito nunca asiente', async () => {
    // El colaborador de créditos devuelve una promesa que NUNCA asienta. El bump de la
    // venta pertenece al límite de la mutación, no al asentamiento de las promesas de sus
    // colaboradores: si una refactorización futura moviera el bump detrás de ese `await`,
    // esta venta no subiría la revisión (o el test colgaría).
    const creditCtor = vi.mocked(SaleCreditOfflineService);
    const neverSettles = new Promise<never>(() => {});
    creditCtor.mockImplementationOnce(
      () =>
        ({
          createSaleCredit: vi.fn().mockReturnValue(neverSettles),
          deactivateSaleCreditByOrderId: vi.fn().mockReturnValue({ succeeded: true }),
        }) as unknown as SaleCreditOfflineService,
    );

    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    await svc().createOrder(
      makeCartItems(),
      OrderType.Normal,
      true,
      PaymentType.Efectivo,
      undefined,
      'Cliente',
      SalePaymentMethod.Efectivo,
    );
    await flushDataChangeNotifications();

    // La promesa pendiente Sí quedó cableada y Sí se invocó: el pin no puede pasar con un
    // doble por defecto que resolviera al instante.
    const createdCredit = creditCtor.mock.results.at(-1)!.value as {
      createSaleCredit: ReturnType<typeof vi.fn>;
    };
    expect(createdCredit.createSaleCredit).toHaveBeenCalledTimes(1);
    expect(createdCredit.createSaleCredit.mock.results[0].value).toBe(neverSettles);

    // Una sola venta: la escritura de órdenes (aviso agrupado) y el bump inmediato del
    // descuento de existencias se funden en UNA notificación observable.
    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });

  it('OR-7: N ventas consecutivas producen exactamente N revisiones', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    for (let i = 0; i < 5; i += 1) {
      await svc().createOrder(
        makeCartItems(),
        OrderType.Normal,
        false,
        PaymentType.Efectivo,
        undefined,
        '',
        SalePaymentMethod.Efectivo,
      );
    }
    await flushDataChangeNotifications();

    // Cada venta avisa de forma inmediata e independiente: ni se pierde ninguna (menos de
    // N) ni se duplica (más de N).
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(useDataRevisionStore.getState().revision).toBe(5);

    unsubscribe();
  });
});
