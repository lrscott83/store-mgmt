import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { assertStoresFeature } from './support/store-fixture';
import { installStoreNetworkObserver } from './support/store-network-observer';
import { E2E_API_URL } from './support/backend-url';
import { readBearerToken } from './support/auth-storage';

/**
 * [Plan/update split] — the store-DATA update view (`/management/stores/update`)
 * saves WITHOUT `moduleIds` (the backend leaves the plan untouched), the menu
 * shows BOTH store links under the same authorization, and the plan survives a
 * data-only save with an identical module set.
 *
 * The PLAN half of the split is already covered end to end by
 * `store-plan-activation.spec.ts`; this file covers only what that file
 * cannot: the data view, the two menu links, and the data-only PUT contract.
 *
 * Costs ONE real login (the persona mint in its own worker) — the same budget
 * as `store-plan-activation.spec.ts`, well under the LoginPolicy ceiling of
 * 10/minute (`RateLimitPolicies.cs`).
 */
test.use({ persona: 'owner-admin' });

// Serial + generous timeout: the first test pays a mint, three seeding
// round-trips and a full save cycle before its last assertion (same rationale
// as store-plan-activation.spec.ts — never split it).
test.describe.configure({ mode: 'serial', timeout: 120_000 });

/** Reads the store's plan module ids via the real API (fixture pattern, never guessed). */
async function readPlanModuleIds(page: Page, storeId: string): Promise<number[]> {
  const token = await readBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/stores/${storeId}/plan`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(
      `store-update: GET /v1/stores/${storeId}/plan failed (status ${response.status()}) while ` +
        'reading the plan precondition — cannot verify \"plan untouched\" without it.'
    );
  }
  const body = (await response.json()) as {
    data?: { modules?: Array<{ id: number }> };
  };
  return (body.data?.modules ?? []).map((m) => m.id).sort((a, b) => a - b);
}

test('la vista Update guarda datos sin tocar el plan y el menú muestra ambos enlaces', async ({ signedInPage }) => {
  const { page, selectedStoreId } = signedInPage;

  // Misma autorización que el resto del flujo: sin la feature Stores, el
  // adminFeatureLoader desloguea (loaders.ts). Fallo ruidoso y temprano.
  await assertStoresFeature(page);

  // Menú: los DOS enlaces de la tienda (Plan + Update) con la misma feature.
  await page.getByRole('button', { name: 'Alternar barra lateral' }).click();
  await expect(page.getByRole('link', { name: 'Plan de la tienda' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar la tienda' })).toBeVisible();
  await page.getByRole('link', { name: 'Editar la tienda' }).click();

  // Vista Update: formulario de DATOS sin el picker de plan.
  await page.waitForURL(/\/management\/stores\/update$/);
  await expect(page.getByRole('heading', { name: 'Editar la tienda' })).toBeVisible();
  await expect(page.locator('#store-name')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Activar este plan' })).toHaveCount(0);

  // Precondición real: el conjunto de módulos del plan ANTES del guardado.
  const before = await readPlanModuleIds(page, selectedStoreId);
  expect(before.length).toBeGreaterThan(0);

  // Guardado SOLO de datos: el PUT no debe llevar moduleIds.
  const storeObserver = installStoreNetworkObserver(page, selectedStoreId);
  storeObserver.markDocumentBaseline();

  const newName = `E2E-${Date.now()}`;
  await page.locator('#store-name').fill(newName);

  const saveButton = page.getByRole('button', { name: 'Guardar' });
  await saveButton.click();

  const putCapture = await storeObserver.waitForPutResponse();
  expect(putCapture.status).toBe(200);
  const payload = JSON.parse(putCapture.rawBody) as Record<string, unknown>;
  expect('moduleIds' in payload).toBe(false);
  expect(payload.name).toBe(newName);

  // ANCHOR: el botón vuelve a habilitarse = todo el handler corrió hasta el
  // final (incluido el refresco de sesión) — mismo patrón que
  // store-plan-activation.spec.ts.
  await expect(saveButton).toBeEnabled();
  storeObserver.expectExactlyOnePut();
  storeObserver.expectNoDocumentSince('tras guardar los datos de la tienda');

  // El plan queda intacto: mismo conjunto de módulos tras el guardado de datos.
  const after = await readPlanModuleIds(page, selectedStoreId);
  expect(after).toEqual(before);

  // Persistencia: recargar → el formulario llega pre-cargado con el nuevo nombre.
  await page.reload();
  await expect(page.locator('#store-name')).toHaveValue(newName);
});
