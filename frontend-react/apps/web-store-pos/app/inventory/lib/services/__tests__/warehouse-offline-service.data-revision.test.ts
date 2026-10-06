// Movimiento 1 + 2 sobre las TRES cachés de `WarehouseOfflineService`.
//
// A diferencia del resto de servicios, este tiene tres fotos independientes
// (almacenes, existencias, movimientos) que comparten UNA puerta de escritura. Cada foto
// guarda SU PROPIA revisión — la de la última vez que se releó — y no una versión
// compartida para las tres: una foto jamás puede quedar marcada como fresca con una
// revisión que no sea la suya, que es exactamente el bug que se está corrigiendo.
//
// Se cubren las tres: WH-1/2 (existencias), WH-3/4 (almacenes), WH-5 (movimientos),
// WH-6 (el escritor no relee las cachés que él mismo escribió) y WH-6b (otra instancia
// sí invalida las tres, porque la revisión es global).
import { beforeEach, describe, expect, it } from 'vitest';
import type { Product, Warehouse } from '@store-mgmt/domain';
import { WarehouseOfflineService } from '../warehouse-offline-service';
import { InventoryOfflineService } from '../inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import {
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const storeId = 's1';

function makeProduct(id: string): Product {
  return {
    id,
    name: `Producto ${id}`,
    categoryId: 'cat-1',
    categoryName: 'Cat 1',
    price: 10,
    order: 0,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2026-01-01T00:00:00.000Z'),
    createdByName: 'test',
  } as unknown as Product;
}

function makeWarehouse(id: string, name: string): Warehouse {
  return {
    id,
    name,
    isActive: true,
    createdDate: new Date('2026-01-01T00:00:00.000Z'),
    createdByName: 'test',
  } as unknown as Warehouse;
}

/** Producto + categoría reales, porque `recordMovement` exige que el producto exista. */
function seedCatalog(): string {
  const productId = 'p1';
  const product = makeProduct(productId);
  localStorage.setItem(
    `lizoft.store-products-${storeId}`,
    JSON.stringify([[productId, product]]),
  );
  localStorage.setItem(
    `lizoft.store-product-categories-${storeId}`,
    JSON.stringify([['cat-1', { id: 'cat-1', name: 'Cat 1', order: 0, isActive: true }]]),
  );
  return productId;
}

function svc(): WarehouseOfflineService {
  const productRepository = new ProductRepository(storeId, new ProductCategoryRepository(storeId));
  return new WarehouseOfflineService(storeId, productRepository, new InventoryOfflineService(storeId, productRepository));
}

/** Compra inicial: crea el almacén, lo stockea y deja existencias reales. */
function seedWarehouseWithStock(productId: string, quantity: number): string {
  const writer = svc();
  const warehouse = writer.createWarehouse('Almacen Central').data!;
  writer.recordMovement({
    warehouseId: warehouse.id,
    productId,
    type: 'purchase_in',
    quantity,
    costPrice: 5,
  });
  return warehouse.id;
}

function onHand(service: WarehouseOfflineService, warehouseId: string, productId: string): number {
  return service.getStockLevel(warehouseId, productId)?.onHand ?? -1;
}

