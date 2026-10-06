// Movimiento 1 + 2 sobre la caché de categorías (`ProductCategoryRepository`).
//
// El defecto: `getStorageCategoriesMap()` solo recargaba con el mapa vacío o cambio de
// llave de tienda, así que si otra instancia mutaba el catálogo la vista montada seguía
// mostrando la categoría vieja. Aquí se fija el contrato entero:
//
// - Movimiento 2: la foto guarda con qué revisión se hizo y se rehace si cambió.
// - Movimiento 1: `setProductCategoriesLocalStorage` es la ÚNICA puerta de escritura
//   (el único `localStorage.setItem` de la clase) y avisa — agrupado.
//
// LocalStorage real + texto plano: sin DEK en memoria, `encryptEntity` deja pasar el
// texto sin cifrar (entity-crypto paso 2), así que el seeding es legible tal cual.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProductCategory } from '@store-mgmt/domain';
import { ProductCategoryRepository } from '../product-category-repository';
import {
  flushDataChangeNotifications,
  useDataRevisionStore,
} from '~/shared/lib/stores/data-revision-store';

const storeId = 's1';
const STORAGE_KEY = `lizoft.store-product-categories-${storeId}`;

function makeCategory(id: string, name: string): ProductCategory {
  return { id, name, order: 0, isActive: true };
}

function seed(...categories: ProductCategory[]): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(categories.map((c) => [c.id, c] as [string, ProductCategory])),
  );
}

function repo(): ProductCategoryRepository {
  return new ProductCategoryRepository(storeId);
}

function nameOf(repository: ProductCategoryRepository, id: string): string | undefined {
  return repository.getProductCategoryById(id)?.name;
}

describe('ProductCategoryRepository — invalidación por revisión y aviso en la escritura', () => {
  beforeEach(async () => {
    // Drena la cola antes de reiniciar: el flag de agrupado es de módulo y un
    // `setState` a ciegas lo dejaría desincronizado con la revisión.
    await flushDataChangeNotifications();
    useDataRevisionStore.setState({ revision: 0 });
    localStorage.clear();
    seed(makeCategory('c1', 'Bebidas'), makeCategory('c2', 'Lacteos'));
  });

  it('PC-1: otra instancia escribe → tras vaciar la cola, A lee el dato NUEVO', async () => {
    const a = repo();

    // A calienta su foto con el estado viejo.
    expect(nameOf(a, 'c1')).toBe('Bebidas');

    // B (otra instancia, como un import o una pantalla distinta) renombra la categoría.
    const b = repo();
    b.updateProductCategory('c1', 'Refrescos', 0, true);
    await flushDataChangeNotifications();

    // A NO pide sus datos a B: relee el almacenamiento porque la revisión cambió.
    expect(nameOf(a, 'c1')).toBe('Refrescos');
  });

  it('PC-2: control — sin escritura, A sigue con su foto (si no, PC-1 no probaría nada)', () => {
    const a = repo();
    expect(nameOf(a, 'c1')).toBe('Bebidas');

    // Escritura directa al almacenamiento, SIN pasar por la puerta que avisa: es
    // exactamente el defecto que la revisión corrige.
    seed(makeCategory('c1', 'Refrescos'), makeCategory('c2', 'Lacteos'));
    a.getStorageCategoriesMap();

    expect(nameOf(a, 'c1')).toBe('Bebidas');
  });

  it('PC-3: el alta de otra instancia aparece tras vaciar la cola', async () => {
    const a = repo();
    expect(a.getStorageCategoriesMap().size).toBe(2);

    repo().addProductCategory('Licores', 3, true);
    await flushDataChangeNotifications();

    expect(a.getStorageCategoriesMap().size).toBe(3);
    expect(a.getProductCategoryByName('Licores')).toBeDefined();
    // Y lo ya cacheado no se pierde: c1 sigue ahí.
    expect(nameOf(a, 'c1')).toBe('Bebidas');
  });

  it('PC-4: desactivar en otra instancia se refleja sin volver a montar', async () => {
    const a = repo();
    expect(a.getAvailableProductCategories()).toHaveLength(2);

    repo().deactivateProductCategory('c1', true);
    await flushDataChangeNotifications();

    expect(a.getAvailableProductCategories()).toHaveLength(1);
    // La fila sigue existiendo: solo dejó de estar disponible (soft-delete, no borrado).
    expect(a.getProductCategoryById('c1')).toBeDefined();
    expect(a.getProductCategoryById('c1')!.isActive).toBe(false);
  });

  it('PC-5: una ráfaga de escrituras produce UNA sola subida de revisión', async () => {
    const seen: number[] = [];
    const unsubscribe = useDataRevisionStore.subscribe((state) => seen.push(state.revision));

    const b = repo();
    for (const name of ['A', 'B', 'C', 'D', 'E']) b.addProductCategory(name, 10, true);

    await flushDataChangeNotifications();

    expect(seen).toEqual([1]);
    expect(useDataRevisionStore.getState().revision).toBe(1);

    unsubscribe();
  });
});
