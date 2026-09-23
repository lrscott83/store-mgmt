import type { Browser, BrowserContext, Page } from '@playwright/test';
import { LoginPage } from './login-page';
import { RegisterPage } from './register-page';
import { newTestIdentity, type TestIdentity } from './identity';
import { readSelectedStoreId } from './session';
import { seedCategoryAndProduct } from './store-seed';
import { E2E_API_URL } from './backend-url';
import { mintSuperAdmin } from './superadmin-session';

/**
 * WholesaleSuperior persona — E2E Playwright support
 * (wholesale-superior-vip-only, 2026-09-23)
 *
 * Ventas Mayoristas is ONLY available on the Superior (3) / VIP (4) plans.
 * The self-registered store (Pago birth plan) can never hold module 12, so
 * the `/sales/wholesale` gate and the sidebar entry now require module 12 +
 * feature 39 in the session — and that state can only be reached by upgrading
 * the store through the app's OWN `change-plan` endpoint with a SuperAdmin
 * caller (`ChangeStorePlanCommandHandler.cs:97-101`), the only legitimate
 * path to Superior/VIP.
 *
 * Mints a PRIVATE owner whose store is upgraded to Superior. Mirrors the
 * `mintMultiMonedasOwner` plan-upgrade steps (register → login → SuperAdmin
 * mint → change-plan → pin backend module → fresh owner re-login → noisy
 * session assertion) and the `owner-admin-with-products` two-context seeding:
 *
 *   Context A (real logins): register + login the owner, mint the SuperAdmin,
 *   POST change-plan {storePlanId: 3}, pin module 12 via GET /v1/stores/{id},
 *   re-login the owner, assert module 12 + feature 39 in the fresh session,
 *   capture the session snapshot. Products are NOT seeded here — a real
 *   login holds the DEK in memory, so entities written now would be
 *   ciphertext (`enc:v1:`) and the capture filter drops them (the same
 *   honesty rule documented in session.ts:148-159).
 *
 *   Context B (no DEK): restore the snapshot on a fresh context, seed one
 *   category + one sellable product through the REAL UI (`seedCategoryAndProduct`,
 *   zero network — GlobalConfig.USE_ONLINE_SERVICE = false, store-seed.ts), so
 *   their bytes are honest plaintext and survive capture, then re-derive the
 *   home path the runtime way (visit /login, let guestOnlyLoader's
 *   resolveUserHomePath decide, just like A7/D6).
 *
 * Costs per mint: 2 registrations + 3-4 real logins. Each spec file mints
 * ONCE in `test.beforeAll` and replays the snapshot per test (zero logins),
 * the same discipline superadmin-session.ts already applies.
 */

const SUPERIOR_PLAN_ID = 3;
const WHOLESALE_MODULE_ID = 12;
const WHOLESALE_FEATURE_ID = 39;

export interface WholesaleSnapshot {
  localStorage: Array<{ name: string; value: string }>;
  identity: TestIdentity;
  selectedStoreId: string;
  homePath: string;
}

interface ApiEnvelope<T> {
  succeeded: boolean;
  data?: T;
}

async function captureSnapshot(
  context: BrowserContext,
  page: Page,
  identity: TestIdentity,
  selectedStoreId: string,
  homePath: string,
): Promise<WholesaleSnapshot> {
  const state = await context.storageState();
  const origin = new URL(page.url()).origin;
  const originState = state.origins.find((o) => o.origin === origin);
  if (!originState) {
    throw new Error(
      `store-wholesale-fixture: no localStorage captured for origin ${origin} — the minted ` +
        'Superior login this snapshot depends on failed silently.',
    );
  }
  // Same filter as session.ts captureSnapshot: the DEK localStorage half is
  // never captured (the CryptoKey half is non-extractable), and ciphertext
  // business entities (`enc:v1:`) are dropped — a restored context has no
  // DEK and would log the user out with KEY_UNAVAILABLE on first read.
  const localStorage = originState.localStorage.filter(
    (entry) =>
      entry.name !== 'lizoft.device-dek' &&
      !(entry.name.startsWith('lizoft.store-') && entry.value.startsWith('enc:v1:')),
  );
  return { localStorage, identity, selectedStoreId, homePath };
}

/** Replays a minted wholesale snapshot onto `page` (same shape as applySnapshot in session.ts). */
export async function applyWholesaleSnapshot(page: Page, snapshot: WholesaleSnapshot): Promise<void> {
  await page.goto('/login');
  await page.evaluate((entries) => {
    for (const { name, value } of entries) {
      window.localStorage.setItem(name, value);
    }
  }, snapshot.localStorage);
  await page.goto(snapshot.homePath);
}

