// Invalidación de la caché por instancia de `InventoryOfflineService` cuando cambia la
// revisión global de datos (`useDataRevisionStore`).
//
// El defecto: `getStorageInventoriesMap()` solo recargaba cuando el mapa estaba vacío o
// cambiaba la llave de tienda. Una venta registrada desde el carrito global descuenta el
// stock con OTRA instancia del servicio y luego dispara `bumpDataRevision()`, así que la
// instancia montada en la vista seguía sirviendo su snapshot viejo.
//
// - Movimiento 2: la foto guarda la revisión con la que se hizo (DR-*).
// - Movimiento 1: `setInventoriesLocalStorage` es el ÚNICO `localStorage.setItem` de la
//   clase — las 13 llamadas de escritura (descuento FIFO, reposición por líneas de venta,
//   alta/edición/borrado lógico/movimiento de entrada, marcas de origen de almacén y los
//   dos caminos de importación CSV) y el auto-init de la lectura pasan por ahí — y avisa,
//   agrupado por ráfaga (IV-*).
import { beforeEach, describe, expect, it } from 'vitest';
import { InventoryOfflineService } from '../inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import {
  bumpDataRevision,
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import type { InventoryEntry, Product, UserModel } from '@store-mgmt/domain';

const storeId = 's1';
const INVENTORY_STORAGE_KEY = `lizoft.store-inventory-entries-${storeId}`;

function makeProduct(id: string): Product {
  return {
    id,
    name: `Product ${id}`,
    categoryId: 'cat-1',
    categoryName: 'Cat 1',
    price: 10,
    order: 0,
    availableToSale: true,
    discountFromInvantory: true,
    businessId: '',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    createdByName: 'test',
  };
}

function makeEntry(id: string, productId: string, available: number): InventoryEntry {
  return {
    id,
    productId,
    categoryId: 'cat-1',
    quantity: available,
    available,
    costPrice: 2.5,
    date: new Date('2024-01-15T10:00:00.000Z'),
    order: 0,
    isActive: true,
    createdDate: new Date('2024-01-15T10:00:00.000Z'),
    createdByName: 'test',
  };
}

function seedProducts(products: Product[]): void {
  const entries = products.map((p) => [p.id, p] as [string, Product]);
  localStorage.setItem(`lizoft.store-products-${storeId}`, JSON.stringify(entries));
}

function seedInventory(map: Map<string, InventoryEntry[]>): void {
  localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(Array.from(map.entries())));
}

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
    selectedStoreId: storeId,
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
  } as unknown as UserModel;
}

function makeService(): InventoryOfflineService {
  return new InventoryOfflineService(
    storeId,
    new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
  );
}

/** Available stock de `p1` tal como lo lee ESTA instancia concreta. */
function availableFrom(service: InventoryOfflineService): number {
  return service.getProductInventoriesByProductId('p1')[0].available;
}

/** Available stock TOTAL de `p1` sumando todas sus entradas, tal como lo lee ESTA instancia. */
function totalAvailableFrom(service: InventoryOfflineService): number {
  return service
    .getProductInventoriesByProductId('p1')
    .filter((e) => e.isActive)
    .reduce((sum, e) => sum + e.available, 0);
}

/** Otra instancia escribe el stock descontado, igual que hace `OrderOfflineService`. */
function writeDeductedStockByOtherInstance(available: number): void {
  const writer = makeService();
  const map = writer.getStorageInventoriesMap();
  map.set('p1', [makeEntry('e1', 'p1', available)]);
  writer['setInventoriesLocalStorage'](map);
}

