import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature, degradeStoreToFreePlan } from './support/store-fixture';
import { E2E_API_URL } from './support/backend-url';
import { readBearerToken } from './support/auth-storage';

/**
 * [S2-02] Regresión DG-7 — el candado no puede volver a colgarse de
 * `paymentStartDate` (`docs/testing/e2e-stage-1/S2-02.md`). Covers the two
 * render assertions of that scenario plus its regression note.
 *
 * El defecto que este spec existe para cazar (`store-form.tsx:72-82`): el
 * candado leía `readOnly = !isSuperAdmin && initialValues?.paymentStartDate != null`.
 * Era un proxy correcto mientras el reloj arrancaba solo con el primer módulo
 * pago; desde que TODA tienda arranca su reloj al crearse
 * (`CreateStoreService.cs:39-43`), ese proxy gastaría la única activación del
 * dueño en el nacimiento de la tienda. La condición real es
 * `isOnPaidPlan = modules.some(m => !m.priceIncluded && m.selected)`
 * (`store-plan.tsx`), donde `paymentStartDate` NO interviene.
 *
 * Un solo `test()` que camina la matriz completa (design.md §2 — nunca
 * partirlo: partir gasta un login que el techo no tiene):
 *
 *   1. Aserción 3 (simétrica): `paymentStartDate` NULO + un módulo pago
 *      seleccionado ⇒ el botón "Activar este plan" NO se renderiza. La
 *      precondición (tienda legacy con fecha nula) se siembra directo en la
 *      BD (`UPDATE "Store" SET "PaymentStartDate" = NULL`, design.md D1) y se
 *      pinna re-leyendo por la API real. El chequeo discriminante vive en la
 *      pestaña GRATIS: es la única pestaña donde el botón se renderizaría si
 *      `readOnly` fuera falso (en la pestaña Pago `selected === tab` lo
 *      oculta estructuralmente, cualquiera sea el candado).
 *
 *   2. Aserción 1 + nota de regresión: `paymentStartDate` NO NULO + cero
 *      módulos pagos seleccionados ⇒ el botón SÍ se renderiza. La
 *      precondición la da `degradeStoreToFreePlan` (que pinna AMBAS mitades:
 *      módulos solo-gratis Y fecha no nula, `store-fixture.ts`). Si alguien
 *      reintroduce `readOnly = ... paymentStartDate != null`, esta aserción
 *      falla (el botón dejaría de renderizar) y la de la pestaña gratis
 *      también (el botón aparecería con fecha nula) — la matriz entera queda
 *      clavada a la condición real.
 *
 * Costo: UN login real (el mint de `owner-admin` en su propio worker), el
 * mismo presupuesto que `store-plan-activation.spec.ts` y `store-update.spec.ts`,
 * muy por debajo del techo de la `LoginPolicy` (10/min, `RateLimitPolicies.cs`).
 * No guarda nada (cero PUTs): el escenario prueba el RENDER, no el guardado.
 */
const PAID_ACTIVATE_TEXT = 'Activar este plan'; // es.ts:643

test.use({ persona: 'owner-admin' });

// Serial + timeout generoso: el primer (único) test paga un mint, dos siembras
// directas a BD, dos pins por API y dos renders antes de la última aserción.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

// Mismo default que el modo de backend documentado; override con E2E_DB_URL
// cuando el backend apuntó a otro lado (store-fixture.ts:150-152,
// global-teardown.ts:27).
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/**
 * Siembra directa a BD del `PaymentStartDate` de una tienda (design.md D1, el
 * mismo patrón de `store-fixture.ts`): la fecha solo es nullable en tiendas
 * *legacy* que esquivaron `CreateStoreService`, y ninguna API alcanzable por
 * un OwnerAdmin la puede anular (el PUT general "solo aplica valor no nulo";
 * `PUT /v1/stores/{id}/payment-date` es SuperAdmin-only). Así que la mitad
 * "fecha nula" de la matriz solo se puede sembrar en la capa de persistencia.
 *
 * Fallo ruidoso y temprano si el UPDATE no tocó exactamente una fila — misma
 * política de "precondition pinning" que `plantRoster()` y
 * `degradeStoreToFreePlan`.
 */
