// Invalidación de la caché por instancia de `ProductRepository` cuando cambia la revisión
// global de datos (`useDataRevisionStore`).
//
// El defecto: `getStorageProductsMap()` solo recargaba con el mapa vacío o cambio de llave
// de tienda, así que otra instancia que muta el catálogo (o una venta que descuenta stock)
// dejaba a las vistas leyendo el snapshot viejo. Aquí se fija el contrato con un campo
// observable del producto (el precio), sin React y sin mocks de datos: LocalStorage real +
// DEK no requerido (el seeding es texto plano).
//
// - Movimiento 2: la foto guarda con qué revisión se hizo (DR-*).
// - Movimiento 1: `setProductsLocalStorage` es el ÚNICA puerta de escritura (el único
//   `localStorage.setItem` de la clase) — create/update/borrado lógico/reemplazo del mapa
//   entero, siembra e importación CSV, más el auto-init de la lectura — y avisa (PR-*).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductRepository } from '../product-repository';
import { ProductCategoryRepository } from '../product-category-repository';
import {
  bumpDataRevision,
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';
import type { Product, ProductCategory } from '@store-mgmt/domain';

const storeId = 's1';
const PRODUCTS_STORAGE_KEY = `lizoft.store-products-${storeId}`;

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
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
    ...overrides,
  };
}

function makeCategory(id: string): ProductCategory {
  return { id, name: `Category ${id}`, order: 0, isActive: true };
}

function seedProducts(products: Product[]): void {
  const entries = products.map((p) => [p.id, p] as [string, Product]);
  localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(entries));
}

function seedCategories(): void {
  const entries = [makeCategory('cat-1')].map((c) => [c.id, c] as [string, ProductCategory]);
  localStorage.setItem(`lizoft.store-product-categories-${storeId}`, JSON.stringify(entries));
}

function makeRepository(): ProductRepository {
  return new ProductRepository(storeId, new ProductCategoryRepository(storeId));
}

function priceFrom(repository: ProductRepository): number {
  return repository.getProductById('p1')!.price;
}

/** Otra instancia reescribe el catálogo, igual que lo haría un servicio de sincronización. */
function writeProductByOtherInstance(overrides: Partial<Product>): void {
  const writer = makeRepository();
  const map = writer.getStorageProductsMap();
  map.set('p1', makeProduct('p1', overrides));
  writer['setProductsLocalStorage'](map);
}