describe('WarehouseOfflineService — invalidación por revisión en sus TRES cachés', () => {
  let productId: string;
  let warehouseId: string;

  beforeEach(async () => {
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    productId = seedCatalog();
    warehouseId = seedWarehouseWithStock(productId, 10);
    // El seeding ya avisó varias veces: se reinicia la revisión para partir de 0.
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
  });

  it('WH-1: existencias — otra instancia escribe → tras vaciar la cola, A lee el dato NUEVO', async () => {
    const a = svc();
    expect(onHand(a, warehouseId, productId)).toBe(10);

    // B registra una compra desde la pantalla de movimientos.
    svc().recordMovement({
      warehouseId,
      productId,
      type: 'purchase_in',
      quantity: 5,
      costPrice: 5,
    });
    await flushDataChangeNotifications();

    expect(onHand(a, warehouseId, productId)).toBe(15);
  });

  it('WH-2: existencias — control, sin escritura A sigue con su foto', () => {
    const a = svc();
    expect(onHand(a, warehouseId, productId)).toBe(10);

    // Escritura directa al almacenamiento, sin pasar por la puerta que avisa: las
    // existencias se guardan como array plano, no como entradas de Map.
    const levels = JSON.parse(
      localStorage.getItem(`lizoft.store-warehouse-stock-levels-${storeId}`)!,
    ) as { onHand: number }[];
    levels[0].onHand = 999;
    localStorage.setItem(
      `lizoft.store-warehouse-stock-levels-${storeId}`,
      JSON.stringify(levels),
    );
    a.getStorageStockLevels();

    expect(onHand(a, warehouseId, productId)).toBe(10);
  });

  it('WH-3: almacenes — otra instancia renombra → tras vaciar la cola, A lee el NUEVO', async () => {
    const a = svc();
    expect(a.getWarehouseById(warehouseId)!.name).toBe('Almacen Central');

    svc().updateWarehouse(warehouseId, 'Almacen Norte');
    await flushDataChangeNotifications();

    expect(a.getWarehouseById(warehouseId)!.name).toBe('Almacen Norte');
  });

  it('WH-4: almacenes — el alta de otra instancia aparece tras vaciar la cola', async () => {
    const a = svc();
    expect(a.getStorageWarehouses()).toHaveLength(1);

    svc().createWarehouse('Sucursal Sur');
    await flushDataChangeNotifications();

    expect(a.getStorageWarehouses()).toHaveLength(2);
    expect(a.getStorageWarehouses().some((w) => w.name === 'Sucursal Sur')).toBe(true);
  });

  it('WH-5: movimientos — otra instancia registra una salida → A ve la fila nueva', async () => {
    const a = svc();
    expect(a.getMovements(warehouseId)).toHaveLength(1);

    svc().recordMovement({
      warehouseId,
      productId,
      type: 'purchase_in',
      quantity: 4,
      costPrice: 6,
    });
    await flushDataChangeNotifications();

    expect(a.getMovements(warehouseId)).toHaveLength(2);
    // Y su efecto sobre existencias también llega por la misma puerta, en la misma ráfaga.
    expect(onHand(a, warehouseId, productId)).toBe(14);
  });

  it('WH-6: el escritor NO relee las cachés que él mismo escribió', async () => {
    const a = svc();
    // Se leen las tres antes, para que ninguna esté en auto-init (que escribiría).
    const warehousesBefore = a.getStorageWarehouses();
    const levelsBefore = a.getStorageStockLevels();
    const movementsBefore = a.getStorageMovements();
    expect(onHand(a, warehouseId, productId)).toBe(10);

    a.recordMovement({
      warehouseId,
      productId,
      type: 'purchase_in',
      quantity: 1,
      costPrice: 5,
    });
    await flushDataChangeNotifications();

    // `recordMovement` escribió existencias y movimientos; el escritor sella con la
    // revisión las DOS que tocó, así que no se relee a sí mismo: sigue sirviendo el
    // array que ya tenía en memoria, que además es MÁS fiel que lo que volvería del
    // almacenamiento (la reviving de fechas no revive `createdDate`).
    expect(a.getStorageStockLevels()).toBe(levelsBefore);
    expect(a.getStorageMovements()).toBe(movementsBefore);
    expect(onHand(a, warehouseId, productId)).toBe(11);

    // La de almacenes NO se selló —nadie la escribió—, así que la subida global sí la
    // invalida. Y eso está bien: releer de más es correcto; lo que sería un defecto es
    // releer de menos. Lo que se fija es que su contenido sigue siendo la verdad.
    expect(a.getStorageWarehouses()).not.toBe(warehousesBefore);
    expect(a.getStorageWarehouses()).toHaveLength(1);
    expect(a.getStorageWarehouses()[0].name).toBe('Almacen Central');
  });

  it('WH-6b: otra instancia sí invalida las TRES (la revisión es global), y las tres quedan bien', async () => {
    const a = svc();
    expect(a.getStorageWarehouses()).toHaveLength(1);
    expect(a.getStorageMovements()).toHaveLength(1);
    expect(onHand(a, warehouseId, productId)).toBe(10);

    // Otra instancia escribe solo existencias y movimientos. La revisión no dice QUÉ
    // cambió, solo que algo cambió, así que el LECTOR recarga sus tres fotos: es
    // deliberadamente conservador, y re-leer de más es correcto mientras re-leer de
    // menos es justo el defecto que estamos corrigiendo.
    svc().recordMovement({
      warehouseId,
      productId,
      type: 'purchase_in',
      quantity: 1,
      costPrice: 5,
    });
    await flushDataChangeNotifications();

    expect(onHand(a, warehouseId, productId)).toBe(11);
    expect(a.getStorageMovements()).toHaveLength(2);
    expect(a.getStorageWarehouses()).toHaveLength(1);
    expect(a.getStorageWarehouses()[0].name).toBe('Almacen Central');
  });

  it('WH-7: una ráfaga de movimientos produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const b = svc();
    for (let i = 0; i < 10; i += 1) {
      b.recordMovement({ warehouseId, productId, type: 'purchase_in', quantity: 1, costPrice: 5 });
    }

    await flushDataChangeNotifications();

    // 10 movimientos = 10 escrituras de niveles + 10 de movimientos = 20 setItem, y
    // aun así un suscriptor observa UN solo cambio.
    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });

  it('WH-8: la escritura de auto-inicialización de las TRES cachés NO dispara notificación', async () => {
    // Arranque en frío de una tienda genuinamente vacía: cada uno de los tres getters
    // de auto-init siembra su caché vacía en el almacenamiento. Ninguna de esas tres
    // escrituras es un cambio de datos — no había nada que alguien pudiera tener viejo —
    // así que ninguna puede subir la revisión: hacerlo invalidaría las fotos que el
    // propio auto-init acaba de llenar y duplicaría el descifrado en cada instancia en
    // frío de cada servicio.
    const WAREHOUSES_KEY = `lizoft.store-warehouses-${storeId}`;
    const LEVELS_KEY = `lizoft.store-warehouse-stock-levels-${storeId}`;
    const MOVEMENTS_KEY = `lizoft.store-warehouse-stock-movements-${storeId}`;
    localStorage.clear();
    expect(localStorage.getItem(WAREHOUSES_KEY)).toBeNull();
    expect(localStorage.getItem(LEVELS_KEY)).toBeNull();
    expect(localStorage.getItem(MOVEMENTS_KEY)).toBeNull();

    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const cold = svc();
    expect(cold.getStorageWarehouses()).toHaveLength(0);
    expect(cold.getStorageStockLevels()).toHaveLength(0);
    expect(cold.getStorageMovements()).toHaveLength(0);
    await flushDataChangeNotifications();

    expect(seen).toEqual([]);
    expect(useDataRevisionStore.getState().revision).toBe(0);
    // Y los tres auto-init sí sembraron: ninguna caché queda "ausente" para las demás.
    expect(localStorage.getItem(WAREHOUSES_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEVELS_KEY)).not.toBeNull();
    expect(localStorage.getItem(MOVEMENTS_KEY)).not.toBeNull();

    unsubscribe();
  });
});
