import { test, expect } from './support/test';
import type { APIRequestContext, Browser } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';
import { Client } from 'pg';
import { assertStoresFeature, degradeStoreToFreePlan } from './support/store-fixture';
import { readBearerToken } from './support/auth-storage';
import { installPlanChangeObserver } from './support/plan-change-observer';
import { mintSuperAdmin } from './support/superadmin-session';
import { E2E_API_URL } from './support/backend-url';

/**
 * owner-plan-change [OPC-1] — the owner changes the store plan from the
 * "Editar el plan" dialog on /management/my-stores (openspec/changes/owner-plan-change,
 * design.md AD7: the DG-7 readOnly lock is gone; the backend ownership guard is
 * the only authority).
 *
 * NEW spec file (CLAUDE.md E2E rule: new files are allowed; existing specs stay
 * untouched). Walks the full owner flow in ONE test — splitting would spend a
 * login the LoginPolicy ceiling does not have (same budget policy as
 * store-plan-activation.spec.ts:39-47):
 *
 *   1. Degrade the persona store to the free plan (fixture pins both halves:
 *      free-only modules AND a non-null paymentStartDate).
 *   2. Open the plan popup, expand the PAID panel, observe "Activar Plan".
 *   3. Install the plan-change observer, click "Activar Plan".
 *   4. Pin the wire contract: ONE POST /v1/stores/{id}/change-plan whose body
 *      is exactly { storePlanId } — and ZERO PUT /v1/stores/{id} (the old
 *      moduleIds activation must not return, T7.1 regression).
 *   5. Anchor sacred: PaymentStartDate is unchanged by the change-plan POST
 *      (pinned from the DB before and after).
 *   6. The modal closes and the card repaints as PAID (no reload — the
 *      reflection is the session refresh + list re-read in my-stores.tsx).
 *
 * Cost: ONE real login (owner-admin persona mint) + one POST — the same budget
 * as one owner-stores.spec.ts test, well under the LoginPolicy ceiling.
 */

test.use({ persona: 'owner-admin' });

test.describe.configure({ mode: 'serial', timeout: 120_000 });

/** The store this spec mutates, captured so the cleanup can restore it even on failure. */
let personaStoreId: string | undefined;

// Runs after the test whether it passed or failed: leaving the shared persona
// store on Pago is what made `owner-stores` order-dependent.
test.afterAll(async ({ browser }) => {
  if (!personaStoreId) return;
  const api = await playwrightRequest.newContext();
  try {
    await restoreBirthPlan(api, browser, personaStoreId);
  } finally {
    await api.dispose();
  }
});

// Same default as the documented backend mode; override with E2E_DB_URL
// (store-fixture.ts, global-teardown.ts:27).
const SUPERIOR_PLAN_ID = 3;

/**
 * The persona store is WORKER-scoped (`personaCache`, support/test.ts): every
 * later test in this worker inherits whatever plan this spec leaves behind.
 * This spec degrades it to Gratis and then activates Pago, so it used to end
 * with the store on Pago — which made `owner-stores.spec.ts` E-01..E-05
 * (`Plan: Superior`) fail or pass depending on worker interleaving
 * (2026-11-09).
 *
 * Restores the ONE shape a store is born with — Superior — through the app's
 * own endpoint, which also rewrites the module set (`ChangeStorePlanCommand`).
 * Owner callers are blocked from Superior/VIP, so this uses a SuperAdmin
 * snapshot: the legitimate path, same as `store-multimonedas-fixture.ts`.
 */
async function restoreBirthPlan(
  api: APIRequestContext,
  browser: Browser,
  storeId: string,
): Promise<void> {
  const superAdmin = await mintSuperAdmin(browser);
  const bearer = superAdmin.localStorage.find((entry) => entry.name === 'token')?.value;
  if (!bearer) {
    throw new Error(
      'owner-plan-change-dialog: SuperAdmin snapshot has no `token` entry — the birth-plan ' +
        'restore cannot be authorized.',
    );
  }

  const response = await api.post(`${E2E_API_URL}/v1/stores/${storeId}/change-plan`, {
    headers: { Authorization: `Bearer ${bearer}` },
    data: { storePlanId: SUPERIOR_PLAN_ID },
  });
  if (!response.ok()) {
    throw new Error(
      `owner-plan-change-dialog: restoring the persona store ${storeId} to Superior failed ` +
        `(status ${response.status()}). Every later test in this worker would see the wrong ` +
        'birth plan.',
    );
  }

  // Pin the restore instead of trusting the 200: a silent no-op here is exactly
  // the drift this cleanup exists to prevent.
  const restored = await readStorePlanRow(storeId);
  if (restored.storePlanId !== SUPERIOR_PLAN_ID) {
    throw new Error(
      `owner-plan-change-dialog: after the restore POST, store ${storeId} is on plan ` +
        `${restored.storePlanId}, expected ${SUPERIOR_PLAN_ID} (Superior).`,
    );
  }
}

const DEFAULT_DB_URL = 'postgresql://postgres:postgres@localhost:5432/smca_test';

/** Reads PaymentStartDate + StorePlanId straight from the DB (anchor pinning). */
async function readStorePlanRow(
  storeId: string,
): Promise<{ paymentStartDate: string | null; storePlanId: number | null }> {
  const connectionString = process.env['E2E_DB_URL'] ?? DEFAULT_DB_URL;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query<{
      PaymentStartDate: string | null;
      StorePlanId: string | null;
    }>('SELECT "PaymentStartDate", "StorePlanId" FROM "Store" WHERE "Id" = $1', [storeId]);
    if (result.rowCount !== 1) {
      throw new Error(`owner-plan-change-dialog: expected exactly 1 Store row for ${storeId}`);
    }
    return {
      paymentStartDate: result.rows[0].PaymentStartDate,
      storePlanId: result.rows[0].StorePlanId === null ? null : Number(result.rows[0].StorePlanId),
    };
  } finally {
    await client.end();
  }
}