/**
 * Noisy precondition: after the owner re-login, `currentUser.storeModuleIds`
 * must include module 12 and `featureIds` feature 39 — without them neither
 * the route gate nor the sidebar entry would open and every downstream
 * assertion would fail for the wrong, undiagnosable reason.
 */
async function assertWholesaleInSession(page: Page): Promise<void> {
  const raw = await page.evaluate(() => window.localStorage.getItem('currentUser'));
  if (!raw) {
    throw new Error(
      'store-wholesale-fixture: assertWholesaleInSession — localStorage.currentUser is empty ' +
        'after the owner re-login. Expected a fresh Superior owner session.',
    );
  }
  let user: { storeModuleIds?: number[]; featureIds?: number[] };
  try {
    user = JSON.parse(raw) as typeof user;
  } catch (cause) {
    throw new Error(
      'store-wholesale-fixture: assertWholesaleInSession — localStorage.currentUser is not ' +
        `valid JSON: ${cause instanceof Error ? cause.message : String(cause)}.`,
    );
  }
  const moduleIds = user.storeModuleIds ?? [];
  if (!moduleIds.includes(WHOLESALE_MODULE_ID)) {
    throw new Error(
      `store-wholesale-fixture: currentUser.storeModuleIds does not include ` +
        `${WHOLESALE_MODULE_ID} (WholesaleSales) after the Superior plan change — observed ` +
        `[${moduleIds.join(',')}]. The owner session was not refreshed with the new module set.`,
    );
  }
  const featureIds = user.featureIds ?? [];
  if (!featureIds.includes(WHOLESALE_FEATURE_ID)) {
    throw new Error(
      `store-wholesale-fixture: currentUser.featureIds does not include ` +
        `${WHOLESALE_FEATURE_ID} (FeatureType.WholesaleSales) after the Superior plan change — ` +
        `observed [${featureIds.join(',')}]. The StoreRoleFeatures were not generated for module 12.`,
    );
  }
}

/**
 * Mints the WholesaleSuperior owner (Superior plan, module 12 + feature 39)
 * with one plaintext seeded category + sellable product. Returns a snapshot
 * ready to replay onto any test page — zero logins per restored test.
 */
export async function mintWholesaleSuperiorOwner(browser: Browser): Promise<WholesaleSnapshot> {
  // ── Context A: real mint (2 registrations + 3-4 logins) ────────────────
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Register the owner (Pago birth plan — module 12 NOT included yet).
  const identity = newTestIdentity();
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/login$/);

  // 2. Login as the owner; the store id comes from the session.
  const loginPage = new LoginPage(page);
  await loginPage.fill(identity);
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);
  const storeId = await readSelectedStoreId(page);

  // 3. Mint the SuperAdmin persona (FC-D1 documented helper — its own
  //    context and identity, cleaned with all other e2e-* rows by teardown).
  const superAdmin = await mintSuperAdmin(browser);
  const bearer = superAdmin.localStorage.find((entry) => entry.name === 'token')?.value;
  if (!bearer) {
    throw new Error(
      'store-wholesale-fixture: SuperAdmin snapshot has no `token` entry — the change-plan ' +
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
      `store-wholesale-fixture: POST /v1/stores/${storeId}/change-plan failed (status ` +
        `${changePlan.status()}) while upgrading the minted store to Superior — the WholesaleSales ` +
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
  if (!pin.ok() || !pinBody?.succeeded || !moduleIds.includes(WHOLESALE_MODULE_ID)) {
    throw new Error(
      `store-wholesale-fixture: GET /v1/stores/${storeId} after the plan change did not show ` +
        `module ${WHOLESALE_MODULE_ID} (WholesaleSales) active — observed [${moduleIds.join(',')}]. ` +
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

  // 7. Session precondition: module 12 in storeModuleIds + feature 39 in featureIds.
  await assertWholesaleInSession(page);

  // The owner has NO products yet, so the runtime home path is /sales/products.
  const sessionSnapshot = await captureSnapshot(
    context,
    page,
    identity,
    storeId,
    '/sales/products',
  );
  await context.close();

  // ── Context B: seed the product WITHOUT a DEK so it stays honest plaintext ─
  const seedContext = await browser.newContext();
  const seedPage = await seedContext.newPage();
  await applyWholesaleSnapshot(seedPage, sessionSnapshot);

  await seedCategoryAndProduct(seedPage, `E2E Product ${identity.login}`);
  await seedPage.goto('/login');
  await seedPage.waitForURL(/\/sales\/new$/);
  const homePath = new URL(seedPage.url()).pathname;

  const snapshot = await captureSnapshot(seedContext, seedPage, identity, storeId, homePath);
  await seedContext.close();
  return snapshot;
}