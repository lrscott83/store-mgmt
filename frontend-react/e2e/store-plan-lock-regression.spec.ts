import { test, expect } from './support/test';
import type { Page } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature, degradeStoreToFreePlan } from './support/store-fixture';
import { E2E_API_URL } from './support/backend-url';
import { readBearerToken } from './support/auth-storage';
import { installPlanChangeObserver } from './support/plan-change-observer';

/**
 * [S2-02 → owner-plan-change] Regresión DG-7, repurposada (authorized update,
 * T7.1): the readOnly lock is GONE (design.md AD7 — the owner changes the plan
 * of their store at any time; the backend ownership guard is the only
 * authority). So the regression this spec hunts changed shape:
 *
 *   1. The plan change goes through the dialog / POST /v1/stores/{id}/change-plan
 *      — NEVER through the old PUT /v1/stores/{id} moduleIds activation. If
 *      the PUT-based activation returns, the observer's expectNoStorePut()
 *      catches it.
 *   2. `paymentStartDate` — the billing ANCHOR — is never nulled and never
 *      modified by the plan change (the change-plan body cannot even carry
 *      it; pinned from the DB before and after).
 *   3. The activation action renders for the owner of a PAID store too (the
 *      old lock hid it — now the free panel of a paid store shows "Activar
 *      Plan" when expanded).
 *
 * El defecto histórico que este spec existía para cazar (el candado que leía
 * `readOnly = !isSuperAdmin && paymentStartDate != null`) ya no puede volver
 * en esa forma: la prop ni la derivación existen más. La forma en la que la
 * regresión puede volver es la del punto 1 — el PUT con moduleIds — y este
 * spec la clava con el observer.
 *
 * Un solo `test()` que camina la matriz completa (design.md §2 — nunca
 * partirlo: partir gasta un login que el techo no tiene).
 *
 * Costo: UN login real (el mint de `owner-admin` en su propio worker), el
 * mismo presupuesto que `store-plan-activation.spec.ts`. No guarda nada por la
 * vía vieja: el único PUT al store es el que prohíbe este spec.
 */
const ACTIVATE_TEXT = 'Activar Plan'; // es.ts STORES.PLAN.ACTIVATE_PLAN (owner-plan-change)
const ACTIVE_BADGE_TEXT = 'Activo'; // es.ts STORES.PLAN.ACTIVE_BADGE

test.use({ persona: 'owner-admin' });

// Serial + timeout generoso: el primer (único) test paga un mint, una siembra
// directa a BD, dos pins por API, una activación real y un pin de BD final.
test.describe.configure({ mode: 'serial', timeout: 120_000 });

// Mismo default que el modo de backend documentado; override con E2E_DB_URL
// cuando el backend apuntó a otro lado (store-fixture.ts:150-152,
// global-teardown.ts:27).
const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/**
 * Siembra directa a BD del `PaymentStartDate` de una tienda (el mismo patrón
 * de `store-fixture.ts`): la fecha solo es nullable en tiendas *legacy* que
 * esquivaron `CreateStoreService`, y ninguna API alcanzable por un OwnerAdmin
 * la puede anular (el PUT general "solo aplica valor no nulo";
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
      [value, storeId],
    );
    if (result.rowCount !== 1) {
      throw new Error(
        `expected exactly 1 Store row for ${storeId}, the UPDATE touched ${result.rowCount}. ` +
          'The paymentStartDate seed did not land where this spec thinks it should.',
      );
    }
  } catch (cause) {
    throw new Error(
      `store-plan-lock-regression: setPaymentStartDateDirect(${storeId}, ${value}) failed — ` +
      `the paymentStartDate seed did not happen: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  } finally {
    await client.end();
  }
}

/** Lee `PaymentStartDate` + `StorePlanId` directo de la BD (anchor pinning). */
async function readStoreAnchorRow(
  storeId: string,
): Promise<{ paymentStartDate: string | null; storePlanId: number | null }> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query<{ PaymentStartDate: string | null; StorePlanId: string | null }>(
      'SELECT "PaymentStartDate", "StorePlanId" FROM "Store" WHERE "Id" = $1',
      [storeId],
    );
    if (result.rowCount !== 1) {
      throw new Error(
        `store-plan-lock-regression: expected exactly 1 Store row for ${storeId}, ` +
          `the SELECT found ${result.rowCount}.`,
      );
    }
    return {
      paymentStartDate: result.rows[0].PaymentStartDate,
      storePlanId: result.rows[0].StorePlanId === null ? null : Number(result.rows[0].StorePlanId),
    };
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
        'the seeded state without it.',
    );
  }
  const body = (await response.json()) as { data?: { paymentStartDate?: string | null } };
  return body.data?.paymentStartDate ?? null;
}

/** Precondition pin: la siembra directa a BD quedó visible por la API real. */
async function assertPlanPaymentStartDateIs(
  page: Page,
  storeId: string,
  expected: string | null,
): Promise<void> {
  const observed = await readPlanPaymentStartDate(page, storeId);
  if (observed !== expected) {
    throw new Error(
      `store-plan-lock-regression: expected paymentStartDate ${expected} after the direct-DB ` +
        `seed, observed ${observed}. The precondition this spec relies on was not actually written.`,
    );
  }
}