test('OwnerAdmin cambia el plan de su tienda desde el dialog (POST change-plan, ancla intacta)', async ({
  signedInPage,
  browser,
}) => {
  const { page, selectedStoreId } = signedInPage;

  // Captured BEFORE any mutation so afterAll can restore it even if a later
  // assertion throws.
  personaStoreId = selectedStoreId;

  // REQ-13/D9 — before anything else: a silent logout becomes a readable
  // failure instead of every downstream assertion failing for the wrong reason.
  await assertStoresFeature(page);

  // Precondition: free plan (fixture pins free-only modules AND a non-null
  // paymentStartDate — the anchor that must survive the change-plan POST).
  await degradeStoreToFreePlan(page, selectedStoreId);

  // Anchor BEFORE — pinned from the DB, not guessed from the UI.
  const before = await readStorePlanRow(selectedStoreId);

  await page.goto('/management/my-stores');

  // Free shape on the card (E-03 free half): plan label, no date line.
  await expect(page.getByTestId(`owner-store-body-${selectedStoreId}`)).toContainText(
    'Plan: Gratis',
  );

  // Open the plan popup: gear → "Editar el plan".
  await page.getByTestId(`owner-store-actions-toggle-${selectedStoreId}`).click();
  await page.getByTestId(`owner-store-edit-plan-${selectedStoreId}`).click();

  const modal = page.getByTestId(`owner-store-plan-modal-${selectedStoreId}`);
  await expect(modal).toBeVisible();

  // AD7: the owner CAN change the plan of their paid store — no readOnly lock.
  // The paid panel is collapsed (only the active FREE panel starts expanded);
  // expanding it renders "Activar Plan" (the new copy, es.ts ACTIVATE_PLAN).
  const paidHeader = modal.getByRole('button', { name: /Pago/ });
  await expect(paidHeader).toHaveAttribute('aria-expanded', 'false');
  await paidHeader.click();
  await expect(paidHeader).toHaveAttribute('aria-expanded', 'true');
  const activateButton = modal.getByRole('button', { name: 'Activar Plan' });
  await expect(activateButton).toBeVisible();

  // Install AFTER the DOM assertions so the POST it watches for is
  // unambiguously the activation click below (any-request-observer pattern,
  // login-offline.spec.ts).
  const observer = installPlanChangeObserver(page, selectedStoreId);

  await activateButton.click();

  // ── Wire contract ────────────────────────────────────────────────────────
  const capture = await observer.waitForChangePlanResponse();

  // ONE POST, body = exactly { storePlanId } — no store payload can ever ride
  // the activation (the backend owns module rewriting and the anchor).
  expect(capture.status).toBe(200);
  expect(capture.rawBody).not.toContain('moduleIds');
  expect(capture.rawBody).not.toContain('paymentStartDate');

  // The posted plan id is a real catalog plan id (the PAID plan's), not a module
  // list — pinned by reading the plan catalog through the same page session.
  const token = await readBearerToken(page);
  if (!token) {
    throw new Error('owner-plan-change-dialog: no bearer token on the page session.');
  }
  const planCatalogResponse = await page.request.get(`${E2E_API_URL}/v1/plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const plans = (await planCatalogResponse.json()) as {
    data?: Array<{ id: number; planType: string }>;
  };
  const paidPlan = plans.data?.find((p) => p.planType === 'Pago');
  if (!paidPlan) {
    throw new Error(
      'owner-plan-change-dialog: the plan catalog has no Pago plan — cannot pin the posted storePlanId.',
    );
  }
  expect(capture.storePlanId).toBe(paidPlan.id);

  // T7.1 regression: the old moduleIds PUT must not return.
  observer.expectNoStorePut();

  // ── Anchor sacred ─────────────────────────────────────────────────────────
  // PaymentStartDate is unchanged by the change-plan POST (design.md: the
  // anchor is never modified; only the payment registration may advance it).
  const after = await readStorePlanRow(selectedStoreId);
  // Compare serialized: the DB returns Date objects and `toBe` is object
  // identity — two Dates with the same instant never pass it (Grupo B fix).
  expect(after.paymentStartDate?.toISOString?.() ?? after.paymentStartDate).toBe(
    before.paymentStartDate?.toISOString?.() ?? before.paymentStartDate,
  );

  // ── Reflection without reload ─────────────────────────────────────────────
  // The modal closes and the card repaints as PAID: plan label + price line
  // back (my-stores.tsx handlePlanActivate: changeStorePlan → close → refresh →
  // load()).
  await expect(modal).not.toBeVisible();
  await expect(page.getByTestId(`owner-store-body-${selectedStoreId}`)).toContainText(
    'Plan: Pago',
    { timeout: 30_000 },
  );
  await expect(page.getByTestId(`owner-store-price-${selectedStoreId}`)).toBeVisible();

  // Exactly one POST fired for this store (no retry storm, no double activation).
  observer.expectExactlyOneChangePlanPost();

  // The store is left on Pago HERE on purpose (that is the assertion above);
  // `afterAll` restores it to its Superior birth plan afterwards, because the
  // persona store is shared by every test in this worker.
});