describe('InventoryOfflineService — invalidación de caché por revisión de datos', () => {
  beforeEach(async () => {
    // Drena la cola antes de reiniciar: el flag de agrupado es de módulo y un
    // `setState` a ciegas lo dejaría desincronizado con la revisión.
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    useAuthStore.setState({
      user: makeUser(),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    seedProducts([makeProduct('p1')]);
    seedInventory(new Map([['p1', [makeEntry('e1', 'p1', 10)]]]));
  });

  it('DR-1: tras un bumpDataRevision() la instancia con caché caliente lee el stock nuevo', () => {
    const service = makeService();

    // La caché se calienta con el estado viejo: 10 unidades.
    expect(availableFrom(service)).toBe(10);

    // Otra instancia descuenta el stock y notifica el cambio.
    writeDeductedStockByOtherInstance(8);
    bumpDataRevision();

    // La MISMA instancia debe volver a leer: ya no vale su snapshot.
    expect(availableFrom(service)).toBe(8);
  });

  it('DR-2: control — sin bumpDataRevision() la instancia sigue sirviendo su snapshot viejo', () => {
    const service = makeService();

    expect(availableFrom(service)).toBe(10);

    // Misma escritura en el almacenamiento, sin la notificación.
    writeDeductedStockByOtherInstance(8);

    // Sin bump la caché sigue viva: esto es exactamente el defecto que la revisión
    // corrige, y prueba que DR-1 pasa POR el bump y no por otra cosa.
    expect(availableFrom(service)).toBe(10);

    // Y al bumpear sí converge.
    bumpDataRevision();
    expect(availableFrom(service)).toBe(8);
  });

  it('DR-3: getStorageInventoriesMap() también recarga el mapa crudo tras el bump', () => {
    const service = makeService();

    expect(service.getStorageInventoriesMap().get('p1')).toHaveLength(1);
    expect(service.getStorageInventoriesMap().get('p1')![0].available).toBe(10);

    writeDeductedStockByOtherInstance(8);
    bumpDataRevision();

    expect(service.getStorageInventoriesMap().get('p1')![0].available).toBe(8);
  });

  it('DR-4: una instancia nueva sin caché previa también ve el stock nuevo', () => {
    writeDeductedStockByOtherInstance(8);
    bumpDataRevision();

    expect(availableFrom(makeService())).toBe(8);
  });

  // ─── Movimiento 1: aviso en la puerta de escritura ──────────────────────

  it('IV-1: otra instancia da de alta una entrada → tras vaciar la cola, A lee el dato NUEVO', async () => {
    const a = makeService();
    // A calienta su foto: una sola entrada de 10 unidades.
    expect(a.getProductInventoriesByProductId('p1')).toHaveLength(1);

    // B (otra pantalla, con su propia instancia) registra una entrada nueva.
    const b = makeService();
    expect(b.createInventoryEntry('p1', 4, 2)).not.toBeNull();
    await flushDataChangeNotifications();

    // A NO pide nada a B: relee el almacenamiento porque la revisión cambió.
    expect(a.getProductInventoriesByProductId('p1')).toHaveLength(2);
    expect(totalAvailableFrom(a)).toBe(14);
  });

  it('IV-2: control — sin escritura, A sigue con su foto (si no, IV-1 no probaría nada)', () => {
    const a = makeService();
    expect(availableFrom(a)).toBe(10);

    // Escritura directa al almacenamiento, SIN pasar por la puerta que avisa: es
    // exactamente el defecto que el aviso corrige.
    seedInventory(new Map([['p1', [makeEntry('e1', 'p1', 99)]]]));
    a.getStorageInventoriesMap();

    expect(availableFrom(a)).toBe(10);
  });

  it('IV-3: el descuento FIFO de otra instancia se refleja sin volver a montar', async () => {
    // El caso de producción: la venta descuenta stock desde el carrito global con
    // su propia instancia mientras el panel de existencias sigue montado.
    const a = makeService();
    expect(a.getAvailableQuantity('p1').available).toBe(10);

    const costs = makeService().getAvailableInventoryCosts('p1', 3);
    expect(costs).toHaveLength(1);
    await flushDataChangeNotifications();

    expect(a.getAvailableQuantity('p1').available).toBe(7);
  });

  it('IV-4: la escritura de auto-inicialización NO dispara notificación', async () => {
    // Lectura en frío de una tienda genuinamente vacía: el servicio siembra un mapa
    // vacío en el almacenamiento. Eso NO es un cambio de datos — no había nada que
    // alguien pudiera tener viejo — así que no puede subir la revisión: hacerlo
    // invalidaría la foto que el propio auto-init acaba de llenar y duplicaría el
    // descifrado en cada instancia en frío de cada servicio.
    localStorage.clear();
    seedProducts([makeProduct('p1')]);
    expect(localStorage.getItem(INVENTORY_STORAGE_KEY)).toBeNull();

    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const cold = makeService();
    expect(cold.getStorageInventoriesMap().size).toBe(0);
    await flushDataChangeNotifications();

    expect(seen).toEqual([]);
    expect(useDataRevisionStore.getState().revision).toBe(0);
    // Y el auto-init sí sembró: la tienda deja de estar "ausente" para las demás.
    expect(localStorage.getItem(INVENTORY_STORAGE_KEY)).not.toBeNull();

    unsubscribe();
  });

  it('IV-5: una ráfaga de escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const b = makeService();
    for (let i = 0; i < 20; i += 1) b.addImportedEntries('p1', [makeEntry(`e${i}`, 'p1', i)]);

    await flushDataChangeNotifications();

    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });
});