async function setPaymentStartDateDirect(storeId: string, value: string | null): Promise<void> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(
      'UPDATE "Store" SET "PaymentStartDate" = $1 WHERE "Id" = $2',
      [value, storeId]
    );
    if (result.rowCount !== 1) {
      throw new Error(
        `expected exactly 1 Store row for ${storeId}, the UPDATE touched ${result.rowCount}. ` +
          'The paymentStartDate seed did not land where this spec thinks it should.'
      );
    }
  } catch (cause) {
    throw new Error(
      `store-plan-lock-regression: setPaymentStartDateDirect(${storeId}, ${value}) failed — ` +
        `the paymentStartDate seed did not happen: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  } finally {
    await client.end();
  }
}

/** Lee el `paymentStartDate` del plan vía la API real (fixture pattern, nunca adivinado). */
async function readPlanPaymentStartDate(page: Page, storeId: string): Promise<string | null> {
  const token = await readBearerToken(page);
  const response = await page.request.get(`${E2E_API_URL}/v1/stores/${storeId}/plan`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(
      `store-plan-lock-regression: GET /v1/stores/${storeId}/plan failed (status ` +
        `${response.status()}) while reading the paymentStartDate precondition — cannot verify ` +
        'the seeded state without it.'
    );
  }
  const body = (await response.json()) as { data?: { paymentStartDate?: string | null } };
  return body.data?.paymentStartDate ?? null;
}

/** Precondition pin: la siembra directa a BD quedó visible por la API real (design.md D1). */
async function assertPlanPaymentStartDateIs(
  page: Page,
  storeId: string,
  expected: string | null
): Promise<void> {
  const observed = await readPlanPaymentStartDate(page, storeId);
  if (observed !== expected) {
    throw new Error(
      `store-plan-lock-regression: expected paymentStartDate ${expected} after the direct-DB ` +
        `seed, observed ${observed}. The precondition this spec relies on was not actually written.`
    );
  }
}

test('el candado DG-7 depende del módulo pago seleccionado, no de paymentStartDate', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  // REQ-13/D9 — antes que nada: un logout silencioso (H-7/H-8) no puede
  // convertirse en fallos confusos aguas abajo.
  await assertStoresFeature(page);

  // ── Aserción 3 (simétrica): fecha NULA + módulo pago seleccionado ⇒ NO se renderiza.
  //
  // La tienda de la persona `owner-admin` es paga por defecto (H-1: el
  // auto-registro entrega TODOS los módulos, incluidos los pagos), así que
  // anular la fecha deja exactamente la forma "legacy": módulo pago activo,
  // fecha nula.
  await setPaymentStartDateDirect(selectedStoreId, null);
  await assertPlanPaymentStartDateIs(page, selectedStoreId, null);

  await page.goto('/management/stores');

  const freeTab = page.getByRole('tab', { name: /Gratis/ });
  const paidTab = page.getByRole('tab', { name: /Pago/ });

  // En la pestaña Pago `selected === tab` oculta el botón estructuralmente;
  // el chequeo discriminante es la pestaña GRATIS (no seleccionada): ahí el
  // botón se renderizaría si `readOnly` fuera falso. Con fecha nula Y módulo
  // pago activo, la condición real (`isOnPaidPlan`) lo mantiene oculto —
  // si alguien revirtiera el candado a `paymentStartDate != null`, acá
  // aparecería y esta aserción falla.
  await freeTab.click();
  await expect(page.getByRole('button', { name: PAID_ACTIVATE_TEXT })).toHaveCount(0);

  // ── Aserción 1 + nota de regresión: fecha NO NULA + cero módulos pagos ⇒ SÍ se renderiza.
  //
  // Restaurar la fecha (tienda "recién creada", `PaymentStartDate = hoy`) y
  // degradar a plan gratuito con la fixture existente, que pinna ambas mitades
  // de la precondición (módulos solo-gratis Y fecha no nula — si la siembra no
  // las dejara así, `degradeStoreToFreePlan` lanza antes de seguir).
  await setPaymentStartDateDirect(selectedStoreId, new Date().toISOString().slice(0, 10));
  await degradeStoreToFreePlan(page, selectedStoreId);

  await page.reload();

  // En la pestaña Pago (no seleccionada) el botón debe renderizarse: el
  // candado es falso porque no hay módulo pago seleccionado, pese a que la
  // fecha NO es nula. Esta es la aserción que falla si alguien reintroduce
  // `readOnly = !isSuperAdmin && initialValues?.paymentStartDate != null`
  // (S2-02.md, nota de regresión).
  await paidTab.click();
  await expect(page.getByRole('button', { name: PAID_ACTIVATE_TEXT })).toBeVisible();
});
