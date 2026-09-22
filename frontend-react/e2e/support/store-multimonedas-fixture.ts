import type { Browser, Page } from '@playwright/test';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';
import { newTestIdentity, type TestIdentity } from './identity';
import { readSelectedStoreId } from './session';
import { E2E_API_URL } from './backend-url';
import { mintSuperAdmin } from './superadmin-session';

/**
 * NEW support file (store-payment-methods-config, T7 — MultiMonedas-POSITIVE
 * half, 2026-09-22). Mints a PRIVATE owner identity whose store ends up on
 * the Superior plan — the only legitimate plan carrying module 15
 * (MultiMonedas) — entirely through the app's own API:
 *
 *   1. Register + login the owner (own e2e-* identity; the existing global
 *      teardown cleans it — no shared persona is touched).
 *   2. Mint a SuperAdmin through the documented FC-D1 harness helper
 *      (`superadmin-session.ts` — fresh identity, promoted with the same
 *      direct-DB seeding the suite already uses for its SuperAdmin persona).
 *   3. POST /v1/stores/{id}/change-plan `{ storePlanId: 3 (Superior) }` with
 *      the SuperAdmin bearer. From `ChangeStorePlanCommandHandler.cs:97-101`,
 *      a non-SuperAdmin caller may only target Gratis/Pago — Superior/VIP are
 *      SuperAdmin-reserved, so this is the ONLY legitimate API caller that
 *      can put module 15 into a store. The store upgraded is the minted
 *      owner's OWN freshly-registered store.
 *   4. Pin the backend state through the API (GET /v1/stores/{id} → module 15
 *      active).
 *   5. Owner re-login → `/me` is fetched fresh and the session carries module
 *      15 (+ feature 43). `auth-store` never re-fetches `/me` on reload with
 *      a valid cache (session.ts), so re-login is the refresh path.
 *
 * No existing E2E file is modified; the only existing support exports reused
 * are `mintSuperAdmin` and the page-object classes, read-only.
 */

const SUPERIOR_PLAN_ID = 3; // StorePlanType.Superior (billing/spec.md; seed StorePlanModuleEntityTypeConfiguration.cs:52-67)
const MULTIMONEDAS_MODULE_ID = 15; // ModuleType.MultiMonedas (EModules.MultiMonedas, domain enums/index.ts:72)
const MULTIMONEDAS_FEATURE_ID = 43; // FeatureType.MultiMonedas (EFeatures.MultiMonedas, domain enums/index.ts:32)

interface ApiEnvelope<T> {
  data: T | null;
  succeeded: boolean;
  message: string | null;
}

export interface MultiMonedasOwnerMint {
  identity: TestIdentity;
  storeId: string;
}

/**
 * Mints the MultiMonedas owner. On success the given `page` is left signed in
 * as that owner with a FRESH session whose `storeModuleIds` includes module 15
 * and whose `featureIds` include feature 43 — preconditions loudly asserted up
 * front (noisy-failure pattern of `store-fixture.ts:228-256`), so a regression
 * in the mint fails with a diagnosable error, not a downstream assertion.
 */