describe('ProductRepository — invalidación de caché por revisión de datos', () => {
  beforeEach(async () => {
    // Drena la cola antes de reiniciar: el flag de agrupado es de módulo y un
    // `setState` a ciegas lo dejaría desincronizado con la revisión.
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    seedProducts([makeProduct('p1'), makeProduct('p2')]);
    seedCategories();
  });

  it('DR-1: tras un bumpDataRevision() la instancia con caché caliente lee el producto nuevo', () => {
    const repository = makeRepository();

    // La caché se calienta con el estado viejo.
    expect(priceFrom(repository)).toBe(10);

    // Otra instancia muta el catálogo y notifica el cambio.
    writeProductByOtherInstance({ price: 25 });
    bumpDataRevision();

    // La MISMA instancia debe volver a leer.
    expect(priceFrom(repository)).toBe(25);
  });

  it('DR-2: control — sin bumpDataRevision() la instancia sigue sirviendo su snapshot viejo', () => {
    const repository = makeRepository();

    expect(priceFrom(repository)).toBe(10);

    writeProductByOtherInstance({ price: 25 });

    // Sin bump la caché sigue viva: el defecto exacto que la revisión corrige.
    expect(priceFrom(repository)).toBe(10);

    // Y al bumpear sí converge.
    bumpDataRevision();
    expect(priceFrom(repository)).toBe(25);
  });

  it('DR-3: los productos añadidos por otra instancia aparecen tras el bump', () => {
    const repository = makeRepository();

    expect(repository.getStorageProductsMap().size).toBe(2);
    expect(repository.getProductById('p3')).toBeUndefined();

    const writer = makeRepository();
    const map = writer.getStorageProductsMap();
    map.set('p3', makeProduct('p3', { price: 99 }));
    writer['setProductsLocalStorage'](map);
    bumpDataRevision();

    expect(repository.getStorageProductsMap().size).toBe(3);
    expect(repository.getProductById('p3')!.price).toBe(99);
    // Y lainvalidación no pierde lo ya cacheado: p1 sigue ahí con su precio viejo.
    expect(repository.getProductById('p1')!.price).toBe(10);
  });

  it('DR-4: hasAnyProduct() y getAvailableProducts() leen el estado nuevo tras el bump', () => {
    const repository = makeRepository();

    expect(repository.hasAnyProduct()).toBe(true);
    expect(repository.getAvailableProducts()).toHaveLength(2);

    writeProductByOtherInstance({ isActive: false });
    bumpDataRevision();

    expect(repository.getAvailableProducts()).toHaveLength(1);
    expect(repository.getAvailableProductById('p1')).toBeNull();
    // El producto sigue existiendo: solo dejó de estar disponible para la venta.
    expect(repository.getProductById('p1')).toBeDefined();
  });

  // ─── Movimiento 1: aviso en la puerta de escritura ──────────────────────

  it('PR-1: otra instancia escribe → tras vaciar la cola, A lee el dato NUEVO', async () => {
    const a = makeRepository();
    // A calienta su foto con el precio viejo.
    expect(priceFrom(a)).toBe(10);

    // B (otra pantalla, con su propia instancia) edita el precio del producto.
    const b = makeRepository();
    b.updateProduct('p1', 'cat-1', 'Product p1', 99, '', 0, true, true, true);
    await flushDataChangeNotifications();

    // A NO pide sus datos a B: relee el almacenamiento porque la revisión cambió.
    expect(priceFrom(a)).toBe(99);
  });

  it('PR-2: control — sin escritura, A sigue con su foto (si no, PR-1 no probaría nada)', () => {
    const a = makeRepository();
    expect(priceFrom(a)).toBe(10);

    // Escritura directa al almacenamiento, SIN pasar por la puerta que avisa: es
    // exactamente el defecto que el aviso corrige.
    seedProducts([makeProduct('p1', { price: 99 }), makeProduct('p2')]);
    a.getStorageProductsMap();

    expect(priceFrom(a)).toBe(10);
  });

  it('PR-3: el alta de otra instancia aparece tras vaciar la cola', async () => {
    const a = makeRepository();
    expect(a.getStorageProductsMap().size).toBe(2);
    expect(a.getProductById('p3')).toBeUndefined();

    // `addProductData` y no `addProduct`: este último genera el id, y el test necesita
    // el id exacto para poder preguntar por él desde la instancia A.
    makeRepository().addProductData('p3', 'cat-1', 'Product p3', 42, '', 5, true, true, true);
    await flushDataChangeNotifications();

    expect(a.getStorageProductsMap().size).toBe(3);
    expect(a.getProductById('p3')!.price).toBe(42);
    // Y lo ya cacheado no se pierde: p1 sigue ahí.
    expect(priceFrom(a)).toBe(10);
  });

  it('PR-4: la escritura de auto-inicialización NO dispara notificación', async () => {
    // Lectura en frío de una tienda genuinamente vacía: el repositorio siembra un mapa
    // vacío en el almacenamiento. Eso NO es un cambio de datos — no había nada que
    // alguien pudiera tener viejo — así que no puede subir la revisión: hacerlo
    // invalidaría la foto que el propio auto-init acaba de llenar y duplicaría el
    // descifrado en cada instancia en frío de cada servicio.
    localStorage.clear();
    seedCategories();
    expect(localStorage.getItem(PRODUCTS_STORAGE_KEY)).toBeNull();

    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const cold = makeRepository();
    expect(cold.getStorageProductsMap().size).toBe(0);
    await flushDataChangeNotifications();

    expect(seen).toEqual([]);
    expect(useDataRevisionStore.getState().revision).toBe(0);
    // Y el auto-init sí sembró: la tienda deja de estar "ausente" para las demás.
    expect(localStorage.getItem(PRODUCTS_STORAGE_KEY)).not.toBeNull();

    unsubscribe();
  });

  it('PR-5: una ráfaga de escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const b = makeRepository();
    for (let i = 0; i < 20; i += 1) {
      b.addProduct('cat-1', `Bulk ${i}`, 1 + i, '', i, true, true, true);
    }

    await flushDataChangeNotifications();

    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });

  it('PR-6: el escritor NO relee lo que acaba de escribir (sello por delante de la revisión)', () => {
    // La puerta devuelve la revisión que su aviso pendiente PRODUCIRÁ, y el escritor la
    // estampa en su foto. La comparación `>` (y no `!==`) es la que evita que ese sello,
    // que es una revisión todavía futura, se lea como "mi foto está vieja": con `!==` el
    // escritor se trataría a sí mismo como obsoleto y volvería a descifrar el catálogo que
    // acaba de persistir. Se cuenta la lectura real del almacenamiento para que la
    // diferencia sea observable, no una coincidencia de valores.
    const b = makeRepository();
    const map = b.getStorageProductsMap();
    map.set('p1', makeProduct('p1', { price: 77 }));
    b['setProductsLocalStorage'](map);

    const reads = countReadsOf(PRODUCTS_STORAGE_KEY, () => {
      expect(priceFrom(b)).toBe(77);
      // La revisión sigue en 0: el aviso está en cola, aún no se ha entregado.
      expect(useDataRevisionStore.getState().revision).toBe(0);
    });

    expect(reads).toBe(0);
  });
});

/**
 * Cuenta cuántas veces `storageKey` se lee del LocalStorage mientras se ejecuta `body`.
 * Envuelve el contador alrededor del ESPRÍN de invocación, no del cuerpo, para que el
 * propio spy no se cuente a sí mismo.
 */
function countReadsOf(storageKey: string, body: () => void): number {
  const original = Storage.prototype.getItem;
  let reads = 0;
  const spy = vi
    .spyOn(Storage.prototype, 'getItem')
    .mockImplementation(function (this: Storage, key: string) {
      if (key === storageKey) reads += 1;
      return original.call(this, key);
    });
  try {
    body();
  } finally {
    spy.mockRestore();
  }
  return reads;
}