test('el cambio de plan del owner va por change-plan, nunca por PUT; el ancla paymentStartDate queda intacta', async ({
  signedInPage,
}) => {
  const { page, selectedStoreId } = signedInPage;

  // REQ-13/D9 — antes que nada: un logout silencioso (H-7/H-8) no puede
  // convertirse en fallos confusos aguas abajo.
  await assertStoresFeature(page);

  // ── Mitad 1: tienda PAGA con fecha NULA (legacy shape) ⇒ el owner PUEDE
  //    cambiar el plan y el ancla sigue nula tras el cambio.
  //
  // La tienda de la persona `owner-admin` es paga por defecto (H-1: el
  // auto-registro entrega TODOS los módulos, incluidos los pagos), así que
  // anular la fecha deja exactamente la forma "legacy": plan pago activo,
  // fecha nula. AD7: el botón "Activar Plan" se renderiza igual — el lock
  // DG-7 ya no existe.
  await setPaymentStartDateDirect(selectedStoreId, null);
  await assertPlanPaymentStartDateIs(page, selectedStoreId, null);

  await page.goto('/management/stores');

  // The plan view renders the three collapsible panels; the store is on the
  // PAID plan, so the Pago header is the default-expanded one. The FREE
  // (non-active) panel is where an activation action would render — expand it.
  const freeHeader = page.getByRole('button', { name: /Gratis/ });
  const paidHeader = page.getByRole('button', { name: /Pago/ });

  await expect(paidHeader.getByText(ACTIVE_BADGE_TEXT)).toBeVisible();
  await freeHeader.click();
  await expect(freeHeader).toHaveAttribute('aria-expanded', 'true');

  // AD7: con el lock muerto, el owner de la tienda PAGA ve "Activar Plan" en
  // el panel GRATIS — la vieja aserción simétrica ("no se renderiza") ahora
  // describe el DEFECTO, no el contrato.
  await expect(page.getByRole('button', { name: ACTIVATE_TEXT })).toBeVisible();

  // ── Mitad 2: tienda GRATIS con fecha NO NULA ⇒ activación real por POST,
  //    sin PUT, ancla intacta.
  //
  // Restaurar la fecha (tienda "recién creada", `PaymentStartDate = hoy`) y
  // degradar a plan gratuito con la fixture existente, que pinna ambas
  // mitades de la precondición (módulos solo-gratis Y fecha no nula).
  await setPaymentStartDateDirect(selectedStoreId, new Date().toISOString().slice(0, 10));
  await degradeStoreToFreePlan(page, selectedStoreId);

  await page.reload();

  // Ahora el planType backend es 'Gratis': el panel PAGO (no activo, colapsado
  // por defecto) debe renderizar "Activar Plan" al expandirlo — pese a que la
  // fecha NO es nula. Si alguien reintrodujera el candado de
  // `paymentStartDate != null` (S2-02.md), esta aserción falla.
  const paidHeaderAfter = page.getByRole('button', { name: /Pago/ });
  const freeHeaderAfter = page.getByRole('button', { name: /Gratis/ });
  await expect(freeHeaderAfter.getByText(ACTIVE_BADGE_TEXT)).toBeVisible();
  await expect(paidHeaderAfter).toHaveAttribute('aria-expanded', 'false');
  await paidHeaderAfter.click();
  await expect(paidHeaderAfter).toHaveAttribute('aria-expanded', 'true');
  const activateButton = page.getByRole('button', { name: ACTIVATE_TEXT });
  await expect(activateButton).toBeVisible();

  // Anchor BEFORE — pinned from the DB, not guessed from the UI.
  const anchorBefore = await readStoreAnchorRow(selectedStoreId);

  // Install the observer AFTER the DOM assertions so the POST it watches for
  // is unambiguously the activation click below.
  const observer = installPlanChangeObserver(page, selectedStoreId);
  await activateButton.click();

  const capture = await observer.waitForChangePlanResponse();
  expect(capture.status).toBe(200);

  // T7.1 regression: the plan change NEVER rides the old PUT activation. If
  // the moduleIds PUT returns, this throws — that is the defect this spec
  // exists to catch now.
  observer.expectNoStorePut();

  // Anchor sacred: the change-plan POST did not touch the anchor — same value
  // as before, still non-null (the fixture pinned it non-null).
  const anchorAfter = await readStoreAnchorRow(selectedStoreId);
  expect(anchorAfter.paymentStartDate).toBe(anchorBefore.paymentStartDate);
  expect(anchorAfter.paymentStartDate).not.toBeNull();

  // Reflection without reload: after the POST the page re-reads the store
  // plan and the ACTIVE badge moves to the paid header (store-plan.tsx
  // handleActivate: changeStorePlan → getUserByToken → getStorePlan).
  await expect(paidHeaderAfter).toHaveAttribute('aria-expanded', 'true');
  await expect(paidHeaderAfter.getByText(ACTIVE_BADGE_TEXT)).toBeVisible();

  // Exactly one POST, ZERO PUTs — the wire contract of the new activation.
  observer.expectExactlyOneChangePlanPost();
});