export async function mintMultiMonedasOwner(
  page: Page,
  browser: Browser,
): Promise<MultiMonedasOwnerMint> {
  // 1. Register the owner (creates Owner + store on the Pago birth plan).
  const identity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/login$/);

  // 2. Login as the owner; the store id comes from the session (selectedStoreId).
  const loginPage = new LoginPage(page);
  await loginPage.fill(identity);
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);
  const storeId = await readSelectedStoreId(page);

  // 3. Mint the SuperAdmin persona (documented FC-D1 harness helper — its own
  //    context and identity, cleaned with all other e2e-* rows by teardown).
  const superAdmin = await mintSuperAdmin(browser);
  const bearer = superAdmin.localStorage.find((entry) => entry.name === 'token')?.value;
  if (!bearer) {
    throw new Error(
      'store-multimonedas-fixture: SuperAdmin snapshot has no `token` entry — the change-plan ' +
        'POST cannot be authorized. mintSuperAdmin() returned a session without a bearer token.',
    );
  }

  // 4. Plan upgrade through the app's own endpoint (owner callers are blocked
  //    from Superior/VIP; SuperAdmin is the legitimate path).
  const changePlan = await page.request.post(
    `${E2E_API_URL}/v1/stores/${storeId}/change-plan`,
    {
      headers: { Authorization: `Bearer ${bearer}` },
      data: { storePlanId: SUPERIOR_PLAN_ID },
    },
  );
  let changeBody: ApiEnvelope<boolean> | null = null;
  try {
    changeBody = (await changePlan.json()) as ApiEnvelope<boolean>;
  } catch {
    changeBody = null;
  }
  if (!changePlan.ok() || !changeBody?.succeeded) {
    throw new Error(
      `store-multimonedas-fixture: POST /v1/stores/${storeId}/change-plan failed (status ` +
        `${changePlan.status()}) while upgrading the minted store to Superior — the MultiMonedas ` +
        'precondition this spec relies on was not created.',
    );
  }

  // 5. Pin the backend state through the API (SuperAdmin GET — no permission gate).
  const pin = await page.request.get(`${E2E_API_URL}/v1/stores/${storeId}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  let pinBody: ApiEnvelope<{ modules: Array<{ id: number }> }> | null = null;
  try {
    pinBody = (await pin.json()) as ApiEnvelope<{ modules: Array<{ id: number }> }>;
  } catch {
    pinBody = null;
  }
  const moduleIds = (pinBody?.data?.modules ?? []).map((m) => m.id);
  if (!pin.ok() || !pinBody?.succeeded || !moduleIds.includes(MULTIMONEDAS_MODULE_ID)) {
    throw new Error(
      `store-multimonedas-fixture: GET /v1/stores/${storeId} after the plan change did not show ` +
        `module ${MULTIMONEDAS_MODULE_ID} (MultiMonedas) active — observed [${moduleIds.join(',')}]. ` +
        'The Superior precondition was not actually written to the store.',
    );
  }

  // 6. Fresh owner login → /me re-fetched, session carries the new module set.
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  const ownerRelogin = new LoginPage(page);
  await ownerRelogin.fill(identity);
  await ownerRelogin.submit();
  await page.waitForURL(/\/sales\/products$/);

  // 7. Session precondition: module 15 in storeModuleIds + feature 43 in featureIds.
  await assertMultiMonedasInSession(page);
  return { identity, storeId };
}

/**
 * Noisy precondition: `currentUser.storeModuleIds` must include module 15 and
 * `featureIds` feature 43 right after the owner re-login — without them the
 * CurrencySelect never renders (currency-select.tsx:40-42) and every downstream
 * assertion would fail for the wrong, undiagnosable reason.
 */
async function assertMultiMonedasInSession(page: Page): Promise<void> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error(
      'store-multimonedas-fixture: assertMultiMonedasInSession — localStorage.currentUser is ' +
        'empty after the owner re-login. Expected a fresh owner session before this guard runs.',
    );
  }
  let user: { storeModuleIds?: number[]; featureIds?: number[] };
  try {
    user = JSON.parse(raw) as typeof user;
  } catch (cause) {
    throw new Error(
      'store-multimonedas-fixture: assertMultiMonedasInSession — localStorage.currentUser is not ' +
        `valid JSON: ${cause instanceof Error ? cause.message : String(cause)}.`,
    );
  }
  const moduleIds = user.storeModuleIds ?? [];
  if (!moduleIds.includes(MULTIMONEDAS_MODULE_ID)) {
    throw new Error(
      `store-multimonedas-fixture: currentUser.storeModuleIds does not include ` +
        `${MULTIMONEDAS_MODULE_ID} (MultiMonedas) after the Superior plan change — observed ` +
        `[${moduleIds.join(',')}]. The owner session was not refreshed with the new module set.`,
    );
  }
  const featureIds = user.featureIds ?? [];
  if (!featureIds.includes(MULTIMONEDAS_FEATURE_ID)) {
    throw new Error(
      `store-multimonedas-fixture: currentUser.featureIds does not include ` +
        `${MULTIMONEDAS_FEATURE_ID} (FeatureType.MultiMonedas) after the Superior plan change — ` +
        `observed [${featureIds.join(',')}]. The StoreRoleFeatures were not generated for module 15.`,
    );
  }
}

/**
 * Payment-method combobox inside the expense modal WITH the MultiMonedas
 * module active: the dialog's comboboxes are type(0), currency(1), payment(2).
 * (The existing `expense-form-modal.ts` helper targets nth(1) for the
 * no-MultiMonedas layout — untouchable, so this companion helper documents the
 * index for the module-active layout.)
 */
export function multimonedasPaymentSelect(page: Page) {
  return page.getByRole('dialog').getByRole('combobox').nth(2);
}

/** Visible option labels of the payment select with the module active. */
export async function multimonedasPaymentOptions(page: Page): Promise<string[]> {
  return multimonedasPaymentSelect(page).locator('option').allTextContents();
}