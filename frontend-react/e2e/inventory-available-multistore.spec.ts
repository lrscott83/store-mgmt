import { test, expect } from './support/test';
import type { Page } from '@playwright/test';

/**
 * [multi-store-inventory-available] E2E Playwright — agrupación del Inventario
 * Disponible por tienda (owner con el módulo MultiStores y ≥2 tiendas activas).
 *
 * Cobertura E2E que faltaba por completo: ninguna persona E2E tenía MultiStores
 * + 2 tiendas, así que la vista agrupada (`available.tsx` → `MultiStoreSection`:
 * select "Todas las tiendas" + nombres, un panel colapsable por tienda, header
 * agregado) no estaba ejercitada en navegador.
 *
 * Escenario: se restaura `owner-admin-with-products` (nace con MultiStores en su
 * tienda y con categoría + producto sembrados), se siembra una entrada de
 * inventario en la tienda seleccionada y se inyecta una SEGUNDA tienda activa en
 * `currentUser.storeList`. La sesión cacheada es autoritativa en cold boot
 * (`auth-store.ts:158-177`: con un perfil cacheado válido NO se llama al
 * backend), así que la inyección sobrevive al reload.
 *
 * LÍMITE HONESTO — por qué este E2E no reproduce la regresión del DEK:
 * los snapshots de persona EXCLUYEN a propósito `lizoft.device-dek` y las
 * entidades `enc:v1:` (`session.ts:129-164`: la CryptoKey del dispositivo no es
 * replayable y en un contexto restaurado no hay DEK), de modo que aquí los datos
 * van en texto plano y un DEK nulo los lee igual. La regresión "multi-tienda
 * mostraba TODAS las tiendas vacías por la resolución del DEK" sólo es alcanzable
 * con una sesión VIVA cifrada (el DEK vive en memoria de módulo y no se persiste)
 * y queda fijada por el test de integración que SÍ falla antes del fix:
 * `app/__tests__/available-multistore-selected-store-dek.test.tsx` (+ su unit
 * `read-store-entities.in-memory-dek.test.ts`). Este spec es el guard E2E del
 * comportamiento visible de la agrupación.
 */

const SECOND_STORE_ID = 'e2e-second-store';
const SECOND_STORE_NAME = 'Tienda B E2E';

/**
 * Seeds one active inventory entry (50 × 8 CUP) for the store's first sellable
 * product — same shape `inventory-available.spec.ts` uses (plaintext write, the
 * only encryption-free path available in a restored persona context).
 */
async function seedInventoryEntry(page: Page, storeId: string): Promise<void> {
  await page.evaluate(
    ({ storeId: sid }) => {
      const productKey = `lizoft.store-products-${sid}`;
      const rawProducts = localStorage.getItem(productKey);
      if (!rawProducts) return;
      let entries: [string, Record<string, unknown>][];
      try {
        entries = JSON.parse(rawProducts);
      } catch {
        return;
      }
      const p = entries.find(([, v]) => v['isActive'] && v['availableToSale']);
      if (!p) return;
      const [pid] = p;
      const catId = (p[1] as Record<string, unknown>)['categoryId'] as string;
      const invKey = `lizoft.store-inventory-entries-${sid}`;
      const raw = localStorage.getItem(invKey);
      let map: [string, Record<string, unknown>[]][] = [];
      if (raw) {
        try {
          map = JSON.parse(raw);
        } catch {
          map = [];
        }
      }
      const bucket = map.find(([id]) => id === pid);
      if (bucket?.[1].some((e) => e['isActive'])) return;
      const entry = {
        id: crypto.randomUUID(),
        productId: pid,
        categoryId: catId,
        quantity: 50,
        available: 50,
        costPrice: 8,
        date: new Date().toISOString(),
        order: 0,
        isActive: true,
        createdDate: new Date().toISOString(),
        createdByName: 'e2e-seed',
        updatedDate: undefined,
        updatedByName: undefined,
      };
      if (bucket) bucket[1].push(entry);
      else map.push([pid, [entry]]);
      localStorage.setItem(invKey, JSON.stringify(map));
    },
    { storeId },
  );
}

