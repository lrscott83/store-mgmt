// Regresión de INTEGRACIÓN (bug "multi-tienda: todas las tiendas vacías",
// 2026-09-20) — gemela de `available-multistore-integration.test.tsx`, pero con
// el estado real que rompía la lectura: el DEK en memoria pertenece a la tienda
// de la sesión (`getDekStoreId()`), mientras el device-dek table está etiquetado
// con OTRA tienda (etiqueta legada / adelantada al reload). Ese es el estado que
// `dek-bootstrap.test.ts` usa para probar su early-return y que
// `dek-provisioning.ts:430-436` documenta como el split sesión↔reload.
//
// Antes del fix, el modo multi-tienda resolvía el DEK de la tienda seleccionada
// por `table.storeId` → null → lectura cifrada vacía → TODOS los paneles "sin
// datos", aunque el modo single-store (que usa el DEK en memoria) mostraba el
// inventario perfectamente. Estos tests pinchan ambos lados: single-store SÍ ve
// el inventario en ese mismo estado, multi-store DEBE verlo también.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { ProductOfflineService } from '~/sales/lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '~/sales/lib/services/product-category-offline-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { writeDeviceDekTable } from '~/shared/lib/storage/device-dek-table';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { allowUnmockedHttpReporting } from '~/shared/lib/testing/block-real-http';
import { InventoryAvailablePage } from '~/inventory/routes/available';
allowUnmockedHttpReporting();

function ownerUser(storeIds: string[], storeNames: string[], withMultiStores: boolean): UserModel {
  return {
    id: 'user-1',
    login: 'owner',
    firstName: 'Owner',
    lastName: 'Test',
    email: '',
    activated: true,
    langKey: 'es',
    imageUrl: '',
    activatedBy: '',
    resetDate: null as unknown as string,
    resetKey: null as unknown as string,
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    isDemo: false,
    expiresIn: Date.now() + 60 * 60 * 1000,
    selectedStoreId: storeIds[0],
    storeList: storeIds.map((id, i) => ({ id, name: storeNames[i], isActive: true })),
    storeModuleIds: withMultiStores ? [EModules.MultiStores] : [],
    featureIds: [],
    roles: storeIds.map((id) => ({ storeId: id, featureIds: [] })),
  } as unknown as UserModel;
}

function seedSession(user: UserModel) {
  localStorage.setItem(
    StorageKeys.AUTH_MODEL,
    JSON.stringify({ authToken: 'test-token', expiresIn: user.expiresIn }),
  );
  localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));
  void useAuthStore.getState().getUserByToken();
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('Inventario Disponible — DEK de la tienda seleccionada bajo etiqueta divergente', () => {
  const STORE_ID = 's1';

  beforeEach(() => {
    localStorage.clear();
    clearDek();
    // La sesión activa está en s1: su DEK vive en memoria bajo s1.
    setDek(crypto.getRandomValues(new Uint8Array(32)), STORE_ID);
    // PERO el device-dek table conserva una etiqueta de OTRA tienda (estado real
    // tras un switch/reload): sin wrap para s1 en `stores`.
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: 'legacy-label-store',
      device: null,
      users: {},
      stores: {},
    });
  });

  afterEach(() => clearDek());

  async function seedCatalogAndTodayEntry(productName: string) {
    const categorySvc = new ProductCategoryOfflineService(STORE_ID);
    await categorySvc.createProductCategory('Bebidas', 1, true);
    const categoryId = categorySvc['categoryRepository'].getProductCategories()[0].id;
    const productSvc = new ProductOfflineService(STORE_ID);
    await productSvc.createProduct(categoryId, productName, 100, 'biz-1', 1, true, true, false);
    const productId = productSvc['productRepository'].getStorageProductsMap().values().next()
      .value!.id;
    const inventorySvc = new InventoryOfflineService(STORE_ID, productSvc['productRepository']);
    const result = inventorySvc.createInventoryEntry(productId, 10, 25);
    expect(result?.succeeded).toBe(true);
    return { productId, categoryId };
  }

  it('IV-DEK-1 (control): SIN MultiStores el inventario de la tienda seleccionada SÍ se muestra en este estado', async () => {
    seedSession(ownerUser([STORE_ID], ['Tienda A'], false));
    await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    // El modo single-store usa el DEK en memoria → el inventario aparece.
    await waitFor(() => {
      expect(screen.getByText('(10)')).toBeInTheDocument();
    });
    expect(screen.getAllByText('$250').length).toBeGreaterThan(0);
  });

  it('IV-DEK-2: CON MultiStores el panel de la tienda seleccionada DEBE mostrar su inventario (no "sin datos")', async () => {
    seedSession(ownerUser([STORE_ID, 's2'], ['Tienda A', 'Tienda B'], true));
    const { categoryId } = await seedCatalogAndTodayEntry('Cerveza');

    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId(`multistore-panel-toggle-${STORE_ID}`));
    // La tienda seleccionada tiene datos y su DEK está en memoria: debe mostrarlos.
    await waitFor(() => {
      expect(screen.getByText(/Bebidas \(10\)/)).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Sin datos de esta tienda en este dispositivo'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`multistore-inventory-category-toggle-${categoryId}`));
    await waitFor(() => {
      expect(screen.getByText('Cerveza (10)')).toBeInTheDocument();
    });
  });
});