/**
 * Adds a second ACTIVE store to the cached session so `useMultiStore()` enables
 * the grouped mode (OwnerAdmin + MultiStores + ≥2 active stores) — and pins the
 * MultiStores module (14) defensively.
 */
async function addSecondStoreToSession(page: Page): Promise<void> {
  await page.evaluate(
    ({ storeId, storeName }) => {
      const raw = localStorage.getItem('currentUser');
      if (!raw) throw new Error('E2E: no hay currentUser para inyectar la segunda tienda');
      const user = JSON.parse(raw) as {
        storeModuleIds?: number[];
        storeList?: Array<{ id: string; name: string; isActive: boolean }>;
        roles?: Array<{ storeId: string; featureIds: number[] }>;
      };
      user.storeModuleIds = Array.from(new Set([...(user.storeModuleIds ?? []), 14]));
      const storeList = user.storeList ?? [];
      if (!storeList.some((s) => s.id === storeId)) {
        storeList.push({ id: storeId, name: storeName, isActive: true });
      }
      user.storeList = storeList;
      if (!(user.roles ?? []).some((r) => r.storeId === storeId)) {
        user.roles = [...(user.roles ?? []), { storeId, featureIds: [] }];
      }
      localStorage.setItem('currentUser', JSON.stringify(user));
    },
    { storeId: SECOND_STORE_ID, storeName: SECOND_STORE_NAME },
  );
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.use({ persona: 'owner-admin-with-products' });

test('MA-01 — con MultiStores el Inventario Disponible se agrupa por tienda y la tienda seleccionada muestra su stock', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  await seedInventoryEntry(page, selectedStoreId);
  await addSecondStoreToSession(page);

  await page.goto('/inventory/available');
  await expect(page.getByText('Inventario')).toBeVisible();

  // Global select: "Todas las tiendas" + one option per active store.
  const select = page.getByTestId('multistore-select');
  await expect(select).toBeVisible();
  await expect(select.locator('option', { hasText: 'Todas las tiendas' })).toHaveCount(1);
  await expect(select.locator('option', { hasText: SECOND_STORE_NAME })).toHaveCount(1);

  // One collapsible panel per store.
  const ownPanel = page.getByTestId(`multistore-panel-toggle-${selectedStoreId}`);
  await expect(ownPanel).toBeVisible();
  await expect(page.getByTestId(`multistore-panel-toggle-${SECOND_STORE_ID}`)).toBeVisible();

  // The selected store's panel shows its inventory: category (50) and 400 CUP total.
  await ownPanel.click();
  const categoryToggle = page
    .locator('[data-testid^="multistore-inventory-category-toggle-"]')
    .first();
  await expect(categoryToggle).toBeVisible();
  await expect(categoryToggle).toContainText('(50)');
  await categoryToggle.click();
  await expect(page.getByText(/400\s*CUP/).first()).toBeVisible();

  // The store with no local data shows the explicit empty message.
  await page.getByTestId(`multistore-panel-toggle-${SECOND_STORE_ID}`).click();
  await expect(page.getByText('Sin datos de esta tienda en este dispositivo')).toBeVisible();
});

test('MA-02 — el select filtra a una sola tienda y oculta el resto de paneles', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  await seedInventoryEntry(page, selectedStoreId);
  await addSecondStoreToSession(page);

  await page.goto('/inventory/available');
  const select = page.getByTestId('multistore-select');

  // All stores: both panels are present.
  await expect(page.getByTestId(`multistore-panel-toggle-${selectedStoreId}`)).toBeVisible();
  await expect(page.getByTestId(`multistore-panel-toggle-${SECOND_STORE_ID}`)).toBeVisible();

  // Filter to the second store: only its panel remains.
  await select.selectOption(SECOND_STORE_ID);
  await expect(page.getByTestId(`multistore-panel-toggle-${SECOND_STORE_ID}`)).toBeVisible();
  await expect(page.getByTestId(`multistore-panel-toggle-${selectedStoreId}`)).toHaveCount(0);
});
